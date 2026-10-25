import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../state/store';
import type { Session } from '../db/types';
import { isWakeLockSupported, useAppWakeLock, useWakeLock, useWakeLockState } from './wakeLock';

interface FakeSentinel extends EventTarget {
  released: boolean;
  release: () => Promise<void>;
}

function fakeSentinel(): FakeSentinel {
  const s = new EventTarget() as FakeSentinel;
  s.released = false;
  s.release = vi.fn(async () => {
    s.released = true;
    s.dispatchEvent(new Event('release'));
  });
  return s;
}

function installWakeLock(request: (type: string) => Promise<unknown>) {
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
}

function removeWakeLock() {
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

const flush = () => act(async () => {});

describe('isWakeLockSupported', () => {
  afterEach(removeWakeLock);

  it('is true when navigator.wakeLock exists', () => {
    installWakeLock(async () => fakeSentinel());
    expect(isWakeLockSupported()).toBe(true);
  });

  it('is false when navigator.wakeLock is missing', () => {
    removeWakeLock();
    expect(isWakeLockSupported()).toBe(false);
  });
});

describe('useWakeLock', () => {
  afterEach(() => {
    removeWakeLock();
    setVisibility('visible');
  });

  it('holds a screen lock while active and enabled', async () => {
    const request = vi.fn(async () => fakeSentinel());
    installWakeLock(request);
    const { result } = renderHook(() => useWakeLock(true, true));
    await flush();
    expect(request).toHaveBeenCalledWith('screen');
    expect(result.current).toBe('held');
  });

  it('reports unavailable when the API is missing', async () => {
    removeWakeLock();
    const { result } = renderHook(() => useWakeLock(true, true));
    await flush();
    expect(result.current).toBe('unavailable');
  });

  it('reports unavailable when the request is rejected', async () => {
    installWakeLock(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    const { result } = renderHook(() => useWakeLock(true, true));
    await flush();
    expect(result.current).toBe('unavailable');
  });

  it('is off, and never requests, when the setting is off', async () => {
    const request = vi.fn(async () => fakeSentinel());
    installWakeLock(request);
    const { result } = renderHook(() => useWakeLock(true, false));
    await flush();
    expect(result.current).toBe('off');
    expect(request).not.toHaveBeenCalled();
  });

  it('re-acquires every time the page becomes visible again', async () => {
    const sentinels: FakeSentinel[] = [];
    const request = vi.fn(async () => {
      const s = fakeSentinel();
      sentinels.push(s);
      return s;
    });
    installWakeLock(request);
    const { result } = renderHook(() => useWakeLock(true, true));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);

    // The browser drops the lock when the page hides.
    await act(async () => {
      setVisibility('hidden');
      await sentinels[0].release();
    });
    expect(result.current).toBe('unavailable');

    await act(async () => setVisibility('visible'));
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current).toBe('held');
  });

  it('releases the lock when it becomes inactive', async () => {
    const sentinel = fakeSentinel();
    installWakeLock(async () => sentinel);
    const { result, rerender } = renderHook(({ active }) => useWakeLock(active, true), { initialProps: { active: true } });
    await flush();
    expect(result.current).toBe('held');
    rerender({ active: false });
    await flush();
    expect(sentinel.release).toHaveBeenCalled();
    expect(result.current).toBe('off');
  });

  it('releases the lock on unmount', async () => {
    const sentinel = fakeSentinel();
    installWakeLock(async () => sentinel);
    const { unmount } = renderHook(() => useWakeLock(true, true));
    await flush();
    unmount();
    expect(sentinel.release).toHaveBeenCalled();
  });
});

describe('useAppWakeLock', () => {
  const session = { id: 's', name: null, startedAt: 1, endedAt: null, notes: '', createdAt: 1, updatedAt: 1, thresholdMetAt: null } as Session;
  afterEach(() => {
    removeWakeLock();
    useAppStore.setState({ activeSession: null });
  });

  it('holds the lock for the whole session, independent of which screen is mounted, and releases it when the session ends', async () => {
    const sentinel = fakeSentinel();
    const request = vi.fn(async () => sentinel);
    installWakeLock(request);
    useAppStore.setState({ activeSession: session });
    const { result } = renderHook(() => {
      useAppWakeLock();
      return useWakeLockState();
    });
    await flush();
    expect(request).toHaveBeenCalledWith('screen');
    expect(result.current).toBe('held');

    act(() => useAppStore.setState({ activeSession: null }));
    await flush();
    expect(sentinel.release).toHaveBeenCalled();
    expect(result.current).toBe('off');
  });

  it('asks for nothing without a session', async () => {
    const request = vi.fn(async () => fakeSentinel());
    installWakeLock(request);
    renderHook(() => useAppWakeLock());
    await flush();
    expect(request).not.toHaveBeenCalled();
  });
});
