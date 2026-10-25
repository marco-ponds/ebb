// Reads for write ops: the database plus whatever is parked or already written by the op in flight,
// so an op always sees the state the user sees.
import { intendedWrite, intendedWrites } from './queue';
import { getDb } from './schema';
import type { Contraction, EbbEvent, Session, Settings, UndoEntry } from './types';

interface RowOf {
  sessions: Session;
  contractions: Contraction;
  events: EbbEvent;
}

export async function getRow<T extends keyof RowOf>(table: T, id: string): Promise<RowOf[T] | undefined> {
  const intended = intendedWrite(table, id);
  if (intended) return (intended.value ?? undefined) as RowOf[T] | undefined;
  return (await getDb()[table].get(id)) as RowOf[T] | undefined;
}

/** All rows of a table, or of one session, with intended writes applied. */
export async function rowsOf<T extends keyof RowOf>(table: T, sessionId?: string): Promise<RowOf[T][]> {
  const db = getDb();
  const dbRows = (
    sessionId !== undefined && table !== 'sessions'
      ? await db[table as 'contractions' | 'events'].where('sessionId').equals(sessionId).toArray()
      : await db[table].toArray()
  ) as RowOf[T][];
  const byId = new Map<string, RowOf[T]>(dbRows.map((r) => [r.id, r]));
  for (const w of intendedWrites(table)) {
    if (w.value === null) byId.delete(w.id);
    else byId.set(w.id, w.value as RowOf[T]);
  }
  const rows = [...byId.values()];
  return sessionId !== undefined && table !== 'sessions'
    ? rows.filter((r) => (r as Contraction | EbbEvent).sessionId === sessionId)
    : rows;
}

export async function findActiveSession(): Promise<Session | undefined> {
  // The endedAt index does not hold nulls, so filter instead of querying it.
  return (await rowsOf('sessions')).find((s) => s.endedAt === null);
}

export async function getUndoEntry(): Promise<UndoEntry | undefined> {
  const intended = intendedWrite('undo', 'singleton');
  if (intended) return (intended.value ?? undefined) as UndoEntry | undefined;
  return getDb().undo.get('singleton');
}

export async function getSettingsRow(): Promise<Settings | undefined> {
  const intended = intendedWrite('settings', 'singleton');
  if (intended) return (intended.value ?? undefined) as Settings | undefined;
  return getDb().settings.get('singleton');
}
