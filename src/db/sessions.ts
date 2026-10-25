import { newId } from '../lib/uuid';
import { InvariantError } from './errors';
import { runWrite, write } from './queue';
import { findActiveSession, getRow, rowsOf } from './reads';
import type { Session } from './types';
import { clearUndo } from './undo';

export { findActiveSession };

async function requireSession(id: string): Promise<Session> {
  const session = await getRow('sessions', id);
  if (!session) throw new InvariantError(`No session ${id}`);
  return session;
}

export function startSession(now: number = Date.now()): Promise<Session> {
  const id = newId(); // chosen once: a retried write must commit the row the overlay showed
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
    await write('sessions', id, session);
    await clearUndo();
    return session;
  });
}

export function endSession(id: string, now: number = Date.now()): Promise<Session> {
  return runWrite(async () => {
    const session = await requireSession(id);
    if (session.endedAt !== null) throw new InvariantError('This session has already ended');
    const ended: Session = { ...session, endedAt: now, updatedAt: now };
    const open = (await rowsOf('contractions', id)).find((c) => c.endAt === null && c.deletedAt === null);
    await write('sessions', id, ended);
    if (open) await write('contractions', open.id, { ...open, endAt: now, updatedAt: now });
    await clearUndo();
    return ended;
  });
}

function patchSession(id: string, patch: (s: Session) => Session | null): Promise<Session> {
  return runWrite(async () => {
    const session = await requireSession(id);
    const next = patch(session);
    if (!next) return session;
    const stamped = { ...next, updatedAt: Date.now() };
    await write('sessions', id, stamped);
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
