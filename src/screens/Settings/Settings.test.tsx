import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../../components';
import { startContraction, stopContraction } from '../../db/contractions';
import { DEFAULT_SETTINGS } from '../../db/defaults';
import { endSession, startSession } from '../../db/sessions';
import { getSettings, updateSettings } from '../../db/settings';
import { getDb } from '../../db/schema';
import { dropDb, freshDb } from '../../db/testDb';
import { __resetInstallPromptForTests } from '../../app/installPrompt';
import * as share from '../../lib/share';
import { initStore, teardownStore, useAppStore } from '../../state/store';
import { SettingsScreen } from '.';

const swState = vi.hoisted(() => ({ ready: false }));
vi.mock('../../app/swUpdate', () => ({ useUpdateReady: () => swState.ready }));

const SAFETY =
  "This app records contractions. It doesn't give medical advice — if you're worried, contact your midwife or maternity unit.";
// A stubbed navigator no longer has the real getters, which the install hint reads.
const PHONE = { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120', platform: 'Linux armv8l', maxTouchPoints: 5 };
const fakeNavigator = (extra: Record<string, unknown>) =>
  Object.create(
    navigator,
    Object.fromEntries(Object.entries({ ...PHONE, ...extra }).map(([k, value]) => [k, { value, configurable: true }])),
  );
const NOT_BACKUP = "This file isn't an Ebb backup";

const boot = async () => {
  await initStore();
  render(<SettingsScreen />);
};

const backupFile = (over: Record<string, unknown> = {}, name = 'backup.json') =>
  new File(
    [
      JSON.stringify({
        app: 'ebb',
        schema: 1,
        exportedAt: 1_700_000_000_000,
        sessions: [
          {
            id: 'bk-s1',
            name: 'From backup',
            startedAt: 1_700_000_000_000,
            endedAt: 1_700_000_900_000,
            notes: '',
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_900_000,
            thresholdMetAt: null,
          },
        ],
        contractions: [
          {
            id: 'bk-c1',
            sessionId: 'bk-s1',
            startAt: 1_700_000_100_000,
            endAt: 1_700_000_160_000,
            intensity: null,
            note: null,
            deletedAt: null,
            timeChanged: false,
            reviewed: false,
            updatedAt: 1_700_000_160_000,
          },
        ],
        events: [],
        settings: { ...DEFAULT_SETTINGS, intensityScale: 'numeric' },
        ...over,
      }),
    ],
    name,
    { type: 'application/json' },
  );

beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  swState.ready = false;
  await freshDb();
  await updateSettings({ onboardedAt: 1 });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useToastStore.setState({ toast: null });
  teardownStore();
  await dropDb();
});

describe('layout and copy', () => {
  it('shows the title, section headings, the safety line and the version', async () => {
    await boot();
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    for (const h of ['Your thresholds', 'Strength scale', 'Look', 'Your data']) {
      expect(screen.getByRole('heading', { name: h })).toBeInTheDocument();
    }
    expect(screen.getByText(SAFETY)).toBeInTheDocument();
    expect(screen.getByText('Version test')).toBeInTheDocument();
    expect(screen.queryByText('Update ready — restart the app to use it')).toBeNull();
  });

  it('shows the update line when a new version is waiting', async () => {
    swState.ready = true;
    await boot();
    expect(screen.getByText('Update ready — restart the app to use it')).toBeInTheDocument();
  });

  it('goes back to Start, or to Live while a session is active', async () => {
    await boot();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(window.location.hash).toBe('#/');

    teardownStore();
    await startSession();
    window.history.replaceState(null, '', '/');
    await boot();
    await waitFor(() => expect(useAppStore.getState().activeSession).not.toBeNull());
    await userEvent.click(screen.getAllByRole('button', { name: 'Back' }).at(-1) as HTMLElement);
    expect(window.location.hash).toBe('#/live');
  });
});

describe('thresholds', () => {
  it('lists the four presets, all off, with names and descriptions', async () => {
    await boot();
    expect(
      screen.getByText(
        "None are on until you choose. Pick what your midwife or unit told you — a gentle note appears when it's met.",
      ),
    ).toBeInTheDocument();
    const switches = screen.getAllByRole('switch').slice(0, 4);
    expect(switches.map((s) => s.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false']);
    expect(screen.getByRole('switch', { name: '3 in 10 min' })).toHaveAccessibleDescription('Three contractions within ten minutes');
    expect(screen.getByRole('switch', { name: '5-1-1' })).toHaveAccessibleDescription('5 min apart, 1 min long, for 1 hour');
    expect(screen.getByRole('switch', { name: '4-1-1' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: '3-1-1' })).toBeInTheDocument();
  });

  it('toggling a preset is stored', async () => {
    await boot();
    await userEvent.click(screen.getByRole('switch', { name: '3 in 10 min' }));
    await waitFor(async () => {
      const t = (await getSettings()).thresholds.find((x) => x.id === 'preset-3-in-10');
      expect(t?.enabled).toBe(true);
    });
    await waitFor(() => expect(screen.getByRole('switch', { name: '3 in 10 min' })).toHaveAttribute('aria-checked', 'true'));
  });

  it('creates a custom N in M threshold; Save is disabled with a hint while invalid', async () => {
    await boot();
    await userEvent.click(screen.getByRole('button', { name: '+ Custom threshold' }));
    const dialog = screen.getByRole('dialog', { name: 'Custom threshold' });
    const save = within(dialog).getByRole('button', { name: 'Save' });
    await userEvent.clear(within(dialog).getByLabelText('Contractions'));
    await userEvent.type(within(dialog).getByLabelText('Contractions'), '0');
    expect(save).toBeDisabled();
    expect(within(dialog).getByText('Use a whole number from 1 to 20')).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText('Contractions'));
    await userEvent.type(within(dialog).getByLabelText('Contractions'), '4');
    await userEvent.clear(within(dialog).getByLabelText('Minutes'));
    await userEvent.type(within(dialog).getByLabelText('Minutes'), '20');
    await userEvent.type(within(dialog).getByLabelText('Label (optional)'), 'Unit rule');
    expect(save).toBeEnabled();
    await userEvent.click(save);

    await waitFor(async () => {
      const saved = (await getSettings()).thresholds.at(-1);
      expect(saved).toMatchObject({ kind: 'n-in-m', n: 4, minutes: 20, label: 'Unit rule', preset: false });
      expect(saved?.id).not.toMatch(/^preset-/);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('switch', { name: 'Unit rule' })).toBeInTheDocument();
  });

  it('creates an A-L-D threshold', async () => {
    await boot();
    await userEvent.click(screen.getByRole('button', { name: '+ Custom threshold' }));
    const dialog = screen.getByRole('dialog', { name: 'Custom threshold' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'A-L-D' }));
    await userEvent.clear(within(dialog).getByLabelText('Apart, at most (min)'));
    await userEvent.type(within(dialog).getByLabelText('Apart, at most (min)'), '6');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      expect((await getSettings()).thresholds.at(-1)).toMatchObject({ kind: 'ald', apartMin: 6, lastingMin: 1, hours: 1 });
    });
    expect(await screen.findByRole('switch', { name: '6-1-1' })).toBeInTheDocument();
  });

  it('edits and deletes a custom threshold; presets have no edit or delete', async () => {
    await updateSettings({
      thresholds: [
        ...DEFAULT_SETTINGS.thresholds,
        { id: 'c1', kind: 'n-in-m', n: 4, minutes: 20, enabled: true, label: null, preset: false },
      ],
    });
    await boot();
    expect(screen.queryByRole('button', { name: 'Edit 3 in 10 min' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Edit 4 in 20 min' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit threshold' });
    await userEvent.clear(within(dialog).getByLabelText('Minutes'));
    await userEvent.type(within(dialog).getByLabelText('Minutes'), '30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const t = (await getSettings()).thresholds.find((x) => x.id === 'c1');
      expect(t).toMatchObject({ minutes: 30, enabled: true });
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Edit 4 in 30 min' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(async () => {
      expect((await getSettings()).thresholds.some((x) => x.id === 'c1')).toBe(false);
    });
    await waitFor(() => expect(screen.queryByRole('switch', { name: '4 in 30 min' })).toBeNull());
  });
});

describe('scale, look and toggles', () => {
  it('maps the strength scale and look controls to the stored settings', async () => {
    await boot();
    const scale = screen.getByRole('radiogroup', { name: 'Strength scale' });
    expect(within(scale).getByRole('radio', { name: '5 words' })).toBeChecked();
    await userEvent.click(within(scale).getByRole('radio', { name: '1–10' }));
    await waitFor(async () => expect((await getSettings()).intensityScale).toBe('numeric'));
    await userEvent.click(within(scale).getByRole('radio', { name: 'Both' }));
    await waitFor(async () => expect((await getSettings()).intensityScale).toBe('both'));

    const look = screen.getByRole('radiogroup', { name: 'Look' });
    await userEvent.click(within(look).getByRole('radio', { name: 'Day' }));
    await waitFor(async () => expect((await getSettings()).theme).toBe('day'));
    await userEvent.click(within(look).getByRole('radio', { name: 'Match phone' }));
    await waitFor(async () => expect((await getSettings()).theme).toBe('system'));
  });

  it('shows the three toggles on by default, with descriptions, and stores a change', async () => {
    await boot();
    expect(screen.getByRole('switch', { name: 'Keep screen awake' })).toHaveAccessibleDescription('During a session');
    expect(screen.getByRole('switch', { name: 'Gentle buzz' })).toHaveAccessibleDescription('On start and stop');
    expect(screen.getByRole('switch', { name: 'Breathing glow' })).toHaveAccessibleDescription('Slow pulse during a contraction');
    for (const n of ['Keep screen awake', 'Gentle buzz', 'Breathing glow']) {
      expect(screen.getByRole('switch', { name: n })).toHaveAttribute('aria-checked', 'true');
    }
    await userEvent.click(screen.getByRole('switch', { name: 'Breathing glow' }));
    await waitFor(async () => expect((await getSettings()).breathingGlow).toBe(false));
    await userEvent.click(screen.getByRole('switch', { name: 'Gentle buzz' }));
    await waitFor(async () => expect((await getSettings()).haptics).toBe(false));
    await userEvent.click(screen.getByRole('switch', { name: 'Keep screen awake' }));
    await waitFor(async () => expect((await getSettings()).keepAwake).toBe(false));
  });

  it('explains when the browser cannot keep the screen on', async () => {
    const help = "This browser can't keep the screen on. You can raise the auto-lock time in your phone's display settings.";
    vi.stubGlobal('navigator', fakeNavigator({ wakeLock: undefined }));
    await boot();
    expect(screen.getByText(help)).toBeInTheDocument();
  });

  it('hides the wake-lock help when it is supported', async () => {
    vi.stubGlobal('navigator', fakeNavigator({ wakeLock: { request: vi.fn() } }));
    await boot();
    expect(screen.queryByText(/can't keep the screen on/)).toBeNull();
  });
});

describe('install', () => {
  const secure = (on: boolean) => Object.defineProperty(window, 'isSecureContext', { value: on, configurable: true });
  beforeEach(() => {
    __resetInstallPromptForTests();
    secure(true);
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => secure(true));

  it('says how to install from the browser menu when no prompt is available', async () => {
    await boot();
    const section = screen.getByRole('region', { name: 'Install Ebb' });
    expect(within(section).getByText('To install, open your browser menu and choose Install app or Add to Home screen.')).toBeInTheDocument();
  });

  it('asks for a secure link over plain http', async () => {
    secure(false);
    await boot();
    expect(screen.getByText('To install Ebb, open it from a secure (https) link.')).toBeInTheDocument();
  });

  it('offers an Install button that uses the deferred prompt', async () => {
    await boot();
    const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(() => Promise.resolve()),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    act(() => void window.dispatchEvent(e));
    await userEvent.click(within(screen.getByRole('region', { name: 'Install Ebb' })).getByRole('button', { name: 'Install' }));
    expect(e.prompt).toHaveBeenCalledTimes(1);
  });

  it('shows the iOS steps on iPhone Safari', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1');
    await boot();
    expect(screen.getByText('Tap Share, then Add to Home Screen.')).toBeInTheDocument();
  });

  it('shows no install row once installed', async () => {
    window.matchMedia = ((q: string) => ({ matches: q === '(display-mode: standalone)', media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    await boot();
    expect(screen.queryByRole('region', { name: 'Install Ebb' })).toBeNull();
  });
});

describe('backup', () => {
  const NOW = new Date(2026, 9, 20, 12, 0).getTime();

  it('shows the last backup in the butter panel', async () => {
    await boot();
    expect(
      screen.getByText(
        "Everything lives only on this phone. Clearing the browser's data removes it, so a backup now and then is worth it. Last backup: never.",
      ),
    ).toBeInTheDocument();
  });

  it('saves the file, then records the backup', async () => {
    const save = vi.spyOn(share, 'saveFile').mockResolvedValue('downloaded');
    await boot();
    await userEvent.click(screen.getByRole('button', { name: 'Back up everything' }));
    await waitFor(async () => expect((await getSettings()).lastBackupAt).not.toBeNull());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1]).toMatch(/^ebb-backup-\d{4}-\d{2}-\d{2}\.json$/);
    await waitFor(() => expect(screen.getByText(/Last backup: today\./)).toBeInTheDocument());
  });

  it('leaves "Last backup" unchanged when the save is cancelled', async () => {
    await updateSettings({ lastBackupAt: NOW - 5 * 86_400_000 });
    vi.spyOn(share, 'saveFile').mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    await boot();
    await userEvent.click(screen.getByRole('button', { name: 'Back up everything' }));
    await waitFor(() => expect(share.saveFile).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back up everything' })).toBeEnabled());
    expect((await getSettings()).lastBackupAt).toBe(NOW - 5 * 86_400_000);
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('leaves "Last backup" unchanged and says so quietly when the save fails', async () => {
    vi.spyOn(share, 'saveFile').mockRejectedValue(new Error('disk full'));
    await boot();
    await userEvent.click(screen.getByRole('button', { name: 'Back up everything' }));
    await waitFor(() => expect(useToastStore.getState().toast?.message).toBe("Couldn't save the backup. Please try again."));
    expect((await getSettings()).lastBackupAt).toBeNull();
  });
});

describe('restore', () => {
  const choose = async (file: File) => {
    await userEvent.upload(screen.getByLabelText('Restore from a backup'), file);
  };

  it('uses a real file input that accepts JSON', async () => {
    await boot();
    const input = screen.getByLabelText('Restore from a backup') as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.accept).toBe('application/json,.json');
  });

  it('rejects a file that is not a backup and changes nothing', async () => {
    await boot();
    await choose(new File(['{nope'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByText(NOT_BACKUP)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull();
    expect(await getDb().sessions.count()).toBe(0);
  });

  it('rejects a schema 2 file', async () => {
    await boot();
    await choose(backupFile({ schema: 2 }));
    expect(await screen.findByText(NOT_BACKUP)).toBeInTheDocument();
    expect(await getDb().sessions.count()).toBe(0);
  });

  it('previews the counts, then Merge reports added and skipped', async () => {
    await boot();
    await choose(backupFile());
    expect(await screen.findByText('1 sessions, 1 contractions, 0 events')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(await screen.findByText('Added 2, skipped 0')).toBeInTheDocument();
    expect(await getDb().sessions.count()).toBe(1);

    await choose(backupFile());
    await userEvent.click(await screen.findByRole('button', { name: 'Merge' }));
    expect(await screen.findByText('Added 0, skipped 2')).toBeInTheDocument();
    expect(screen.queryByText('A copy of your current data was saved first')).toBeNull();
  });

  it('Replace without Cache Storage does not claim a copy was saved', async () => {
    vi.stubGlobal('caches', undefined);
    const old = await startSession(1_600_000_000_000);
    await endSession(old.id, 1_600_000_100_000);
    await boot();
    await choose(backupFile());
    await userEvent.click(await screen.findByRole('button', { name: 'Replace' }));
    expect(await screen.findByText('Added 2, skipped 0')).toBeInTheDocument();
    expect(screen.queryByText('A copy of your current data was saved first')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('Replace swaps the data and confirms that a copy was saved first', async () => {
    const store = new Map<string, Map<string, string>>();
    vi.stubGlobal('caches', {
      open: async (name: string) => {
        const m = store.get(name) ?? new Map<string, string>();
        store.set(name, m);
        return { put: async (k: string, r: Response) => void m.set(k, await r.text()) };
      },
      delete: async () => true,
    });
    const old = await startSession(1_600_000_000_000);
    await endSession(old.id, 1_600_000_100_000);
    await boot();
    await choose(backupFile());
    await userEvent.click(await screen.findByRole('button', { name: 'Replace' }));
    expect(await screen.findByText('Added 2, skipped 0')).toBeInTheDocument();
    expect(screen.getByText('A copy of your current data was saved first')).toBeInTheDocument();
    const ids = (await getDb().sessions.toArray()).map((s) => s.id);
    expect(ids).toEqual(['bk-s1']);
  });

  it('Cancel drops the preview without touching the data', async () => {
    await boot();
    await choose(backupFile());
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull();
    expect(await getDb().sessions.count()).toBe(0);
  });

  it('is disabled during an active session, with a hint', async () => {
    await startSession();
    await boot();
    await waitFor(() => expect(screen.getByLabelText('Restore from a backup')).toBeDisabled());
    expect(screen.getByText('Finish the current session before restoring')).toBeInTheDocument();
  });

  it('is available again once the session ends', async () => {
    await boot();
    expect(screen.getByLabelText('Restore from a backup')).toBeEnabled();
    expect(screen.queryByText('Finish the current session before restoring')).toBeNull();
  });
});

describe('delete all data', () => {
  it('needs the exact word, then clears everything and returns to the start', async () => {
    const s = await startSession(1_600_000_000_000);
    const c = await startContraction(s.id, 1_600_000_010_000);
    await stopContraction(c.id, 1_600_000_070_000);
    await endSession(s.id, 1_600_000_100_000);
    await boot();
    window.history.replaceState(null, '', '#/settings');

    await userEvent.click(screen.getByRole('button', { name: 'Delete all data…' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete all data' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete everything' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Type "delete" to confirm'), 'Delete');
    expect(confirm).toBeDisabled();
    await userEvent.clear(within(dialog).getByLabelText('Type "delete" to confirm'));
    await userEvent.type(within(dialog).getByLabelText('Type "delete" to confirm'), 'delete');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(await getDb().sessions.count()).toBe(0);
    expect(await getDb().contractions.count()).toBe(0);
  });
});
