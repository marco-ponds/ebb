import { InvariantError } from './errors';
import { intend, runWrite } from './queue';
import { getDb } from './schema';
import type { Contraction, Session } from './types';
import { clearUndo } from './undo';

async function requireSession(id: string): Promise<Session> {
  const session = await getDb().sessions.get(id);
  if (!session) throw new InvariantError(`No session ${id}`);
  return session;
}

export async function findActiveSession(): Promise<Session | undefined> {
  // The endedAt index does not hold nulls, so filter instead of querying it.
  return getDb().sessions.filter((s) => s.endedAt === null).first();
}

export function startSession(now: number = Date.now()): Promise<Session> {
  const id = crypto.randomUUID(); // chosen once: a retried write must commit the row the overlay showed
  return runWrite(async () => {
    if (await findActiveSession()) throw new InvariantError('A session is already active');
    const session: Session = {
      id,
      name: null,
      startedAt: now,
      endedAt: null,
      notes: '',
      createdAt: now,
      updatedAt: now,
      thresholdMetAt: null,
    };
    intend(session, [{ table: 'sessions', id: session.id, value: session }]);
    await getDb().sessions.put(session);
    await clearUndo();
    return session;
  });
}

export function endSession(id: string, now: number = Date.now()): Promise<Session> {
  return runWrite(async () => {
    const db = getDb();
    const session = await requireSession(id);
    if (session.endedAt !== null) throw new InvariantError('This session has already ended');
    const ended: Session = { ...session, endedAt: now, updatedAt: now };
    const open = await db.contractions.where('sessionId').equals(id).filter((c) => c.endAt === null && c.deletedAt === null).first();
    const closed: Contraction | null = open ? { ...open, endAt: now, updatedAt: now } : null;
    intend(ended, [
      { table: 'sessions', id, value: ended },
      ...(closed ? [{ table: 'contractions' as const, id: closed.id, value: closed }] : []),
    ]);
    await db.sessions.put(ended);
    if (closed) await db.contractions.put(closed);
    await clearUndo();
    return ended;
  });
}

function patchSession(id: string, patch: (s: Session) => Session | null): Promise<Session> {
  return runWrite(async () => {
    const session = await requireSession(id);
    const next = patch(session);
    if (!next) {
      intend(session);
      return session;
    }
    const stamped = { ...next, updatedAt: Date.now() };
    intend(stamped, [{ table: 'sessions', id, value: stamped }]);
    await getDb().sessions.put(stamped);
    return stamped;
  });
}

export function renameSession(id: string, name: string | null): Promise<Session> {
  return patchSession(id, (s) => ({ ...s, name }));
}

export function setSessionNotes(id: string, notes: string): Promise<Session> {
  return patchSession(id, (s) => ({ ...s, notes }));
}

/** Records the first threshold match of a session; later calls change nothing. */
export function markThresholdMet(id: string, at: number): Promise<Session> {
  return patchSession(id, (s) => (s.thresholdMetAt === null ? { ...s, thresholdMetAt: at } : null));
}
