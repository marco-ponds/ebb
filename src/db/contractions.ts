import { InvariantError, OverlapError } from './errors';
import { intend, runWrite } from './queue';
import { getDb } from './schema';
import type { Contraction } from './types';
import { clearUndo, recordUndo } from './undo';

export interface ContractionPatch {
  startAt?: number;
  endAt?: number;
  intensity?: number | null;
  note?: string | null;
}

async function requireContraction(id: string): Promise<Contraction> {
  const row = await getDb().contractions.get(id);
  if (!row || row.deletedAt !== null) throw new InvariantError(`No contraction ${id}`);
  return row;
}

function checkIntensity(intensity: number | null | undefined): void {
  if (intensity != null && !(Number.isInteger(intensity) && intensity >= 1 && intensity <= 10)) {
    throw new RangeError('Intensity must be a whole number from 1 to 10');
  }
}

/** Same rule as the domain's findOverlap: finished, non-deleted contractions overlap if each starts before the other ends. */
async function findOverlapping(sessionId: string, startAt: number, endAt: number, ignoreId?: string): Promise<Contraction | undefined> {
  const rows = await getDb().contractions.where('sessionId').equals(sessionId).toArray();
  return rows.find((c) => c.id !== ignoreId && c.deletedAt === null && c.endAt !== null && startAt < c.endAt && c.startAt < endAt);
}

export function startContraction(sessionId: string, now: number = Date.now()): Promise<Contraction> {
  const id = crypto.randomUUID(); // chosen once: a retried write must commit the row the overlay showed
  return runWrite(async () => {
    const db = getDb();
    const session = await db.sessions.get(sessionId);
    if (!session || session.endedAt !== null) throw new InvariantError('Contractions can only start in the active session');
    const rows = (await db.contractions.where('sessionId').equals(sessionId).toArray()).filter((c) => c.deletedAt === null);
    if (rows.some((c) => c.endAt === null)) throw new InvariantError('A contraction is already in progress');
    const latest = rows.reduce<number | null>((max, c) => (max === null || c.startAt > max ? c.startAt : max), null);
    const row: Contraction = {
      id,
      sessionId,
      startAt: now,
      endAt: null,
      intensity: null,
      note: null,
      deletedAt: null,
      timeChanged: latest !== null && now < latest,
      reviewed: false,
      updatedAt: now,
    };
    intend(row, [{ table: 'contractions', id: row.id, value: row }]);
    await db.contractions.put(row);
    await recordUndo('start', [{ table: 'contractions', id: row.id, value: null }], now);
    return row;
  });
}

export function stopContraction(id: string, now: number = Date.now()): Promise<Contraction> {
  return runWrite(async () => {
    const before = await requireContraction(id);
    if (before.endAt !== null) throw new InvariantError('This contraction has already stopped');
    const row = { ...before, endAt: now, updatedAt: now };
    intend(row, [{ table: 'contractions', id, value: row }]);
    await getDb().contractions.put(row);
    await recordUndo('stop', [{ table: 'contractions', id, value: before }], now);
    return row;
  });
}

/** "Started by mistake": removes the row for good. */
export function discardContraction(id: string): Promise<void> {
  return runWrite(async () => {
    intend(undefined, [{ table: 'contractions', id, value: null }]);
    await getDb().contractions.delete(id);
    await clearUndo();
  });
}

export function rateContraction(id: string, intensity: number | null): Promise<Contraction> {
  return runWrite(async () => {
    checkIntensity(intensity);
    const before = await requireContraction(id);
    const now = Date.now();
    const row = { ...before, intensity, updatedAt: now };
    intend(row, [{ table: 'contractions', id, value: row }]);
    await getDb().contractions.put(row);
    await recordUndo('rate', [{ table: 'contractions', id, value: before }], now);
    return row;
  });
}

export function updateContraction(id: string, patch: ContractionPatch): Promise<Contraction> {
  return runWrite(async () => {
    checkIntensity(patch.intensity);
    const before = await requireContraction(id);
    const now = Date.now();
    const row: Contraction = {
      ...before,
      ...(patch.startAt !== undefined && { startAt: patch.startAt }),
      ...(patch.endAt !== undefined && { endAt: patch.endAt }),
      ...(patch.intensity !== undefined && { intensity: patch.intensity }),
      ...(patch.note !== undefined && { note: patch.note }),
      reviewed: true,
      timeChanged: false,
      updatedAt: now,
    };
    if (row.endAt !== null) {
      if (row.endAt <= row.startAt) throw new RangeError('The end needs to be after the start');
      const other = await findOverlapping(row.sessionId, row.startAt, row.endAt, id);
      if (other) throw new OverlapError(other);
    }
    intend(row, [{ table: 'contractions', id, value: row }]);
    await getDb().contractions.put(row);
    await recordUndo('edit', [{ table: 'contractions', id, value: before }], now);
    return row;
  });
}

export function addMissedContraction(
  sessionId: string,
  input: { startAt: number; durationMs: number; intensity?: number | null; note?: string | null },
): Promise<Contraction> {
  const id = crypto.randomUUID();
  return runWrite(async () => {
    checkIntensity(input.intensity);
    if (!(input.durationMs > 0)) throw new RangeError('A contraction needs a duration above zero');
    if (!(await getDb().sessions.get(sessionId))) throw new InvariantError(`No session ${sessionId}`);
    const now = Date.now();
    const endAt = input.startAt + input.durationMs;
    const other = await findOverlapping(sessionId, input.startAt, endAt);
    if (other) throw new OverlapError(other);
    const row: Contraction = {
      id,
      sessionId,
      startAt: input.startAt,
      endAt,
      intensity: input.intensity ?? null,
      note: input.note ?? null,
      deletedAt: null,
      timeChanged: false,
      reviewed: true,
      updatedAt: now,
    };
    intend(row, [{ table: 'contractions', id: row.id, value: row }]);
    await getDb().contractions.put(row);
    await recordUndo('add', [{ table: 'contractions', id: row.id, value: null }], now);
    return row;
  });
}

export function deleteContraction(id: string): Promise<Contraction> {
  return runWrite(async () => {
    const before = await requireContraction(id);
    const now = Date.now();
    const row = { ...before, deletedAt: now, updatedAt: now };
    intend(row, [{ table: 'contractions', id, value: row }]);
    await getDb().contractions.put(row);
    await recordUndo('delete', [{ table: 'contractions', id, value: before }], now);
    return row;
  });
}
