import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startContraction, stopContraction } from './contractions';
import { getQueueSnapshot, retryPendingWrites, runWrite, setRetryDelays, write } from './queue';
import { undoLast } from './undo';
import { deleteAllData, restoreBackup, buildBackup } from './backup';
import { endSession } from './sessions';
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

  describe('while an earlier write is parked', () => {
    async function parkedStart() {
      setRetryDelays([0, 0, 0]);
      const s = await startSession(1000);
      const put = vi.spyOn(getDb().contractions, 'put').mockRejectedValue(new Error('disk full'));
      const c = await startContraction(s.id, 2000);
      return { s, c, put };
    }

    it('a stop after a parked start is kept, and Retry commits both in order', async () => {
      const { c, put } = await parkedStart();
      const stopped = await stopContraction(c.id, 3000);
      expect(stopped).toMatchObject({ id: c.id, startAt: 2000, endAt: 3000 });
      expect(getQueueSnapshot()).toMatchObject({ status: 'failing', pendingCount: 2 });
      const shown = mergeOverlay<{ id: string; endAt: number | null }>([], getQueueSnapshot().overlay, 'contractions');
      expect(shown).toEqual([expect.objectContaining({ id: c.id, endAt: 3000 })]);
      put.mockRestore();
      expect(await retryPendingWrites()).toBe(true);
      expect(await getDb().contractions.get(c.id)).toMatchObject({ startAt: 2000, endAt: 3000 });
      expect(getQueueSnapshot()).toMatchObject({ status: 'ok', pendingCount: 0 });
    });

    it('invariants hold across parked and new ops (no second open contraction)', async () => {
      const { s } = await parkedStart();
      await expect(startContraction(s.id, 2500)).rejects.toThrow(/in progress/);
      expect(getQueueSnapshot().pendingCount).toBe(1);
    });

    it('undo targets the latest intended action, not an older committed one', async () => {
      setRetryDelays([0, 0, 0]);
      const s = await startSession(1000);
      const first = await startContraction(s.id, 2000);
      await stopContraction(first.id, 3000); // committed; the DB undo slot now says "stop first"
      const put = vi.spyOn(getDb().contractions, 'put').mockRejectedValue(new Error('disk full'));
      const second = await startContraction(s.id, 5000); // parked
      expect(await undoLast()).toBe('start');
      const shown = mergeOverlay<{ id: string }>([{ id: first.id }], getQueueSnapshot().overlay, 'contractions');
      expect(shown.map((r) => r.id)).toEqual([first.id]);
      put.mockRestore();
      expect(await retryPendingWrites()).toBe(true);
      expect(await getDb().contractions.get(second.id)).toBeUndefined();
      expect((await getDb().contractions.get(first.id))?.endAt).toBe(3000); // the older action was left alone
      expect(await getDb().undo.get('singleton')).toBeUndefined();
    });

    it('the parked undo entry is what undo reads next', async () => {
      const { c } = await parkedStart();
      await stopContraction(c.id, 3000);
      expect(await undoLast()).toBe('stop'); // reopens the parked row
      const shown = mergeOverlay<{ id: string; endAt: number | null }>([], getQueueSnapshot().overlay, 'contractions');
      expect(shown[0]).toMatchObject({ id: c.id, endAt: null });
    });
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

  it('write outside runWrite is a programming error', async () => {
    await expect(write('sessions', 'x', null)).rejects.toThrow(/inside runWrite/);
  });

  describe('bulk operations are not taps', () => {
    it('restoreBackup rejects when storage fails, parks nothing and changes nothing', async () => {
      setRetryDelays([0, 0, 0]);
      const s = await startSession(1000);
      await endSession(s.id, 2000);
      const backup = await buildBackup(5000);
      vi.spyOn(getDb().sessions, 'bulkPut').mockRejectedValue(new Error('disk full'));
      await expect(restoreBackup({ ...backup, sessions: [{ ...backup.sessions[0], id: 'new' }], contractions: [], events: [] }, 'merge')).rejects.toThrow('disk full');
      expect(getQueueSnapshot()).toMatchObject({ status: 'ok', pendingCount: 0 });
      expect(await getDb().sessions.get('new')).toBeUndefined();
    });

    it('deleteAllData rejects when the clear fails and keeps the backups cache', async () => {
      setRetryDelays([0, 0, 0]);
      await startSession(1000);
      const deleted: string[] = [];
      vi.stubGlobal('caches', { delete: async (n: string) => void deleted.push(n) });
      vi.spyOn(getDb().sessions, 'clear').mockRejectedValue(new Error('disk full'));
      await expect(deleteAllData()).rejects.toThrow('disk full');
      expect(deleted).toEqual([]);
      expect(await getDb().sessions.count()).toBe(1);
      vi.unstubAllGlobals();
    });

    it('Replace re-checks for an active session inside the queue, so a session queued first survives', async () => {
      const s0 = await startSession(1000);
      await endSession(s0.id, 2000);
      const backup = await buildBackup(5000);
      const started = startSession(9000); // queued before the restore, so it commits before the restore runs
      const restore = restoreBackup(backup, 'replace');
      const live = await started;
      await expect(restore).rejects.toThrow(/active session/);
      expect((await getDb().sessions.get(live.id))?.endedAt).toBeNull();
    });

    it('does not run while earlier writes are still parked', async () => {
      setRetryDelays([0, 0, 0]);
      const s = await startSession(1000);
      await endSession(s.id, 1500);
      const backup = await buildBackup(5000);
      const s2 = await startSession(6000);
      const put = vi.spyOn(getDb().sessions, 'put').mockRejectedValue(new Error('disk full'));
      await endSession(s2.id, 7000); // parked
      await expect(restoreBackup(backup, 'replace')).rejects.toThrow(/not saved yet/);
      put.mockRestore();
    });
  });
});
