import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startContraction, stopContraction } from '../db/contractions';
import { DEFAULT_SETTINGS } from '../db/defaults';
import { getQueueSnapshot, retryPendingWrites, setRetryDelays } from '../db/queue';
import { createDb, getDb, setDb } from '../db/schema';
import { endSession, startSession } from '../db/sessions';
import { updateSettings } from '../db/settings';
import { dropDb, freshDb } from '../db/testDb';
import { undoLast } from '../db/undo';
import { initStore, teardownStore, useAppStore } from './store';

beforeEach(async () => {
  delete document.documentElement.dataset.dbReady;
  await freshDb();
});
afterEach(async () => {
  teardownStore();
  vi.restoreAllMocks();
  await dropDb();
});

const state = () => useAppStore.getState();

describe('initStore', () => {
  it('opens the db, loads the cache, marks ready and sets data-db-ready', async () => {
    await initStore();
    expect(state()).toMatchObject({ ready: true, activeSession: null, activeContraction: null, undo: null });
    expect(state().storage).toEqual({ status: 'ok', pendingCount: 0, conflictCount: 0 });
    expect(state().settings).toEqual(DEFAULT_SETTINGS);
    expect(document.documentElement.dataset.dbReady).toBe('1');
    expect(await getDb().settings.count()).toBe(1);
  });

  it('picks up an active session already on disk', async () => {
    const s = await startSession(1000);
    const c = await startContraction(s.id, 2000);
    await initStore();
    expect(state().activeSession?.id).toBe(s.id);
    expect(state().activeContraction?.id).toBe(c.id);
    expect(state().undo?.kind).toBe('start');
  });

  it('falls back to an in-memory database when open() fails, and still sets data-db-ready', async () => {
    const broken = createDb();
    vi.spyOn(broken, 'open').mockRejectedValue(Object.assign(new Error('storage unavailable'), { name: 'SecurityError' }));
    setDb(broken);
    await initStore();
    expect(getDb()).not.toBe(broken);
    expect(state()).toMatchObject({ ready: true });
    expect(state().storage.status).toBe('memory');
    expect(document.documentElement.dataset.dbReady).toBe('1');
    // The same repository code runs over the fallback.
    const s = await startSession(1000);
    await vi.waitFor(() => expect(state().activeSession?.id).toBe(s.id));
    expect(state().storage.status).toBe('memory');
  });

  it('still sets data-db-ready when even the fallback cannot start', async () => {
    const broken = createDb();
    vi.spyOn(broken, 'open').mockRejectedValue(Object.assign(new Error('nope'), { name: 'InvalidStateError' }));
    setDb(broken);
    vi.spyOn(await import('../db/sync'), 'startSync').mockImplementation(() => {
      throw new Error('late failure');
    });
    await expect(initStore()).rejects.toThrow('late failure');
    expect(document.documentElement.dataset.dbReady).toBe('1');
  });
});

describe('open failures that are not "storage unavailable"', () => {
  it.each(['VersionError', 'DatabaseClosedError', 'AbortError'])('%s surfaces instead of silently switching to memory', async (name) => {
    const broken = createDb();
    vi.spyOn(broken, 'open').mockRejectedValue(Object.assign(new Error('boom'), { name }));
    setDb(broken);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(initStore()).rejects.toThrow('boom');
    expect(log).toHaveBeenCalled();
    expect(getDb()).toBe(broken);
    expect(state().storage.status).toBe('ok');
    expect(document.documentElement.dataset.dbReady).toBe('1');
  });

  it('recognises Dexie-wrapped storage errors', async () => {
    const wrapped = Object.assign(new Error('open failed'), { name: 'OpenFailedError', inner: { name: 'SecurityError' } });
    const broken = createDb();
    vi.spyOn(broken, 'open').mockRejectedValue(wrapped);
    setDb(broken);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await initStore();
    expect(state().storage.status).toBe('memory');
  });
});

describe('persist before render', () => {
  it('changes activeContraction only after the start transaction resolved', async () => {
    const s = await startSession(1000);
    await initStore();
    let seenDuringWrite: unknown = 'unset';
    getDb().contractions.hook('creating', () => {
      seenDuringWrite = state().activeContraction;
    });
    const pending = startContraction(s.id, 2000);
    expect(state().activeContraction).toBeNull(); // nothing optimistic
    const c = await pending;
    expect(seenDuringWrite).toBeNull(); // not even while the write was in flight
    expect(await getDb().contractions.get(c.id)).toBeDefined(); // already on disk
    await vi.waitFor(() => expect(state().activeContraction?.id).toBe(c.id));
  });

  it('p95 of startContraction + stopContraction stays under 50 ms over 100 runs', { retry: 2 }, async () => {
    // Timing-only: the binding in-browser DB-commit budget is checked by the Playwright perf spec; this unit benchmark runs on fake-indexeddb under parallel load.
    const s = await startSession(1000);
    await initStore();
    // Warm-up runs (not measured) so JIT and first-open costs don't land in the sample.
    for (let i = 0; i < 10; i++) {
      const c = await startContraction(s.id, 1_000 + i * 120_000);
      await stopContraction(c.id, 1_000 + i * 120_000 + 60_000);
    }
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      const c = await startContraction(s.id, 10_000 + i * 120_000);
      await stopContraction(c.id, 10_000 + i * 120_000 + 60_000);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[94]).toBeLessThan(50);
  });
});

describe('store follows the database', () => {
  it('tracks session end, undo slot and settings', async () => {
    await initStore();
    const s = await startSession(1000);
    await vi.waitFor(() => expect(state().activeSession?.id).toBe(s.id));
    const c = await startContraction(s.id, 2000);
    await vi.waitFor(() => expect(state().activeContraction?.id).toBe(c.id));
    await stopContraction(c.id, 3000);
    await vi.waitFor(() => expect(state().activeContraction).toBeNull());
    expect(state().undo?.kind).toBe('stop');
    await undoLast();
    await vi.waitFor(() => expect(state().activeContraction?.id).toBe(c.id));
    await endSession(s.id, 4000);
    await vi.waitFor(() => expect(state().activeSession).toBeNull());
    expect(state().undo).toBeNull();
    await updateSettings({ theme: 'day' });
    await vi.waitFor(() => expect(state().settings.theme).toBe('day'));
  });

  it('keeps the tap when storage fails: overlay in the store, then Retry commits', async () => {
    setRetryDelays([0, 0, 0]);
    const s = await startSession(1000);
    await initStore();
    const put = vi.spyOn(getDb().contractions, 'put').mockRejectedValue(new Error('full'));
    const c = await startContraction(s.id, 2000);
    expect(state().activeContraction?.id).toBe(c.id);
    expect(state().storage).toEqual({ status: 'failing', pendingCount: 1, conflictCount: 0 });
    expect(await getDb().contractions.count()).toBe(0);
    put.mockRestore();
    expect(await retryPendingWrites()).toBe(true);
    expect(state().storage).toEqual({ status: 'ok', pendingCount: 0, conflictCount: 0 });
    await vi.waitFor(() => expect(state().activeContraction?.id).toBe(c.id));
    expect(await getDb().contractions.count()).toBe(1);
    expect(getQueueSnapshot().overlay).toEqual([]);
  });

  it('undo availability follows a parked action, not the stale committed one', async () => {
    setRetryDelays([0, 0, 0]);
    const s = await startSession(1000);
    const first = await startContraction(s.id, 2000);
    await stopContraction(first.id, 3000);
    await initStore();
    expect(state().undo?.kind).toBe('stop');
    const put = vi.spyOn(getDb().contractions, 'put').mockRejectedValue(new Error('full'));
    const second = await startContraction(s.id, 5000);
    expect(state().undo?.kind).toBe('start');
    expect(state().activeContraction?.id).toBe(second.id);
    await stopContraction(second.id, 6000);
    expect(state().activeContraction).toBeNull();
    put.mockRestore();
  });
});
