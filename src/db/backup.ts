import { DEFAULT_SETTINGS } from './defaults';
import { InvariantError } from './errors';
import { runWrite } from './queue';
import { findActiveSession, getSettingsRow, rowsOf } from './reads';
import { getDb } from './schema';
import { updateSettings } from './settings';
import type { Contraction, EbbEvent, Session, Settings } from './types';

export const BACKUP_CACHE = 'ebb-backups';
export const NOT_A_BACKUP = "This file isn't an Ebb backup";

export interface Backup {
  app: 'ebb';
  schema: 1;
  exportedAt: number;
  sessions: Session[];
  contractions: Contraction[];
  events: EbbEvent[];
  settings: Settings;
}

export type ParsedBackup =
  | { ok: true; backup: Backup; counts: { sessions: number; contractions: number; events: number } }
  | { ok: false; error: typeof NOT_A_BACKUP };

export async function buildBackup(now: number): Promise<Backup> {
  const [sessions, contractions, events, settings] = await Promise.all([
    rowsOf('sessions'),
    rowsOf('contractions'),
    rowsOf('events'),
    getSettingsRow(),
  ]);
  return {
    app: 'ebb',
    schema: 1,
    exportedAt: now,
    sessions,
    contractions: contractions.filter((c) => c.deletedAt === null),
    events: events.filter((e) => e.deletedAt === null),
    settings: settings ?? structuredClone(DEFAULT_SETTINGS),
  };
}

function localDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function exportBackup(now: number): Promise<{ blob: Blob; filename: string }> {
  await updateSettings({ lastBackupAt: now });
  const backup = await buildBackup(now);
  return {
    blob: new Blob([JSON.stringify(backup)], { type: 'application/json' }),
    filename: `ebb-backup-${localDate(now)}.json`,
  };
}

// --- validation ---

type Row = Record<string, unknown>;
const isObj = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);
const isStrOrNull = (v: unknown) => v === null || typeof v === 'string';
const isId = (v: unknown) => typeof v === 'string' && v.length > 0;
const oneOf = (list: readonly string[]) => (v: unknown) => typeof v === 'string' && list.includes(v);

function shaped(v: unknown, checks: Record<string, (x: unknown) => boolean>): boolean {
  return isObj(v) && Object.entries(checks).every(([k, check]) => check(v[k]));
}

const isSession = (v: unknown) =>
  shaped(v, {
    id: isId,
    name: isStrOrNull,
    startedAt: isNum,
    endedAt: isNumOrNull,
    notes: (x) => typeof x === 'string',
    createdAt: isNum,
    updatedAt: isNum,
    thresholdMetAt: isNumOrNull,
  });

const isContraction = (v: unknown) =>
  shaped(v, {
    id: isId,
    sessionId: isId,
    startAt: isNum,
    endAt: isNumOrNull,
    intensity: isNumOrNull,
    note: isStrOrNull,
    deletedAt: isNumOrNull,
    timeChanged: (x) => typeof x === 'boolean',
    reviewed: (x) => typeof x === 'boolean',
    updatedAt: isNum,
  });

const isEvent = (v: unknown) =>
  shaped(v, {
    id: isId,
    sessionId: isId,
    at: isNum,
    type: oneOf(['waters', 'bleeding', 'reduced-movement', 'called-midwife', 'went-to-hospital', 'note']),
    details: (x) => x === null || oneOf(['clear', 'pink', 'green-brown', 'unsure'])(x),
    note: isStrOrNull,
    deletedAt: isNumOrNull,
    updatedAt: isNum,
  });

const isBool = (x: unknown) => typeof x === 'boolean';
const isThreshold = (v: unknown) => {
  const base = { id: isId, enabled: isBool, label: isStrOrNull, preset: isBool };
  if (!isObj(v)) return false;
  if (v.kind === 'n-in-m') return shaped(v, { ...base, n: isNum, minutes: isNum });
  if (v.kind === 'ald') return shaped(v, { ...base, apartMin: isNum, lastingMin: isNum, hours: isNum });
  return false;
};

const isSettings = (v: unknown) =>
  shaped(v, {
    thresholds: (x) => Array.isArray(x) && x.every(isThreshold),
    intensityScale: oneOf(['words', 'numeric', 'both']),
    theme: oneOf(['night', 'day', 'system']),
    keepAwake: isBool,
    haptics: isBool,
    breathingGlow: isBool,
    lastBackupAt: isNumOrNull,
    onboardedAt: isNumOrNull,
  });

const REJECTED: ParsedBackup = { ok: false, error: NOT_A_BACKUP };

export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return REJECTED;
  }
  if (!isObj(data) || data.app !== 'ebb' || data.schema !== 1 || !isNum(data.exportedAt)) return REJECTED;
  const { sessions, contractions, events, settings } = data;
  if (!Array.isArray(sessions) || !Array.isArray(contractions) || !Array.isArray(events)) return REJECTED;
  if (!sessions.every(isSession) || !contractions.every(isContraction) || !events.every(isEvent) || !isSettings(settings)) {
    return REJECTED;
  }
  const ids = new Set((sessions as Session[]).map((s) => s.id));
  if (![...(contractions as Contraction[]), ...(events as EbbEvent[])].every((r) => ids.has(r.sessionId))) return REJECTED;
  return {
    ok: true,
    backup: data as unknown as Backup,
    counts: { sessions: sessions.length, contractions: contractions.length, events: events.length },
  };
}

// --- restore ---

/** Imported active sessions are closed at their latest timestamp; imported open contractions are dropped. */
function normalise(backup: Backup): { sessions: Session[]; contractions: Contraction[]; events: EbbEvent[]; dropped: number } {
  const contractions = backup.contractions.filter((c) => c.endAt !== null);
  const dropped = backup.contractions.length - contractions.length;
  const sessions = backup.sessions.map((s) => {
    if (s.endedAt !== null) return s;
    const stamps = [
      s.startedAt,
      ...backup.contractions.filter((c) => c.sessionId === s.id).flatMap((c) => [c.startAt, c.endAt ?? c.startAt]),
      ...backup.events.filter((e) => e.sessionId === s.id).map((e) => e.at),
    ];
    return { ...s, endedAt: Math.max(...stamps) };
  });
  return { sessions, contractions, events: backup.events, dropped };
}

export async function snapshotToBackupsCache(reason: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  const now = Date.now();
  const json = JSON.stringify(await buildBackup(now));
  const cache = await caches.open(BACKUP_CACHE);
  await cache.put(`/backups/${new Date(now).toISOString()}-${reason}.json`, new Response(json, { headers: { 'Content-Type': 'application/json' } }));
}

export function restoreBackup(backup: Backup, mode: 'merge' | 'replace'): Promise<{ added: number; skipped: number }> {
  const incoming = normalise(backup);
  const requireIdle = async () => {
    if (await findActiveSession()) throw new InvariantError('Restore is not available during an active session');
  };
  return runWrite(
    async () => {
      // Checked inside the transaction: a session started by this or another tab can no longer slip in before the swap.
      await requireIdle();
      const db = getDb();
      const result = { added: 0, skipped: incoming.dropped };
      if (mode === 'replace') {
        const device = await db.settings.get('singleton');
        await Promise.all([db.sessions.clear(), db.contractions.clear(), db.events.clear(), db.undo.clear()]);
        await db.sessions.bulkPut(incoming.sessions);
        await db.contractions.bulkPut(incoming.contractions);
        await db.events.bulkPut(incoming.events);
        await db.settings.put({ ...backup.settings, onboardedAt: device?.onboardedAt ?? null }, 'singleton');
        result.added = incoming.sessions.length + incoming.contractions.length + incoming.events.length;
        return result;
      }
      for (const [table, rows] of [
        [db.sessions, incoming.sessions],
        [db.contractions, incoming.contractions],
        [db.events, incoming.events],
      ] as const) {
        const existing = new Map<string, { updatedAt: number }>();
        for (const e of await (table as typeof db.sessions).bulkGet(rows.map((r) => r.id))) if (e) existing.set(e.id, e);
        const toWrite = rows.filter((r) => {
          const found = existing.get(r.id);
          return !found || r.updatedAt > found.updatedAt;
        });
        result.skipped += rows.length - toWrite.length;
        result.added += toWrite.length;
        await (table as typeof db.sessions).bulkPut(toWrite as Session[]);
      }
      await db.undo.clear();
      return result;
    },
    [],
    {
      // Not a tap: if storage fails this rejects instead of pretending. The safety snapshot is taken inside the queue,
      // right before the swap, after earlier writes were flushed.
      parkable: false,
      before: mode === 'replace' ? async () => { await requireIdle(); await snapshotToBackupsCache('before-replace'); } : undefined,
    },
  );
}

export async function deleteAllData(): Promise<void> {
  await runWrite(
    async () => {
      const db = getDb();
      await Promise.all([db.sessions.clear(), db.contractions.clear(), db.events.clear(), db.settings.clear(), db.undo.clear()]);
    },
    [],
    { parkable: false },
  );
  // Only reached once the clear committed. Only the user's backups: the Workbox precache must survive so the app opens offline.
  if (typeof caches !== 'undefined') await caches.delete(BACKUP_CACHE);
}
