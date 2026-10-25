import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNow } from './useNow';

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout'] });
    vi.setSystemTime(new Date('2026-01-01T10:00:00.100Z'));
  });
  afterEach(() => {
    setHidden(false);
    vi.useRealTimers();
  });

  it('updates once per whole second, not per frame', () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useNow();
    });
    const before = renders;
    act(() => {
      vi.advanceTimersByTime(800); // 10:00:00.900, same second
    });
    expect(renders).toBe(before);
    act(() => {
      vi.advanceTimersByTime(200); // crosses 10:00:01
    });
    expect(renders).toBe(before + 1);
  });

  it('returns Date.now() at the boundary', () => {
    const { result } = renderHook(() => useNow());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(Math.floor(result.current / 1000)).toBe(Math.floor(Date.now() / 1000));
  });

  it('pauses while hidden and recomputes immediately when visible again', () => {
    const { result } = renderHook(() => useNow());
    act(() => setHidden(true));
    const frozen = result.current;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(frozen);
    act(() => setHidden(false));
    expect(result.current).toBe(Date.now());
    expect(result.current).toBeGreaterThanOrEqual(frozen + 5000);
  });
});
