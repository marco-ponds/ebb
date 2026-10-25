import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../db/defaults';
import { useAppStore } from '../state/store';

const updateSW = vi.fn(() => Promise.resolve());
let needRefresh: (() => void) | undefined;
const registerSW = vi.fn((opts: { immediate?: boolean; onNeedRefresh?: () => void }) => {
  needRefresh = opts.onNeedRefresh;
  return updateSW;
});

const session = { id: 's', endedAt: null } as never;

const load = () => import('./swUpdate');

function setStore(p: Partial<ReturnType<typeof useAppStore.getState>>) {
  act(() => useAppStore.setState({ settings: DEFAULT_SETTINGS, ...p }));
}

describe('swUpdate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    updateSW.mockClear();
    registerSW.mockClear();
    needRefresh = undefined;
    useAppStore.setState({ ready: false, activeSession: null });
  });
  afterEach(() => vi.useRealTimers());

  it('useUpdateReady turns true once a worker is waiting', async () => {
    const { initSwUpdate, useUpdateReady } = await load();
    initSwUpdate(registerSW);
    setStore({ ready: true, activeSession: session });
    const { result } = renderHook(() => useUpdateReady());
    expect(result.current).toBe(false);
    act(() => needRefresh?.());
    expect(result.current).toBe(true);
  });

  it('on a cold start with a waiting worker and no session, applies the update', async () => {
    const { initSwUpdate } = await load();
    initSwUpdate(registerSW);
    setStore({ ready: true });
    act(() => needRefresh?.());
    expect(updateSW).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('waits for the store before deciding, then applies when no session is active', async () => {
    const { initSwUpdate } = await load();
    initSwUpdate(registerSW);
    act(() => needRefresh?.());
    expect(updateSW).not.toHaveBeenCalled();
    setStore({ ready: true });
    expect(updateSW).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('never applies while a session is active, even after the session ends', async () => {
    const { initSwUpdate } = await load();
    initSwUpdate(registerSW);
    setStore({ ready: true, activeSession: session });
    act(() => needRefresh?.());
    expect(updateSW).not.toHaveBeenCalled();
    setStore({ activeSession: null });
    expect(updateSW).not.toHaveBeenCalled();
  });

  it('does not apply a worker that turns up long after launch', async () => {
    const { initSwUpdate } = await load();
    initSwUpdate(registerSW);
    setStore({ ready: true });
    vi.setSystemTime(Date.now() + 5 * 60_000);
    act(() => needRefresh?.());
    expect(updateSW).not.toHaveBeenCalled();
  });
});
