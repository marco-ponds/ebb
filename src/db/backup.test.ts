import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildBackup,
  deleteAllData,
  exportBackup,
  markBackupDone,
  parseBackup,
  restoreBackup,
  snapshotToBackupsCache,
  type Backup,
} from './backup';
import { addMissedContraction, deleteContraction, startContraction, stopContraction } from './contractions';
import { DEFAULT_SETTINGS } from './defaults';
import { addEvent } from './events';
import { getDb } from './schema';
import { endSession, startSession } from './sessions';
import { getSettings, updateSettings } from './settings';
import { dropDb, freshDb } from './testDb';
import type { Contraction, Session } from './types';

const NOON = new Date(2026, 9, 25, 12, 0, 0).getTime();
const MIN = 60_000;
const NOT_BACKUP = { ok: false, error: "This file isn't an Ebb backup" };

beforeEach(freshDb);
afterEach(async () => {
  vi.unstubAllGlobals();
  await dropDb();
});

async function seedFinishedSession() {
  const s = await startSession(NOON);
  const c = await startContraction(s.id, NOON + MIN);
  await stopContraction(c.id, NOON + 2 * MIN);
  await addEvent(s.id, { type: 'waters', at: NOON + 3 * MIN, details: 'clear' });
  await endSession(s.id, NOON + 10 * MIN);
  return { s, c };
}

async function dump() {
  const db = getDb();
  return {
    sessions: await db.sessions.toArray(),
    contractions: await db.contractions.toArray(),
    events: await db.events.toArray(),
    settings: await db.settings.toArray(),
  };
}

function fakeCaches() {
  const store = new Map<string, Map<string, string>>();
  const api = {
    store,
    open: async (name: string) => {
      const bucket = store.get(name) ?? new Map<string, string>();
      store.set(name, bucket);
      return { put: async (url: string, res: Response) => void bucket.set(url, await res.text()) };
    },
    delete: async (name: string) => store.delete(name),
  };
  vi.stubGlobal('caches', api);
  return api;
}

describe('buildBackup / exportBackup', () => {
  it('excludes soft-deleted rows and has the documented shape', async () => {
    const { s, c } = await seedFinishedSession();
    const gone = await addMissedContraction(s.id, { startAt: NOON + 20 * MIN, durationMs: 30_000 });
    await deleteContraction(gone.id);
    const b = await buildBackup(NOON + 99);
    expect(b).toMatchObject({ app: 'ebb', schema: 1, exportedAt: NOON + 99 });
    expect(b.contractions.map((x) => x.id)).toEqual([c.id]);
    expect(b.sessions).toHaveLength(1);
    expect(b.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('exports a dated JSON file without recording a backup, until markBackupDone', async () => {
    await seedFinishedSession();
    const { blob, filename } = await exportBackup(NOON);
    expect(filename).toBe('ebb-backup-2026-10-25.json');
    expect((await getSettings()).lastBackupAt).toBeNull();
    await markBackupDone(NOON);
    expect((await getSettings()).lastBackupAt).toBe(NOON);
    const parsed = parseBackup(await blob.text());
    expect(parsed.ok).toBe(true);
  });

  it('round-trips through parse and Replace into an empty database', async () => {
    const { blob } = await (async () => {
      await seedFinishedSession();
      return exportBackup(NOON + 1);
    })();
    const before = await dump();
    await deleteAllData();
    const parsed = parseBackup(await blob.text());
    if (!parsed.ok) throw new Error('should parse');
    expect(parsed.counts).toEqual({ sessions: 1, contractions: 1, events: 1 });
    const result = await restoreBackup(parsed.backup, 'replace');
    expect(result).toEqual({ added: 3, skipped: 0, snapshotSaved: false });
    const after = await dump();
    expect(after.sessions).toEqual(before.sessions);
    expect(after.contractions).toEqual(before.contractions);
    expect(after.events).toEqual(before.events);
  });
});

describe('parseBackup', () => {
  const good = async (): Promise<Backup> => {
    await seedFinishedSession();
    return buildBackup(NOON);
  };

  it.each([
    ['corrupt JSON', '{nope'],
    ['not an object', '[]'],
    ['wrong app', JSON.stringify({ app: 'other', schema: 1 })],
  ])('rejects %s with the exact error', (_n, text) => {
    expect(parseBackup(text)).toEqual(NOT_BACKUP);
  });

  it('rejects schema 2', async () => {
    expect(parseBackup(JSON.stringify({ ...(await good()), schema: 2 }))).toEqual(NOT_BACKUP);
  });

  it('rejects empty ids, unknown session ids and bad field types', async () => {
    const b = await good();
    expect(parseBackup(JSON.stringify({ ...b, sessions: [{ ...b.sessions[0], id: '' }] }))).toEqual(NOT_BACKUP);
    expect(parseBackup(JSON.stringify({ ...b, contractions: [{ ...b.contractions[0], sessionId: 'ghost' }] }))).toEqual(NOT_BACKUP);
    expect(parseBackup(JSON.stringify({ ...b, events: [{ ...b.events[0], type: 'party' }] }))).toEqual(NOT_BACKUP);
    expect(parseBackup(JSON.stringify({ ...b, contractions: [{ ...b.contractions[0], startAt: 'x' }] }))).toEqual(NOT_BACKUP);
    expect(parseBackup(JSON.stringify({ ...b, settings: { ...b.settings, theme: 'neon' } }))).toEqual(NOT_BACKUP);
    expect(parseBackup(JSON.stringify({ ...b, sessions: 'many' }))).toEqual(NOT_BACKUP);
  });

  const withoutBreath = (b: Backup) => {
    const { breatheInSeconds: _i, breatheOutSeconds: _o, ...rest } = b.settings;
    void _i;
    void _o;
    return { ...b, settings: rest };
  };

  it('accepts settings without the breathe fields and fills them as 4', async () => {
    const parsed = parseBackup(JSON.stringify(withoutBreath(await good())));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.backup.settings).toMatchObject({ breatheInSeconds: 4, breatheOutSeconds: 4 });
  });

  it.each([3, 8])('accepts breathe seconds of %i', async (n) => {
    const b = await good();
    const parsed = parseBackup(JSON.stringify({ ...b, settings: { ...b.settings, breatheInSeconds: n, breatheOutSeconds: n } }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.backup.settings).toMatchObject({ breatheInSeconds: n, breatheOutSeconds: n });
  });

  it.each([2, 9, 4.5, '4', null])('rejects breathe seconds of %j', async (bad) => {
    const b = await good();
    expect(parseBackup(JSON.stringify({ ...b, settings: { ...b.settings, breatheInSeconds: bad } }))).toEqual(NOT_BACKUP);
    expect(parseBackup(JSON.stringify({ ...b, settings: { ...b.settings, breatheOutSeconds: bad } }))).toEqual(NOT_BACKUP);
  });
});

describe('restoreBackup', () => {
  it('merge: new rows are added, older conflicts skipped, newer conflicts win', async () => {
    const { s, c } = await seedFinishedSession();
    const backup = await buildBackup(NOON);
    const newerC: Contraction = { ...backup.contractions[0], note: 'from backup', updatedAt: backup.contractions[0].updatedAt + 1000 };
    const extraSession: Session = { ...backup.sessions[0], id: 'other-session', name: 'Other' };
    const extraC: Contraction = { ...newerC, id: 'extra-c', sessionId: 'other-session', note: null };
    const incoming: Backup = {
      ...backup,
      sessions: [backup.sessions[0], extraSession],
      contractions: [newerC, extraC],
      events: backup.events,
    };
    const result = await restoreBackup(incoming, 'merge');
    // session (same updatedAt: skipped), event (skipped), newer contraction (added), extra session and contraction (added)
    expect(result).toEqual({ added: 3, skipped: 2, snapshotSaved: false });
    expect((await getDb().contractions.get(c.id))?.note).toBe('from backup');
    expect(await getDb().sessions.get('other-session')).toBeDefined();
    expect(s.id).toBeDefined();
  });

  it('merge keeps device settings', async () => {
    await seedFinishedSession();
    await updateSettings({ theme: 'day', onboardedAt: 5 });
    const backup = { ...(await buildBackup(NOON)), settings: { ...DEFAULT_SETTINGS, theme: 'night' as const } };
    await restoreBackup(backup, 'merge');
    expect(await getSettings()).toMatchObject({ theme: 'day', onboardedAt: 5 });
  });

  it('closes imported active sessions at their latest timestamp and drops open contractions', async () => {
    const base = await (async () => {
      await seedFinishedSession();
      return buildBackup(NOON);
    })();
    await deleteAllData();
    const active: Session = { ...base.sessions[0], endedAt: null };
    const open: Contraction = { ...base.contractions[0], id: 'open', endAt: null, startAt: NOON + 30 * MIN };
    const result = await restoreBackup({ ...base, sessions: [active], contractions: [base.contractions[0], open] }, 'merge');
    expect(result).toEqual({ added: 3, skipped: 1, snapshotSaved: false });
    expect((await getDb().sessions.get(active.id))?.endedAt).toBe(NOON + 30 * MIN); // the dropped open contraction's start is the latest stamp
    expect(await getDb().contractions.get('open')).toBeUndefined();
  });

  it('throws while a session is active and changes nothing', async () => {
    const base = await (async () => {
      await seedFinishedSession();
      return buildBackup(NOON);
    })();
    await startSession(NOON + 60 * MIN);
    const before = await dump();
    await expect(restoreBackup(base, 'replace')).rejects.toThrow(/active session/);
    await expect(restoreBackup(base, 'merge')).rejects.toThrow(/active session/);
    expect(await dump()).toEqual(before);
  });

  it('replace snapshots to the backups cache first, then swaps data and keeps the device onboardedAt', async () => {
    const caches = fakeCaches();
    await seedFinishedSession();
    await updateSettings({ onboardedAt: 777 });
    const backup = { ...(await buildBackup(NOON)), sessions: [], contractions: [], events: [], settings: { ...DEFAULT_SETTINGS, theme: 'day' as const, onboardedAt: 1 } };
    const oldSessions = await getDb().sessions.count();
    const result = await restoreBackup(backup, 'replace');
    expect(result).toEqual({ added: 0, skipped: 0, snapshotSaved: true });
    const keys = [...(caches.store.get('ebb-backups')?.keys() ?? [])];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^\/backups\/.+-before-replace\.json$/);
    const snap = JSON.parse(caches.store.get('ebb-backups')!.get(keys[0])!) as Backup;
    expect(snap.sessions).toHaveLength(oldSessions); // taken before the swap
    expect(await getDb().sessions.count()).toBe(0);
    expect(await getSettings()).toMatchObject({ theme: 'day', onboardedAt: 777 });
  });

  it('replace with a backup lacking the breathe fields stores 4/4', async () => {
    fakeCaches();
    const full = await buildBackup(NOON);
    const { breatheInSeconds: _i, breatheOutSeconds: _o, ...rest } = full.settings;
    void _i;
    void _o;
    await restoreBackup({ ...full, settings: rest } as Backup, 'replace');
    const stored = await getDb().settings.get('singleton');
    expect(stored).toMatchObject({ breatheInSeconds: 4, breatheOutSeconds: 4 });
  });
});

describe('invalid backups change nothing', () => {
  it('leaves the database untouched when parse rejects', async () => {
    await seedFinishedSession();
    const before = await dump();
    for (const text of ['{broken', JSON.stringify({ app: 'x', schema: 1 }), JSON.stringify({ app: 'ebb', schema: 2 })]) {
      expect(parseBackup(text)).toEqual(NOT_BACKUP);
    }
    expect(await dump()).toEqual(before);
  });
});

describe('snapshotToBackupsCache / deleteAllData', () => {
  it('is a no-op when Cache Storage is missing', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(snapshotToBackupsCache('x')).resolves.toBe(false);
  });

  it('deleteAllData clears all five stores and deletes only the ebb-backups cache', async () => {
    const caches = fakeCaches();
    caches.store.set('ebb-backups', new Map());
    caches.store.set('workbox-precache-v2', new Map());
    await seedFinishedSession();
    expect((await dump()).sessions).toHaveLength(1);
    await deleteAllData();
    const after = await dump();
    expect(after).toEqual({ sessions: [], contractions: [], events: [], settings: [] });
    expect(await getDb().undo.count()).toBe(0);
    expect([...caches.store.keys()]).toEqual(['workbox-precache-v2']);
  });
});
