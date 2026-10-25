import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startContraction, stopContraction } from './contractions';
import { getQueueSnapshot, intend, retryPendingWrites, runWrite, setRetryDelays } from './queue';
import { getDb } from './schema';
import { startSession } from './sessions';
import { dropDb, freshDb } from './testDb';
import { mergeOverlay } from '../state/overlay';

beforeEach(freshDb);
afterEach(async () => {
  vi.restoreAllMocks();
  await dropDb();
});

describe('runWrite', () => {
  it('serialises writes in call order', async () => {
    const order: string[] = [];
    const slow = runWrite(async () => {
      for (let i = 0; i < 5; i++) await getDb().sessions.count();
      order.push('first');
    });
    const fast = runWrite(async () => {
      order.push('second');
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(['first', 'second']);
  });

  it('runs each op inside a Dexie rw transaction', async () => {
    const mode = await runWrite(async () => {
      const { default: Dexie } = await import('dexie');
      return Dexie.currentTransaction?.mode;
    });
    expect(mode).toBe('readwrite');
  });

  it('retries a failing write 3 times (100, 300, 900 ms) and then goes failing, keeping the tap', async () => {
    const s = await startSession(1000);
    const db = getDb();
    const put = vi.spyOn(db.contractions, 'put').mockRejectedValue(new Error('QuotaExceededError'));
    const delays: number[] = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      delays.push(ms ?? 0);
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    const c = await startContraction(s.id, 2000);

    expect(put).toHaveBeenCalledTimes(4); // first try + 3 retries
    expect(delays.filter((d) => [100, 300, 900].includes(d))).toEqual([100, 300, 900]);
    expect(c).toMatchObject({ startAt: 2000, endAt: null });
    expect(getQueueSnapshot()).toMatchObject({ status: 'failing', pendingCount: 1 });
    expect(await db.contractions.count()).toBe(0);
    const overlaid = mergeOverlay<{ id: string }>([], getQueueSnapshot().overlay, 'contractions');
    expect(overlaid.map((r) => r.id)).toEqual([c.id]);
  });

  it('Retry commits the pending write, clears the overlay and returns to ok', async () => {
    setRetryDelays([0, 0, 0]);
    const s = await startSession(1000);
    const db = getDb();
    const put = vi.spyOn(db.contractions, 'put').mockRejectedValue(new Error('disk full'));
    const c = await startContraction(s.id, 2000);
    expect(getQueueSnapshot().status).toBe('failing');
    expect(await retryPendingWrites()).toBe(false);
    expect(getQueueSnapshot().pendingCount).toBe(1);

    put.mockRestore();
    expect(await retryPendingWrites()).toBe(true);
    expect(getQueueSnapshot()).toMatchObject({ status: 'ok', pendingCount: 0, overlay: [] });
    expect((await db.contractions.get(c.id))?.startAt).toBe(2000);
  });

  it('replays pending writes in order, ahead of later writes', async () => {
    setRetryDelays([0, 0, 0]);
    const s = await startSession(1000);
    const db = getDb();
    const put = vi.spyOn(db.contractions, 'put').mockRejectedValue(new Error('disk full'));
    const c = await startContraction(s.id, 2000);
    const stopped = await stopContraction(c.id, 3000).catch((e) => e);
    // The open row never reached the database, so stop can't find it: a loud error, not a silent loss.
    expect(stopped).toBeInstanceOf(Error);
    put.mockRestore();
    const next = await startContraction(s.id, 5000).catch((e) => e);
    // The pending start was flushed first, so the second start sees an open contraction.
    expect((next as Error).message).toMatch(/in progress/);
    expect((await db.contractions.get(c.id))?.startAt).toBe(2000);
    expect(getQueueSnapshot().status).toBe('ok');
  });

  it('does not retry domain errors', async () => {
    const sleep = vi.spyOn(globalThis, 'setTimeout');
    await startSession(1000);
    await expect(startSession(2000)).rejects.toThrow(/already active/);
    expect(getQueueSnapshot().status).toBe('ok');
    expect(sleep.mock.calls.filter(([, ms]) => ms === 100)).toHaveLength(0);
  });

  it('rejects when storage fails before the op decided what to write', async () => {
    setRetryDelays([0, 0, 0]);
    await expect(
      runWrite(async () => {
        throw new Error('cannot read');
      }),
    ).rejects.toThrow('cannot read');
    expect(getQueueSnapshot().pendingCount).toBe(0);
  });

  it('intend outside runWrite is a programming error', () => {
    expect(() => intend(1)).toThrow(/inside runWrite/);
  });
});
