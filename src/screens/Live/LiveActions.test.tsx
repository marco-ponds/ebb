import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastHost } from '../../components';
import { rateContraction, startContraction, stopContraction } from '../../db/contractions';
import { addEvent } from '../../db/events';
import { setRetryDelays } from '../../db/queue';
import { getDb } from '../../db/schema';
import { startSession } from '../../db/sessions';
import { updateSettings } from '../../db/settings';
import { dropDb, freshDb } from '../../db/testDb';
import type { Session } from '../../db/types';
import { GENTLE_PROMPT } from '../../domain/events';
import { initStore, teardownStore, useAppStore } from '../../state/store';
import { LiveScreen } from '.';

vi.mock('../../db/events', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../db/events')>();
  return { ...real, addEvent: vi.fn(real.addEvent) };
});
vi.mock('../../db/contractions', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../db/contractions')>();
  return { ...real, rateContraction: vi.fn(real.rateContraction) };
});

const MIN = 60_000;
const hero = () => screen.getByTestId('hero');
const tapHero = async () => {
  await userEvent.click(within(hero()).getByRole('button'));
};
const pause = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

beforeEach(async () => {
  await freshDb();
  setRetryDelays([0, 0, 0]);
  await initStore();
});
afterEach(async () => {
  teardownStore();
  window.location.hash = '';
  await dropDb();
});

async function openLive(): Promise<Session> {
  const s = await startSession(Date.now() - 20 * MIN);
  await waitFor(() => expect(useAppStore.getState().activeSession?.id).toBe(s.id));
  render(
    <>
      <LiveScreen />
      <ToastHost />
    </>,
  );
  return s;
}

/** Starts and stops one contraction through the hero, so the strength card opens. */
async function tapOnce() {
  await tapHero();
  await waitFor(() => expect(hero()).toHaveAttribute('data-state', 'contracting'));
  await pause(650);
  await tapHero();
  await waitFor(() => expect(hero()).toHaveAttribute('data-state', 'resting'));
}

describe('strength picker (LT-08)', () => {
  it('opens when a contraction ends, hides the insights, and saves the chosen strength', async () => {
    await openLive();
    await tapOnce();
    const picker = await screen.findByRole('radiogroup', { name: 'How strong was that one?' });
    expect(screen.queryByText('Time apart')).not.toBeInTheDocument();
    expect(screen.queryByText('Last 30 min')).not.toBeInTheDocument();
    expect(screen.queryByText('Press and hold to end session')).not.toBeInTheDocument();
    await userEvent.click(within(picker).getByRole('radio', { name: 'Strong' }));
    await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'How strong was that one?' })).not.toBeInTheDocument());
    expect((await getDb().contractions.toArray())[0].intensity).toBe(6);
    expect(screen.getByText('Time apart')).toBeInTheDocument();
  });

  it('Skip closes it without rating', async () => {
    await openLive();
    await tapOnce();
    await userEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    expect(screen.queryByRole('radiogroup', { name: 'How strong was that one?' })).not.toBeInTheDocument();
    expect((await getDb().contractions.toArray())[0].intensity).toBeNull();
  });

  it('closes immediately when a new contraction starts', async () => {
    await openLive();
    await tapOnce();
    await screen.findByRole('radiogroup', { name: 'How strong was that one?' });
    await pause(650);
    await tapHero();
    await waitFor(() => expect(hero()).toHaveAttribute('data-state', 'contracting'));
    expect(screen.queryByRole('radiogroup', { name: 'How strong was that one?' })).not.toBeInTheDocument();
  });

  it('follows the scale setting: numeric shows 1 to 10 only', async () => {
    await updateSettings({ intensityScale: 'numeric' });
    await openLive();
    await tapOnce();
    const picker = await screen.findByRole('radiogroup', { name: 'How strong was that one?' });
    expect(within(picker).getAllByRole('radio')).toHaveLength(10);
    expect(within(picker).queryByRole('radio', { name: 'Mild' })).not.toBeInTheDocument();
  });

  it('is not offered when the contraction is discarded', async () => {
    await openLive();
    await tapHero();
    await waitFor(() => expect(hero()).toHaveAttribute('data-state', 'contracting'));
    await userEvent.click(screen.getByRole('button', { name: 'Started by mistake' }));
    await waitFor(() => expect(hero()).toHaveAttribute('data-state', 'resting'));
    expect(screen.queryByRole('radiogroup', { name: 'How strong was that one?' })).not.toBeInTheDocument();
  });
});

describe('when the strength card opens', () => {
  it('never opens for contractions that were already finished', async () => {
    const s = await startSession(Date.now() - 20 * MIN);
    await waitFor(() => expect(useAppStore.getState().activeSession?.id).toBe(s.id));
    const c = await startContraction(s.id, Date.now() - 5 * MIN);
    await stopContraction(c.id, Date.now() - 4 * MIN);
    render(<LiveScreen />);
    await screen.findByText('Time apart');
    expect(screen.queryByRole('radiogroup', { name: 'How strong was that one?' })).not.toBeInTheDocument();
  });

  it('does not open for a stop made outside this view (another window)', async () => {
    const s = await openLive();
    const c = await startContraction(s.id, Date.now() - 2000);
    await waitFor(() => expect(hero()).toHaveAttribute('data-state', 'contracting'));
    await stopContraction(c.id, Date.now());
    await waitFor(() => expect(hero()).toHaveAttribute('data-state', 'resting'));
    expect(screen.queryByRole('radiogroup', { name: 'How strong was that one?' })).not.toBeInTheDocument();
  });

  it('opens after "Ended earlier" saves a stop', async () => {
    const s = await startSession(Date.now() - 30 * MIN);
    await waitFor(() => expect(useAppStore.getState().activeSession?.id).toBe(s.id));
    await startContraction(s.id, Date.now() - 8 * MIN);
    render(<LiveScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ended earlier…' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('radiogroup', { name: 'How strong was that one?' })).toBeInTheDocument();
  });
});

describe('refused writes stay quiet and recoverable', () => {
  it('a failed rating shows a quiet toast and raises no unhandled rejection', async () => {
    await openLive();
    await tapOnce();
    vi.mocked(rateContraction).mockRejectedValueOnce(new Error('gone'));
    await userEvent.click(await screen.findByRole('radio', { name: 'Mild' }));
    expect(await screen.findByText("That didn't save — try again.")).toBeInTheDocument();
  });

  it('a failed event save re-enables Save, says so, and keeps what was typed', async () => {
    await openLive();
    await userEvent.click(screen.getByRole('button', { name: 'Event' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add an event' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Note' }));
    await userEvent.type(within(dialog).getByLabelText('Note (optional)'), 'had a bath');
    vi.mocked(addEvent).mockRejectedValueOnce(new Error('locked'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText("That didn't save — try again.")).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(within(dialog).getByLabelText('Note (optional)')).toHaveValue('had a bath');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/^Saved · Note, \d\d:\d\d$/)).toBeInTheDocument();
  });
});

describe('Undo and Started by mistake (LT-10)', () => {
  it('Undo is aria-disabled and inert when there is nothing to undo', async () => {
    await openLive();
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(undo);
    expect(screen.queryByText('Undone')).not.toBeInTheDocument();
  });

  it('Undo after a stop restores the contraction to in-progress and shows "Undone"', async () => {
    await openLive();
    await tapOnce();
    await userEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    const before = (await getDb().contractions.toArray())[0];
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toHaveAttribute('aria-disabled', 'false');
    await userEvent.click(undo);
    await waitFor(() => expect(hero()).toHaveAttribute('data-state', 'contracting'));
    const after = (await getDb().contractions.toArray())[0];
    expect(after.startAt).toBe(before.startAt);
    expect(after.endAt).toBeNull();
    expect(await screen.findByText('Undone')).toBeInTheDocument();
  });

  it('Started by mistake discards the contraction with no confirmation', async () => {
    await openLive();
    await tapHero();
    await waitFor(() => expect(hero()).toHaveAttribute('data-state', 'contracting'));
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Started by mistake' }));
    await waitFor(() => expect(hero()).toHaveAttribute('data-state', 'resting'));
    expect(await getDb().contractions.count()).toBe(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Event sheet (LT-12)', () => {
  it('saves a Waters broke event, then shows the confirmation and the gentle prompt until Done', async () => {
    const s = await openLive();
    await userEvent.click(screen.getByRole('button', { name: 'Event' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add an event' });
    expect(within(dialog).getAllByRole('radio')).toHaveLength(6);
    expect(within(dialog).queryByRole('radio', { name: 'Clear' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Waters broke' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Green or brown' }));
    await userEvent.type(within(dialog).getByLabelText('Note (optional)'), '  fluid  ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    const done = await within(dialog).findByRole('button', { name: 'Done' });
    expect(within(dialog).getByText(/^Saved · Waters broke, green or brown, \d\d:\d\d$/)).toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent(GENTLE_PROMPT);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    const rows = await getDb().events.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sessionId: s.id, type: 'waters', details: 'green-brown', note: 'fluid' });

    await userEvent.click(done);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows no prompt for clear waters or a called midwife, and keeps Esc working after the swap', async () => {
    await openLive();
    await userEvent.click(screen.getByRole('button', { name: 'Event' }));
    let dialog = await screen.findByRole('dialog', { name: 'Add an event' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Waters broke' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Clear' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await within(dialog).findByRole('button', { name: 'Done' });
    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(GENTLE_PROMPT)).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Event' }));
    dialog = await screen.findByRole('dialog', { name: 'Add an event' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Called midwife' }));
    expect(within(dialog).queryByRole('radiogroup', { name: 'Colour' })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/^Saved · Called midwife, \d\d:\d\d$/)).toBeInTheDocument();
    expect(screen.queryByText(GENTLE_PROMPT)).not.toBeInTheDocument();
  });
});

describe('Share (LT-13) and end session (LT-14)', () => {
  it('opens the summary sheet with the last-hour text', async () => {
    const s = await openLive();
    const start = Date.now() - 10 * MIN;
    const c = await startContraction(s.id, start);
    await stopContraction(c.id, start + 60_000);
    await userEvent.click(await screen.findByRole('button', { name: 'Share' }));
    const dialog = await screen.findByRole('dialog', { name: 'Share summary' });
    expect(within(dialog).getByText('Last hour: 1 contraction, lasting about 60 s.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('a click on the end control without a hold (assistive tech) opens the End this session sheet', async () => {
    await openLive();
    const end = screen.getByRole('button', { name: 'Press and hold to end session' });
    end.click(); // detail 0, as a screen reader's activation
    expect(await screen.findByRole('dialog', { name: 'End this session?' })).toBeInTheDocument();
    expect(await getDb().sessions.count()).toBe(1);
  });

  it('hides the end control while contracting', async () => {
    await openLive();
    await tapHero();
    await waitFor(() => expect(hero()).toHaveAttribute('data-state', 'contracting'));
    expect(screen.queryByRole('button', { name: 'Press and hold to end session' })).not.toBeInTheDocument();
  });
});
