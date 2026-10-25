import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastHost, useToastStore } from '../../components';
import { addMissedContraction, deleteContraction } from '../../db/contractions';
import { addEvent } from '../../db/events';
import { endSession, startSession } from '../../db/sessions';
import { updateSettings } from '../../db/settings';
import { dropDb, freshDb } from '../../db/testDb';
import { getDb } from '../../db/schema';
import * as share from '../../lib/share';
import { initStore, teardownStore } from '../../state/store';
import { installPointerEvent } from '../../charts/pointerPolyfill';
import * as sessions from '../../db/sessions';
import { SessionDetailScreen } from '.';

vi.mock('../../db/contractions', async (orig) => {
  const m = await orig<typeof import('../../db/contractions')>();
  return { ...m, deleteContraction: vi.fn(m.deleteContraction) };
});

const unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => unhandled.push(e);

const at = (h: number, m: number, s = 0) => new Date(2026, 9, 24, h, m, s).getTime();
const MIN = 60_000;
const T0 = at(21, 40);
const T1 = at(23, 59);

async function seed(count: number, opts: { ended?: boolean; durationMs?: number; intensity?: number | null } = {}) {
  const s = await startSession(T0);
  for (let i = 0; i < count; i++) {
    await addMissedContraction(s.id, {
      startAt: T0 + (i + 1) * 5 * MIN,
      durationMs: opts.durationMs ?? 50_000,
      intensity: opts.intensity === undefined ? 6 : opts.intensity,
    });
  }
  if (opts.ended !== false) await endSession(s.id, T1);
  return s;
}

const boot = async (id: string) => {
  await initStore();
  render(
    <>
      <SessionDetailScreen id={id} />
      <ToastHost />
    </>,
  );
  await screen.findByRole('heading', { level: 1 });
};

beforeEach(async () => {
  installPointerEvent();
  unhandled.length = 0;
  process.on('unhandledRejection', onUnhandled);
  window.history.replaceState(null, '', '/');
  await freshDb();
  await updateSettings({ onboardedAt: 1 });
});
afterEach(async () => {
  process.off('unhandledRejection', onUnhandled);
  vi.restoreAllMocks();
  vi.useRealTimers();
  useToastStore.setState({ toast: null });
  teardownStore();
  await dropDb();
});

describe('unknown session', () => {
  it('says so and offers Back', async () => {
    await initStore();
    render(<SessionDetailScreen id="nope" />);
    expect(await screen.findByText("This session isn't here any more")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(window.location.hash).toBe('#/history');
  });
});

describe('header (SD-01)', () => {
  it('shows the default name, the subline and Back / Export', async () => {
    const s = await seed(3);
    await boot(s.id);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Saturday night');
    expect(screen.getByText('Sat 24 Oct · 21:40–23:59 · 2 h 19 m')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(window.location.hash).toBe('#/history');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    const dialog = screen.getByRole('dialog', { name: 'Export' });
    expect(within(dialog).getByRole('button', { name: 'PDF report' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'CSV data' })).toBeInTheDocument();
  });

  it('renames on Enter, cancels on Escape and stores an empty name as null', async () => {
    const s = await seed(3);
    await boot(s.id);
    await userEvent.click(screen.getByRole('button', { name: /Rename/ }));
    await userEvent.type(screen.getByLabelText('Session name'), 'Saturday morning{Enter}');
    await waitFor(async () => expect((await getDb().sessions.get(s.id))?.name).toBe('Saturday morning'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Saturday morning');

    await userEvent.click(screen.getByRole('button', { name: /Rename/ }));
    await userEvent.type(screen.getByLabelText('Session name'), ' nope{Escape}');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Saturday morning');
    expect((await getDb().sessions.get(s.id))?.name).toBe('Saturday morning');

    await userEvent.click(screen.getByRole('button', { name: /Rename/ }));
    await userEvent.clear(screen.getByLabelText('Session name'));
    await userEvent.tab();
    await waitFor(async () => expect((await getDb().sessions.get(s.id))?.name).toBeNull());
  });
});

describe('summary and pattern (SD-02, SD-03)', () => {
  it('shows whole-session captions once ended and the strength as n/10', async () => {
    const s = await seed(8);
    await boot(s.id);
    const stats = screen.getByRole('region', { name: 'Summary' });
    expect(stats).toHaveTextContent('Contractions8whole session');
    expect(stats).toHaveTextContent('Time apart5mavg, whole session');
    expect(stats).toHaveTextContent('Lasting50savg, whole session');
    expect(stats).toHaveTextContent('Strength6/10avg, whole session');
  });

  it('shows — and the empty pattern state below 4 contractions', async () => {
    const s = await seed(3);
    await boot(s.id);
    expect(screen.getByRole('region', { name: 'Summary' })).toHaveTextContent('Time apart—');
    expect(screen.getByText('Not enough yet to describe a pattern')).toBeInTheDocument();
  });

  it('describes a regular pattern with a three-step meter and progression rows', async () => {
    const s = await seed(10);
    await boot(s.id);
    expect(screen.getByRole('heading', { name: 'Regular' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Regular: 3 of 3' })).toBeInTheDocument();
    expect(screen.getByText(/^Every 5 min over the last hour/)).toBeInTheDocument();
    expect(screen.getByText('Time apart', { selector: 'dt' }).closest('div')).toHaveTextContent('steady');
    expect(screen.getByText('Length', { selector: 'dt' }).closest('div')).toHaveTextContent('steady');
  });
});

describe('charts (SD-05)', () => {
  it('draws five charts with sentence summaries and the unrated count', async () => {
    const s = await seed(6, { intensity: null });
    await boot(s.id);
    expect(screen.getAllByRole('img').filter((el) => el.tagName.toLowerCase() === 'svg')).toHaveLength(5);
    expect(screen.getByText('out of 10 · 6 not rated')).toBeInTheDocument();
    expect(screen.getByText('width = length · height = strength')).toBeInTheDocument();
  });

  it('draws trend lines only with 4 or more contractions', async () => {
    const few = await seed(3);
    await boot(few.id);
    expect(document.querySelector('[data-line]')).toBeNull();
    cleanupRender();
    const many = await seed(6);
    await boot(many.id);
    expect(document.querySelector('[data-line="lasting"]')).not.toBeNull();
  });

  it('marks events in the timeline legend', async () => {
    const s = await seed(4);
    await addEvent(s.id, { type: 'note', at: at(22, 20), note: 'had a bath' });
    await addEvent(s.id, { type: 'waters', at: at(23, 0), details: 'clear' });
    await boot(s.id);
    expect(await screen.findByText('N · note: had a bath')).toBeInTheDocument();
    expect(screen.getByText('W · waters, clear')).toBeInTheDocument();
  });
});

function cleanupRender() {
  document.body.innerHTML = '';
}

describe('log (SD-06)', () => {
  it('lists the latest 8 rows newest first, then every entry on demand', async () => {
    const s = await seed(12);
    await addEvent(s.id, { type: 'called-midwife', at: at(22, 52) });
    await boot(s.id);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Start', 'Lasting', 'Apart', 'Str.', 'Actions']);
    const body = () => within(table).getAllByRole('row').slice(1);
    expect(body()).toHaveLength(8);
    expect(body()[0]).toHaveTextContent('Called midwife');
    expect(body()[1]).toHaveTextContent('22:40');
    await userEvent.click(screen.getByRole('button', { name: 'Show all 13 entries' }));
    expect(body()).toHaveLength(13);
    expect(table).toHaveTextContent('Called midwife');
  });

  it('formats strength by the Settings scale and tags flagged rows', async () => {
    await updateSettings({ intensityScale: 'words' });
    const s = await seed(5);
    const short = await addMissedContraction(s.id, { startAt: at(23, 30), durationMs: 3000 });
    await getDb().contractions.update(short.id, { reviewed: false });
    await boot(s.id);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('very short');
    expect(rows[2]).toHaveTextContent('Strong');
  });

  it('deletes from the edit sheet with a Deleted · Undo toast that restores the row', async () => {
    const s = await seed(5);
    await boot(s.id);
    const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows()).toHaveLength(5);
    await userEvent.click(within(rows()[0]).getByRole('button', { name: /Edit contraction/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(rows()).toHaveLength(4));
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Deleted · Undo');
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(rows()).toHaveLength(5));
  });
});

describe('edit sheet (J6)', () => {
  const openFirst = async () => {
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    await userEvent.click(within(rows[0]).getByRole('button', { name: /Edit contraction/ }));
    return screen.getByRole('dialog', { name: 'Edit contraction' });
  };

  it('disables Save with a hint when the end is not after the start', async () => {
    const s = await seed(5);
    await boot(s.id);
    const dialog = await openFirst();
    fireEvent.change(within(dialog).getByLabelText('End'), { target: { value: '22:00' } });
    expect(within(dialog).getByText('The end needs to be after the start')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('rejects an overlap inline, naming the other contraction', async () => {
    const s = await seed(5);
    await boot(s.id);
    const dialog = await openFirst(); // the 22:05 one
    fireEvent.change(within(dialog).getByLabelText('Start'), { target: { value: '22:00' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Overlaps the one at 22:00')).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Edit contraction' })).toBeInTheDocument();
  });

  it('saves new values, shows Saved · Undo and updates the log', async () => {
    const s = await seed(5);
    await boot(s.id);
    const dialog = await openFirst();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Intense' }));
    await userEvent.type(within(dialog).getByLabelText('Note'), 'sore back');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('Saved · Undo');
    const first = within(screen.getByRole('table')).getAllByRole('row')[1];
    await waitFor(() => expect(first).toHaveTextContent('Intense'));
    const rows = await getDb().contractions.toArray();
    expect(rows.find((c) => c.note === 'sore back')?.intensity).toBe(10);
  });

  it('edits an event: type, details, time, note', async () => {
    const s = await seed(4);
    await addEvent(s.id, { type: 'waters', at: at(22, 30), details: 'clear' });
    await boot(s.id);
    const row = within(screen.getByRole('table')).getAllByRole('row').find((r) => r.textContent?.includes('Waters broke'))!;
    await userEvent.click(within(row).getByRole('button', { name: /Edit Waters broke/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit event' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Pink' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await getDb().events.toArray())[0].details).toBe('pink'));
  });
});

describe('add a missed contraction (SD-07)', () => {
  it('adds one that slots into order', async () => {
    const s = await seed(4);
    await boot(s.id);
    await userEvent.click(screen.getByRole('button', { name: 'Add a missed contraction' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a missed contraction' });
    fireEvent.change(within(dialog).getByLabelText('Start time'), { target: { value: '22:07' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const starts = within(screen.getByRole('table'))
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.querySelector('td')?.textContent);
    expect(starts).toEqual(['22:07', '22:00', '21:55', '21:50', '21:45']);
  });

  it('rejects an overlap inline', async () => {
    const s = await seed(4);
    await boot(s.id);
    await userEvent.click(screen.getByRole('button', { name: 'Add a missed contraction' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Start time'), { target: { value: '21:45' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Overlaps the one at 21:45')).toBeVisible();
  });
});

describe('notes (SD-08)', () => {
  it('autosaves 500 ms after the last keystroke', async () => {
    const s = await seed(3);
    await boot(s.id);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const box = screen.getByLabelText('Notes');
    fireEvent.change(box, { target: { value: 'Call back at ten' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect((await getDb().sessions.get(s.id))?.notes).toBe('');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    await vi.waitFor(async () => expect((await getDb().sessions.get(s.id))?.notes).toBe('Call back at ten'));
  });
});

describe('export (SD-09, SH-03)', () => {
  it('CSV data saves ebb-session-YYYY-MM-DD.csv with the exact header', async () => {
    const save = vi.spyOn(share, 'saveFile').mockResolvedValue('downloaded');
    const s = await seed(3);
    await boot(s.id);
    await userEvent.click(screen.getByRole('button', { name: 'CSV data' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const [blob, name] = save.mock.calls[0];
    expect(name).toBe('ebb-session-2026-10-24.csv');
    expect(blob.type).toBe('text/csv');
    expect((await blob.text()).split('\r\n')[0]).toBe('type,start,end,duration_s,interval_s,intensity,note');
  });

  it('Share summary opens the summary sheet with the whole-session text once ended', async () => {
    const s = await seed(3);
    await boot(s.id);
    await userEvent.click(screen.getByRole('button', { name: 'Share summary' }));
    expect(screen.getByRole('dialog', { name: 'Share summary' })).toHaveTextContent(/Whole session: 3 contractions/);
  });
});

describe('rest and interval (SD-05)', () => {
  it('the edit sheet shows a read-only interval and rest', async () => {
    const s = await seed(5);
    await boot(s.id);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    await userEvent.click(within(rows[0]).getByRole('button', { name: /Edit contraction/ }));
    expect(within(screen.getByRole('dialog')).getByTestId('timing')).toHaveTextContent('Interval 5m · Rest 4m 10s');
  });

  it('the first contraction shows — for both', async () => {
    const s = await seed(5);
    await boot(s.id);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    await userEvent.click(within(rows[4]).getByRole('button', { name: /Edit contraction/ }));
    expect(within(screen.getByRole('dialog')).getByTestId('timing')).toHaveTextContent('Interval — · Rest —');
  });

  it('chart tooltips carry interval and rest', async () => {
    const s = await seed(6);
    await boot(s.id);
    fireEvent.click(document.querySelectorAll('[data-bar-id]')[3]);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Interval 5mRest 4m 10s');
    fireEvent.pointerEnter(document.querySelector('[data-point^="lasting"]')!);
    expect(screen.getAllByRole('tooltip').pop()).toHaveTextContent(/Interval/);
  });
});

describe('quiet failures', () => {
  const swipe = (row: HTMLElement) => {
    fireEvent.pointerDown(row, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(row, { clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(row, { clientX: 100, pointerId: 1 });
  };

  it('a failed swipe-delete shows a quiet toast and leaves the row', async () => {
    const s = await seed(5);
    await boot(s.id);
    vi.mocked(deleteContraction).mockRejectedValueOnce(new Error('disk full'));
    const row = within(screen.getByRole('table')).getAllByRole('row')[1];
    swipe(row);
    await userEvent.click(await within(row).findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Couldn't delete that. Please try again."));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(6);
    await new Promise((r) => setTimeout(r, 20));
    expect(unhandled).toEqual([]);
  });

  it('a cancelled CSV share is ignored without an unhandled rejection or toast', async () => {
    vi.spyOn(share, 'saveFile').mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    const s = await seed(3);
    await boot(s.id);
    await userEvent.click(screen.getByRole('button', { name: 'CSV data' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(unhandled).toEqual([]);
  });

  it('a failed CSV save says so quietly', async () => {
    vi.spyOn(share, 'saveFile').mockRejectedValue(new Error('no space'));
    const s = await seed(3);
    await boot(s.id);
    await userEvent.click(screen.getByRole('button', { name: 'CSV data' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Couldn't save the CSV. Please try again."));
    expect(unhandled).toEqual([]);
  });

  it('a failed rename shows a toast', async () => {
    const s = await seed(3);
    await boot(s.id);
    vi.spyOn(sessions, 'renameSession').mockRejectedValue(new Error('x'));
    await userEvent.click(screen.getByRole('button', { name: /Rename/ }));
    await userEvent.type(screen.getByLabelText('Session name'), 'New{Enter}');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Couldn't save the name. Please try again."));
    expect(unhandled).toEqual([]);
  });

  it('failed notes autosave shows a toast', async () => {
    const s = await seed(3);
    await boot(s.id);
    vi.spyOn(sessions, 'setSessionNotes').mockRejectedValue(new Error('x'));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Couldn't save your notes. Please try again."), { timeout: 2000 });
    expect(unhandled).toEqual([]);
  });
});
