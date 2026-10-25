import { intend, runWrite, type OverlayRecord } from './queue';
import { getDb } from './schema';
import type { UndoEntry, UndoKind } from './types';

const KEY = 'singleton';

/** Writes the single undo slot. Call inside a write op so the entry commits with the change it reverses. */
export async function recordUndo(kind: UndoKind, before: UndoEntry['before'], at: number): Promise<void> {
  await getDb().undo.put({ kind, at, before }, KEY);
}

/** Empties the undo slot. Call inside a write op. */
export async function clearUndo(): Promise<void> {
  await getDb().undo.delete(KEY);
}

/** Reverts the last action (depth 1). Resolves with its kind, or null when there was nothing to undo. */
export function undoLast(): Promise<UndoKind | null> {
  return runWrite(async () => {
    const db = getDb();
    const entry = await db.undo.get(KEY);
    if (!entry) return null;
    intend(
      entry.kind,
      entry.before.map((b): OverlayRecord => ({ table: b.table, id: b.id, value: b.value })),
    );
    for (const b of entry.before) {
      const table = db[b.table];
      if (b.value === null) await table.delete(b.id);
      else await table.put(b.value as never);
    }
    await clearUndo();
    return entry.kind;
  });
}

/** Hard-deletes soft-deleted contractions and events once their session ended more than 24 h ago. */
export function purgeExpired(now: number): Promise<number> {
  return runWrite(async () => {
    const db = getDb();
    intend(0);
    const expired = await db.sessions.filter((s) => s.endedAt !== null && s.endedAt + 24 * 3_600_000 <= now).primaryKeys();
    let purged = 0;
    for (const sessionId of expired) {
      const dead = await db.contractions.where('sessionId').equals(sessionId).filter((c) => c.deletedAt !== null).primaryKeys();
      await db.contractions.bulkDelete(dead);
      const deadEvents = await db.events.where('sessionId').equals(sessionId).filter((e) => e.deletedAt !== null).primaryKeys();
      await db.events.bulkDelete(deadEvents);
      purged += dead.length + deadEvents.length;
    }
    return purged;
  });
}
