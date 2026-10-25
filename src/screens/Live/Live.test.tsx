import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startContraction, stopContraction } from '../../db/contractions';
import { retryPendingWrites, setRetryDelays } from '../../db/queue';
import { createDb, getDb } from '../../db/schema';
import { startSession } from '../../db/sessions';
import { updateSettings } from '../../db/settings';
import { dropDb, freshDb } from '../../db/testDb';
import type { Contraction, Session } from '../../db/types';
import { PRESET_THRESHOLDS } from '../../db/defaults';
import { initStore, teardownStore, useAppStore } from '../../state/store';
import { LiveScreen } from '.';

vi.mock('../../db/queue', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../db/queue')>();
  return { ...real, retryPendingWrites: vi.fn(real.retryPendingWrites) };
});

const MIN = 60_000;
const hero = () => screen.getByTestId('hero');

beforeEach(async () => {
  await freshDb();
  setRetryDelays([0, 0, 0]);
  await initStore();
});
afterEach(async () => {
  teardownStore();
  vi.restoreAllMocks();
  window.location.hash = '';
  await dropDb();
});

async function sessionStartedAgo(ms: number): Promise<Session> {
  const s = await startSession(Date.now() - ms);
  await waitFor(() => expect(useAppStore.getState().activeSession?.id).toBe(s.id));
  return s;
}

async function finished(sessionId: string, startAgo: number, lastsMs: number): Promise<Contraction> {
  const start = Date.now() - startAgo;
  const c = await startContraction(sessionId, start);
  return stopContraction(c.id, start + lastsMs);
}

describe('LiveScreen', () => {
  it('shows only a heading for assistive tech without an active session', async () => {
    render(<LiveScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Live' })).toBeInTheDocument();
    expect(screen.queryByTestId('hero')).not.toBeInTheDocument();
  });

  it('rests with no contractions: label, empty caption, dashes and "Not enough yet"', async () => {
    await sessionStartedAgo(20 * MIN);
    render(<LiveScreen />);
    expect(hero()).toHaveAttribute('data-state', 'resting');
    const button = within(hero()).getByRole('button', { name: 'Start contraction. No contractions yet' });
    expect(button).toHaveTextContent('Tap when it starts');
    expect(button).toHaveTextContent('No contractions yet');
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getAllByText('Not enough yet')).toHaveLength(2);
    expect(screen.queryByText(/Regular|Irregular/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tonight' }).getAttribute('href')).toMatch(/^#\/session\//);
  });

  it('writes the tap to the database, then shows contracting and announces it', async () => {
    const s = await sessionStartedAgo(20 * MIN);
    render(<LiveScreen />);
    await userEvent.click(within(hero()).getByRole('button'));
    await waitFor(() => expect(hero()).toHaveAttribute('data-state', 'contracting'));
    const rows = await getDb().contractions.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sessionId: s.id, endAt: null });
    const button = within(hero()).getByRole('button');
    expect(button).toHaveTextContent('Contraction');
    expect(button).toHaveTextContent('Tap when it eases');
    expect(button.getAttribute('aria-label')).toMatch(/^End contraction\. .* so far$/);
    expect(screen.getByTestId('announcer')).toHaveTextContent('Contraction started');
    // Averages, pattern line, mini timeline are hidden while contracting.
    expect(screen.queryByText('Last 30 min')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('ignores a second tap inside 600 ms but accepts one after it', async () => {
    await sessionStartedAgo(20 * MIN);
    render(<LiveScreen />);
    const button = within(hero()).getByRole('button');
    await userEvent.click(button);
    await userEvent.click(within(hero()).getByRole('button'));
    await waitFor(() => expect(hero()).toHaveAttribute('data-state', 'contracting'));
    expect(await getDb().contractions.count()).toBe(1);
    expect((await getDb().contractions.toArray())[0].endAt).toBeNull();

    await act(() => new Promise((r) => setTimeout(r, 650)));
    await userEvent.click(within(hero()).getByRole('button'));
    await waitFor(() => expect(hero()).toHaveAttribute('data-state', 'resting'));
    expect((await getDb().contractions.toArray())[0].endAt).not.toBeNull();
    expect(screen.getByTestId('announcer').textContent).toMatch(/^Contraction ended, lasted \d+ seconds?$/);
  });

  it('buzzes on a tap only when haptics are on and supported', async () => {
    await sessionStartedAgo(20 * MIN);
    const spy = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: spy });
    try {
      render(<LiveScreen />);
      await userEvent.click(within(hero()).getByRole('button'));
      expect(spy).toHaveBeenCalledWith(15);
    } finally {
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
    }
  });

  it('shows the last interval and duration, the averages and the pattern for a steady series', async () => {
    const s = await sessionStartedAgo(2 * 60 * MIN);
    for (let i = 11; i >= 0; i--) await finished(s.id, 3 * MIN + i * (4 * MIN + 20_000), 55_000);
    render(<LiveScreen />);
    await waitFor(() => expect(screen.getByText('Last 30 min')).toBeInTheDocument());
    expect(screen.getAllByText('4m 20s').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('55s').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('last one')).toHaveLength(2);
    expect(screen.getAllByText('every 4m 20s · 55s long').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/^Regular/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Last hour: 12 contractions/ })).toBeInTheDocument();
  });

  it('with only 1-3 contractions the averages say "Not enough yet" and the pattern is hidden', async () => {
    const s = await sessionStartedAgo(60 * MIN);
    await finished(s.id, 12 * MIN, 50_000);
    await finished(s.id, 8 * MIN, 55_000);
    await finished(s.id, 4 * MIN, 58_000);
    render(<LiveScreen />);
    await waitFor(() => expect(screen.getByText('Last 30 min')).toBeInTheDocument());
    expect(screen.getAllByText('Not enough yet')).toHaveLength(2);
    expect(screen.getByText('4m')).toBeInTheDocument();
    expect(screen.getByText('58s')).toBeInTheDocument();
    expect(screen.queryByText(/regular/i)).not.toBeInTheDocument();
  });

  describe('banner', () => {
    it('shows when an enabled threshold is met, dismisses, and records the first match', async () => {
      const s = await sessionStartedAgo(60 * MIN);
      await updateSettings({ thresholds: PRESET_THRESHOLDS.map((t) => (t.id === 'preset-3-in-10' ? { ...t, enabled: true } : t)) });
      await finished(s.id, 8 * MIN, 40_000);
      await finished(s.id, 5 * MIN, 40_000);
      await finished(s.id, 2 * MIN, 40_000);
      render(<LiveScreen />);
      const banner = await screen.findByRole('status');
      expect(banner).toHaveTextContent('Matches the threshold you set — 3 in 10 min');
      await waitFor(async () => expect((await getDb().sessions.get(s.id))?.thresholdMetAt).not.toBeNull());
      await userEvent.click(within(banner).getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('stays away when no threshold is enabled', async () => {
      const s = await sessionStartedAgo(60 * MIN);
      await finished(s.id, 8 * MIN, 40_000);
      await finished(s.id, 5 * MIN, 40_000);
      await finished(s.id, 2 * MIN, 40_000);
      render(<LiveScreen />);
      await screen.findByText('Last 30 min');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('storage', () => {
    it('shows a "Not saved" pill in memory mode', async () => {
      await sessionStartedAgo(10 * MIN);
      render(<LiveScreen />);
      expect(screen.queryByText('Not saved')).not.toBeInTheDocument();
      act(() => useAppStore.setState({ storage: { status: 'memory', pendingCount: 0, conflictCount: 0 } }));
      expect(screen.getByText('Not saved')).toBeInTheDocument();
    });

    it('shows a quiet card with Retry when saving fails', async () => {
      await sessionStartedAgo(10 * MIN);
      render(<LiveScreen />);
      act(() => useAppStore.setState({ storage: { status: 'failing', pendingCount: 1, conflictCount: 0 } }));
      expect(screen.getByText("Couldn't save the last tap — free some space, then tap Retry")).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(retryPendingWrites).toHaveBeenCalled();
    });

    it('explains a replay conflict and clears it on OK', async () => {
      const s = await sessionStartedAgo(10 * MIN);
      render(<LiveScreen />);
      // Park a start in this window, then let "another window" start its own contraction first.
      const spy = vi.spyOn(getDb().contractions, 'put').mockRejectedValue(new Error('disk full'));
      await startContraction(s.id, Date.now());
      spy.mockRestore();
      await createDb().contractions.put({
        id: 'from-b', sessionId: s.id, startAt: Date.now() - 1000, endAt: null, intensity: null, note: null,
        deletedAt: null, timeChanged: false, reviewed: false, updatedAt: Date.now(),
      });
      expect(await retryPendingWrites()).toBe(false);
      const text = "A few taps couldn't be saved because this session changed in another window.";
      expect(await screen.findByText(text)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'OK' }));
      await waitFor(() => expect(screen.queryByText(text)).not.toBeInTheDocument());
    });
  });

  describe('stale contraction', () => {
    it('offers "Ended earlier…" and "Keep timing" after 5 minutes, and Keep timing hides the card', async () => {
      const s = await sessionStartedAgo(60 * MIN);
      await startContraction(s.id, Date.now() - (23 * MIN + 5000));
      render(<LiveScreen />);
      expect(await screen.findByText("Still going? This one's been running 23 min.")).toBeInTheDocument();
      expect(hero()).toHaveAttribute('data-state', 'contracting');
      expect(within(hero()).getByRole('button')).toHaveTextContent(/^Contraction23:0\dTap when it eases$/);
      await userEvent.click(screen.getByRole('button', { name: 'Keep timing' }));
      expect(screen.queryByText(/Still going/)).not.toBeInTheDocument();
    });

    it('ends the contraction at the chosen time from the sheet', async () => {
      const s = await sessionStartedAgo(60 * MIN);
      const c = await startContraction(s.id, Date.now() - 20 * MIN);
      render(<LiveScreen />);
      await userEvent.click(await screen.findByRole('button', { name: 'Ended earlier…' }));
      const dialog = await screen.findByRole('dialog', { name: 'When did it end?' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(async () => expect((await getDb().contractions.get(c.id))?.endAt).not.toBeNull());
      await waitFor(() => expect(hero()).toHaveAttribute('data-state', 'resting'));
    });

    it('shows no card for a contraction under 5 minutes', async () => {
      const s = await sessionStartedAgo(60 * MIN);
      await startContraction(s.id, Date.now() - 4 * MIN);
      render(<LiveScreen />);
      await screen.findByText('Contraction');
      expect(screen.queryByText(/Still going/)).not.toBeInTheDocument();
    });
  });

  describe('long pause', () => {
    it('asks, and Keep session going hides it', async () => {
      const s = await sessionStartedAgo(3 * 60 * MIN);
      await finished(s.id, 72 * MIN + 5000, 50_000);
      render(<LiveScreen />);
      expect(await screen.findByText('Contractions paused? Last one 1 h 12 m ago.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Keep session going' }));
      expect(screen.queryByText(/Contractions paused/)).not.toBeInTheDocument();
      expect((await getDb().sessions.get(s.id))?.endedAt).toBeNull();
    });

    it('is not shown at 59 minutes or with no contractions', async () => {
      const s = await sessionStartedAgo(3 * 60 * MIN);
      render(<LiveScreen />);
      await screen.findByText('Last 30 min');
      expect(screen.queryByText(/Contractions paused/)).not.toBeInTheDocument();
      await finished(s.id, 59 * MIN, 50_000);
      await screen.findByText('Time apart');
      expect(screen.queryByText(/Contractions paused/)).not.toBeInTheDocument();
    });

    it('End session… opens the confirmation, which ends the session and goes to the start screen', async () => {
      const s = await sessionStartedAgo(3 * 60 * MIN);
      await finished(s.id, 70 * MIN, 50_000);
      render(<LiveScreen />);
      await userEvent.click(await screen.findByRole('button', { name: 'End session…' }));
      const dialog = await screen.findByRole('dialog', { name: 'End this session?' });
      expect(dialog).toHaveTextContent('1 contraction over 3 h');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Keep going' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect((await getDb().sessions.get(s.id))?.endedAt).toBeNull();

      await userEvent.click(screen.getByRole('button', { name: 'End session…' }));
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'End session' }));
      await waitFor(async () => expect((await getDb().sessions.get(s.id))?.endedAt).not.toBeNull());
      await waitFor(() => expect(window.location.hash).toBe('#/'));
    });
  });

  it('the menu sheet links to All sessions and Settings', async () => {
    await sessionStartedAgo(10 * MIN);
    render(<LiveScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Menu' });
    expect(within(dialog).getByRole('link', { name: 'All sessions' })).toHaveAttribute('href', '#/history');
    expect(within(dialog).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '#/settings');
  });

  it('shows the breathing caption only while contracting with the glow on', async () => {
    await sessionStartedAgo(10 * MIN);
    const caption = 'Breathe with the glow — in as it grows, out as it fades';
    const { unmount } = render(<LiveScreen />);
    expect(screen.queryByText(caption)).not.toBeInTheDocument();
    await userEvent.click(within(hero()).getByRole('button'));
    expect(await screen.findByText(caption)).toBeInTheDocument();
    unmount();

    await updateSettings({ breathingGlow: false });
    await waitFor(() => expect(useAppStore.getState().settings.breathingGlow).toBe(false));
    render(<LiveScreen />);
    await screen.findByText('Tap when it eases');
    expect(screen.queryByText(caption)).not.toBeInTheDocument();
  });
});
