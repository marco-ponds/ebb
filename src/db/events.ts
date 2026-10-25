import { InvariantError } from './errors';
import { intend, runWrite } from './queue';
import { getDb } from './schema';
import type { EbbEvent, EventType, WatersDetail } from './types';
import { recordUndo } from './undo';

export interface EventPatch {
  type?: EventType;
  at?: number;
  details?: WatersDetail | null;
  note?: string | null;
}

async function requireEvent(id: string): Promise<EbbEvent> {
  const row = await getDb().events.get(id);
  if (!row || row.deletedAt !== null) throw new InvariantError(`No event ${id}`);
  return row;
}

export function addEvent(
  sessionId: string,
  input: { type: EventType; at: number; details?: WatersDetail | null; note?: string | null },
): Promise<EbbEvent> {
  const id = crypto.randomUUID();
  return runWrite(async () => {
    if (!(await getDb().sessions.get(sessionId))) throw new InvariantError(`No session ${sessionId}`);
    const now = Date.now();
    const row: EbbEvent = {
      id,
      sessionId,
      at: input.at,
      type: input.type,
      details: input.details ?? null,
      note: input.note ?? null,
      deletedAt: null,
      updatedAt: now,
    };
    intend(row, [{ table: 'events', id: row.id, value: row }]);
    await getDb().events.put(row);
    await recordUndo('event', [{ table: 'events', id: row.id, value: null }], now);
    return row;
  });
}

export function updateEvent(id: string, patch: EventPatch): Promise<EbbEvent> {
  return runWrite(async () => {
    const before = await requireEvent(id);
    const now = Date.now();
    const row: EbbEvent = {
      ...before,
      ...(patch.type !== undefined && { type: patch.type }),
      ...(patch.at !== undefined && { at: patch.at }),
      ...(patch.details !== undefined && { details: patch.details }),
      ...(patch.note !== undefined && { note: patch.note }),
      updatedAt: now,
    };
    intend(row, [{ table: 'events', id, value: row }]);
    await getDb().events.put(row);
    await recordUndo('edit', [{ table: 'events', id, value: before }], now);
    return row;
  });
}

export function deleteEvent(id: string): Promise<EbbEvent> {
  return runWrite(async () => {
    const before = await requireEvent(id);
    const now = Date.now();
    const row = { ...before, deletedAt: now, updatedAt: now };
    intend(row, [{ table: 'events', id, value: row }]);
    await getDb().events.put(row);
    await recordUndo('delete', [{ table: 'events', id, value: before }], now);
    return row;
  });
}
