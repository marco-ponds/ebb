import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startContraction } from './contractions';
import { clearConflicts, getQueueSnapshot, retryPendingWrites, setRetryDelays } from './queue';
import { createDb, getDb } from './schema';
import { startSession } from './sessions';
import { dropDb, freshDb } from './testDb';
import type { Contraction, Session } from './types';

// "Tab A" is this module's queue and database. "Tab B" is a second, independent connection to the same IndexedDB.
const tabB = () => createDb();

const session = (id: string, over: Partial<Session> = {}): Session => ({
  id, name: null, startedAt: 500, endedAt: null, notes: '', createdAt: 500, updatedAt: 500, thresholdMetAt: null, ...over,
});
const open = (id: string, sessionId: string, startAt: number): Contraction => ({
  id, sessionId, startAt, endAt: null, intensity: null, note: null, deletedAt: null, timeChanged: false, reviewed: false, updatedAt: startAt,
});

beforeEach(async () => {
  await freshDb();
  setRetryDelays([0, 0, 0]);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await dropDb();
});

async function parkOnTabA<T>(table: 'contractions' | 'sessions', run: () => Promise<T>) {
  const spy = vi.spyOn(getDb()[table], 'put').mockRejectedValue(new Error('disk full'));
  const result = await run();
  expect(getQueueSnapshot().status).toBe('failing');
  return { result, recover: () => spy.mockRestore() };
}

describe('replaying parked writes re-checks the cross-tab invariants', () => {
  it('two open contractions: the second start is reported as a conflict, not applied or dropped', async () => {
    const s = await startSession(1000);
    const { recover } = await parkOnTabA('contractions', () => startContraction(s.id, 2000));
    const b = tabB();
    await b.contractions.put(open('from-b', s.id, 2100)); // tab B committed its own start meanwhile
    recover();

    expect(await retryPendingWrites()).toBe(false);

    const rows = await getDb().contractions.toArray();
    expect(rows.filter((c) => c.endAt === null).map((c) => c.id)).toEqual(['from-b']);
    const snap = getQueueSnapshot();
    expect(snap.conflicts).toHaveLength(1);
    expect(snap.conflicts[0].reason).toMatch(/already in progress/);
    expect(snap.pendingCount).toBe(0);
    expect(snap.overlay).toEqual([]); // the UI now reflects the database
    expect(snap.status).toBe('failing');
    b.close();
  });

  it('two active sessions: a parked startSession conflicts with the one another tab started', async () => {
    const { recover } = await parkOnTabA('sessions', () => startSession(1000));
    const b = tabB();
    await b.sessions.put(session('from-b'));
    recover();
    expect(await retryPendingWrites()).toBe(false);
    expect((await getDb().sessions.toArray()).filter((s) => s.endedAt === null).map((s) => s.id)).toEqual(['from-b']);
    expect(getQueueSnapshot().conflicts[0].reason).toMatch(/already active/);
    b.close();
  });

  it('a parked start into a session another tab ended is a conflict', async () => {
    const s = await startSession(1000);
    const { recover } = await parkOnTabA('contractions', () => startContraction(s.id, 2000));
    const b = tabB();
    await b.sessions.put({ ...s, endedAt: 1500, updatedAt: 1500 });
    recover();
    expect(await retryPendingWrites()).toBe(false);
    expect(await getDb().contractions.count()).toBe(0);
    expect(getQueueSnapshot().conflicts[0].reason).toMatch(/has ended/);
    b.close();
  });

  it('keeps later parked sets parked and applies nothing out of order; clearConflicts empties the report', async () => {
    const s = await startSession(1000);
    const { recover } = await parkOnTabA('contractions', () => startContraction(s.id, 2000));
    const b = tabB();
    await b.contractions.put(open('from-b', s.id, 2100));
    recover();
    await retryPendingWrites();
    expect(getQueueSnapshot().conflicts).toHaveLength(1);
    clearConflicts();
    expect(getQueueSnapshot().conflicts).toEqual([]);
    b.close();
  });

  it('applies a parked set normally when nothing conflicts', async () => {
    const s = await startSession(1000);
    const { result: c, recover } = await parkOnTabA('contractions', () => startContraction(s.id, 2000));
    recover();
    expect(await retryPendingWrites()).toBe(true);
    expect((await getDb().contractions.get(c.id))?.endAt).toBeNull();
    expect(getQueueSnapshot().conflicts).toEqual([]);
  });
});
