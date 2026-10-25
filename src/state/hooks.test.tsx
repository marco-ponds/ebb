import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteContraction, startContraction, stopContraction } from '../db/contractions';
import { addEvent, deleteEvent } from '../db/events';
import { setRetryDelays } from '../db/queue';
import { getDb } from '../db/schema';
import { endSession, renameSession, startSession } from '../db/sessions';
import { dropDb, freshDb } from '../db/testDb';
import { undoLast } from '../db/undo';
import { retryPendingWrites } from '../db/queue';
import { useContractions, useEvents, useSession, useSessions, useSettings, useStorageStatus, useUndoAvailable } from './hooks';
import { initStore, teardownStore } from './store';

beforeEach(async () => {
  await freshDb();
  await initStore();
});
afterEach(async () => {
  teardownStore();
  vi.restoreAllMocks();
  await dropDb();
});

describe('hooks', () => {
  it('useSessions is undefined while loading, then newest first', async () => {
    const a = await startSession(1000);
    await endSession(a.id, 2000);
    const b = await startSession(5000);
    const { result } = renderHook(() => useSessions());
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current?.map((s) => s.id)).toEqual([b.id, a.id]));
  });

  it('useSession follows renames and returns null for unknown ids', async () => {
    const s = await startSession(1000);
    const { result } = renderHook(() => useSession(s.id));
    const missing = renderHook(() => useSession('nope'));
    await waitFor(() => expect(result.current?.name).toBeNull());
    await waitFor(() => expect(missing.result.current).toBeNull());
    await act(async () => void (await renameSession(s.id, 'Tuesday')));
    await waitFor(() => expect(result.current?.name).toBe('Tuesday'));
  });

  it('useContractions lists non-deleted rows by startAt and updates live', async () => {
    const s = await startSession(1000);
    const late = await startContraction(s.id, 9000);
    await stopContraction(late.id, 9500);
    const { result } = renderHook(() => useContractions(s.id));
    await waitFor(() => expect(result.current?.map((c) => c.id)).toEqual([late.id]));
    const early = await startContraction(s.id, 2000);
    await stopContraction(early.id, 2500);
    await waitFor(() => expect(result.current?.map((c) => c.id)).toEqual([early.id, late.id]));
    await deleteContraction(early.id);
    await waitFor(() => expect(result.current?.map((c) => c.id)).toEqual([late.id]));
  });

  it('useEvents lists non-deleted events by time', async () => {
    const s = await startSession(1000);
    const e2 = await addEvent(s.id, { type: 'note', at: 5000 });
    const e1 = await addEvent(s.id, { type: 'bleeding', at: 3000 });
    const { result } = renderHook(() => useEvents(s.id));
    await waitFor(() => expect(result.current?.map((e) => e.id)).toEqual([e1.id, e2.id]));
    await deleteEvent(e1.id);
    await waitFor(() => expect(result.current?.map((e) => e.id)).toEqual([e2.id]));
  });

  it('useSettings, useUndoAvailable and useStorageStatus read the store', async () => {
    const s = await startSession(1000);
    const settings = renderHook(() => useSettings());
    const undo = renderHook(() => useUndoAvailable());
    const storage = renderHook(() => useStorageStatus());
    expect(settings.result.current.theme).toBe('night');
    expect(undo.result.current).toBe(false);
    expect(storage.result.current).toEqual({ status: 'ok', pendingCount: 0, conflictCount: 0 });
    await startContraction(s.id, 2000);
    await waitFor(() => expect(undo.result.current).toBe(true));
    await undoLast();
    await waitFor(() => expect(undo.result.current).toBe(false));
  });

  it('returns the overlaid record while storage is failing, and the committed one after Retry', async () => {
    setRetryDelays([0, 0, 0]);
    const s = await startSession(1000);
    const { result } = renderHook(() => useContractions(s.id));
    await waitFor(() => expect(result.current).toEqual([]));
    const put = vi.spyOn(getDb().contractions, 'put').mockRejectedValue(new Error('full'));
    const c = await startContraction(s.id, 2000);
    await waitFor(() => expect(result.current?.map((r) => r.id)).toEqual([c.id]));
    expect(await getDb().contractions.count()).toBe(0);
    put.mockRestore();
    await act(async () => void (await retryPendingWrites()));
    await waitFor(() => expect(result.current?.map((r) => r.id)).toEqual([c.id]));
    expect(await getDb().contractions.count()).toBe(1);
  });
});
