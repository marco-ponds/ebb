import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../../components';
import { startContraction, stopContraction } from '../../db/contractions';
import { endSession, startSession } from '../../db/sessions';
import { updateSettings } from '../../db/settings';
import { dropDb, freshDb } from '../../db/testDb';
import * as share from '../../lib/share';
import { initStore, teardownStore, useAppStore } from '../../state/store';
import { StartScreen } from '.';

const SAFETY = "This app records contractions. It doesn't give medical advice — if you're worried, contact your midwife or maternity unit.";
const DAY = 86_400_000;
// Tue 20 Oct 2026, 19:05 local, to 23:40.
const T0 = new Date(2026, 9, 20, 19, 5).getTime();
const T1 = new Date(2026, 9, 20, 23, 40).getTime();

async function endedSession(start: number, end: number, contractions: number) {
  const s = await startSession(start);
  for (let i = 0; i < contractions; i++) {
    const at = start + (i + 1) * 60_000 * 5;
    const c = await startContraction(s.id, at);
    await stopContraction(c.id, at + 60_000);
  }
  await endSession(s.id, end);
  return s;
}

const boot = async () => {
  await initStore();
  render(<StartScreen />);
};

beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  await freshDb();
  await updateSettings({ onboardedAt: 1 });
});
afterEach(async () => {
  vi.restoreAllMocks();
  useToastStore.setState({ toast: null });
  teardownStore();
  delete (navigator as unknown as Record<string, unknown>).storage;
  await dropDb();
});

describe('StartScreen', () => {
  it('shows the header, ST-01 copy, hero and the always-on safety line', async () => {
    await boot();
    expect(screen.getByText('ebb')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Whenever you're ready.");
    expect(screen.getByText("One tap when a contraction starts, one when it eases. That's all.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start timing/ })).toHaveTextContent('Begins a new session');
    expect(screen.getByText(SAFETY)).toBeInTheDocument();
  });

  it('opens Settings from the icon button', async () => {
    await boot();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(window.location.hash).toBe('#/settings');
  });

  it('Start timing creates a session and opens Live', async () => {
    await boot();
    await userEvent.click(screen.getByRole('button', { name: /Start timing/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/live'));
    await waitFor(() => expect(useAppStore.getState().activeSession).not.toBeNull());
  });

  it('hides the last-session card when there is no history', async () => {
    await boot();
    expect(screen.queryByText('LAST SESSION')).toBeNull();
  });

  it('ST-02 shows the most recent ended session, linking to its detail', async () => {
    await endedSession(T0 - 3 * DAY, T0 - 3 * DAY + 600_000, 1);
    const s = await endedSession(T0, T1, 3);
    await boot();
    const link = await screen.findByRole('link', { name: /LAST SESSION/ });
    expect(link).toHaveAttribute('href', `#/session/${s.id}`);
    expect(within(link).getByText('Tuesday evening')).toBeInTheDocument();
    expect(within(link).getByText('Tue 20 Oct · 19:05–23:40 · 4 h 35 m · 3 contractions')).toBeInTheDocument();
    expect(within(link).getByRole('img')).toBeInTheDocument(); // the sparkline
    await userEvent.click(link);
    expect(window.location.hash).toBe(`#/session/${s.id}`);
  });

  it('ST-03 All sessions opens History', async () => {
    await boot();
    await userEvent.click(screen.getByRole('link', { name: 'All sessions' }));
    expect(window.location.hash).toBe('#/history');
  });

  it.each([
    [null, 'never'],
    [Date.now(), 'today'],
    [Date.now() - DAY, 'yesterday'],
    [Date.now() - 5 * DAY, '5 days ago'],
  ])('backup button reads relative time for lastBackupAt %s', async (at, text) => {
    await updateSettings({ lastBackupAt: at });
    await boot();
    expect(screen.getByRole('button', { name: `Back up · ${text}` })).toBeInTheDocument();
  });

  it('"never" is butter only when there is data to protect', async () => {
    await boot();
    expect(screen.getByRole('button', { name: /Back up/ })).toHaveAttribute('data-never', 'false');
  });

  it('shows "never" as butter once history exists', async () => {
    await endedSession(T0, T1, 1);
    await boot();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back up · never' })).toHaveAttribute('data-never', 'true'));
  });

  it('Back up exports, saves the file and then reads "today"', async () => {
    const save = vi.spyOn(share, 'saveFile').mockResolvedValue('downloaded');
    await endedSession(T0, T1, 1);
    await boot();
    await userEvent.click(await screen.findByRole('button', { name: 'Back up · never' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[1]).toMatch(/^ebb-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(await screen.findByRole('button', { name: 'Back up · today' })).toBeInTheDocument();
  });

  it('keeps the previous label when the save fails or is cancelled', async () => {
    const before = Date.now() - 5 * DAY;
    await updateSettings({ lastBackupAt: before });
    await boot();
    const save = vi.spyOn(share, 'saveFile');
    save.mockRejectedValueOnce(new DOMException('closed', 'AbortError'));
    await userEvent.click(screen.getByRole('button', { name: 'Back up · 5 days ago' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    save.mockRejectedValueOnce(new Error('disk'));
    await userEvent.click(screen.getByRole('button', { name: 'Back up · 5 days ago' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Back up · 5 days ago' })).toBeInTheDocument();
    expect(useAppStore.getState().settings.lastBackupAt).toBe(before);
  });

  it('tells the person, quietly, when the file could not be saved', async () => {
    vi.spyOn(share, 'saveFile').mockRejectedValue(new Error('disk'));
    await boot();
    await userEvent.click(screen.getByRole('button', { name: /Back up/ }));
    await waitFor(() => expect(useToastStore.getState().toast?.message).toBe("Couldn't save the backup. Please try again."));
  });

  it('stays silent when the share sheet is closed', async () => {
    vi.spyOn(share, 'saveFile').mockRejectedValue(new DOMException('closed', 'AbortError'));
    await boot();
    await userEvent.click(screen.getByRole('button', { name: /Back up/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Back up/ })).toBeEnabled());
    expect(useToastStore.getState().toast).toBeNull();
  });

  describe('persist() denied', () => {
    const denied = (persisted: boolean) =>
      Object.defineProperty(navigator, 'storage', { value: { persisted: () => Promise.resolve(persisted) }, configurable: true });
    const three = async () => {
      for (let i = 0; i < 3; i++) await endedSession(T0 + i * DAY, T0 + i * DAY + 3_600_000, 1);
    };

    it('makes the backup button more prominent with 3+ sessions', async () => {
      denied(false);
      await three();
      await boot();
      await waitFor(() => expect(screen.getByRole('button', { name: /Back up/ })).toHaveAttribute('data-prominent', 'true'));
    });

    it('stays plain with fewer than 3 sessions', async () => {
      denied(false);
      await endedSession(T0, T1, 1);
      await endedSession(T0 + DAY, T1 + DAY, 1);
      await boot();
      await screen.findByRole('link', { name: /LAST SESSION/ });
      expect(screen.getByRole('button', { name: /Back up/ })).toHaveAttribute('data-prominent', 'false');
    });

    it('stays plain when storage is persisted', async () => {
      denied(true);
      await three();
      await boot();
      await screen.findByRole('link', { name: /LAST SESSION/ });
      expect(screen.getByRole('button', { name: /Back up/ })).toHaveAttribute('data-prominent', 'false');
    });
  });

  it('shows the quiet storage card when storage is in memory', async () => {
    await boot();
    act(() => useAppStore.setState({ storage: { status: 'memory', pendingCount: 0, conflictCount: 0 } }));
    expect(screen.getByText("This browser won't keep your data. Open Ebb from your home screen instead.")).toBeInTheDocument();
  });
});
