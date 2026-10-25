import { runWrite, write } from './queue';
import { getUndoEntry, rowsOf } from './reads';
import type { UndoEntry, UndoKind } from './types';

/** Writes the single undo slot. Call inside a write op so the entry commits with the change it reverses. */
export function recordUndo(kind: UndoKind, before: UndoEntry['before'], at: number): Promise<void> {
  return write('undo', 'singleton', { kind, at, before });
}

/** Empties the undo slot. Call inside a write op. */
export function clearUndo(): Promise<void> {
  return write('undo', 'singleton', null);
}

/** Reverts the last action (depth 1), including actions still waiting to be saved. Resolves with its kind, or null. */
export function undoLast(): Promise<UndoKind | null> {
  return runWrite(async () => {
    const entry = await getUndoEntry();
    if (!entry) return null;
    for (const b of entry.before) await write(b.table, b.id, b.value);
    await clearUndo();
    return entry.kind;
  });
}

/** Hard-deletes soft-deleted contractions and events once their session ended more than 24 h ago. */
export function purgeExpired(now: number): Promise<number> {
  return runWrite(async () => {
    const expired = (await rowsOf('sessions')).filter((s) => s.endedAt !== null && s.endedAt + 24 * 3_600_000 <= now);
    let purged = 0;
    for (const session of expired) {
      for (const c of await rowsOf('contractions', session.id)) {
        if (c.deletedAt === null) continue;
        await write('contractions', c.id, null);
        purged++;
      }
      for (const e of await rowsOf('events', session.id)) {
        if (e.deletedAt === null) continue;
        await write('events', e.id, null);
        purged++;
      }
    }
    return purged;
  });
}

