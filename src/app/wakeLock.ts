import { useEffect, useState } from 'react';

export type WakeLockState = 'held' | 'unavailable' | 'off';

export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.wakeLock);
}

/**
 * Keeps the screen on while `active && enabled`. The browser drops the lock whenever the page is hidden, so it is
 * requested again on every visibilitychange to visible. Failure is quiet: the state just reads 'unavailable'.
 */
export function useWakeLock(active: boolean, enabled: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>('unavailable');
  const wanted = active && enabled;

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;

    const drop = () => {
      const s = sentinel;
      sentinel = null;
      if (s && !s.released) void s.release().catch(() => undefined);
    };

    const acquire = async () => {
      drop();
      if (!isWakeLockSupported()) {
        setState('unavailable');
        return;
      }
      try {
        const next = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
        setState('held');
        next.addEventListener('release', () => {
          if (sentinel === next) {
            sentinel = null;
            if (!cancelled) setState('unavailable');
          }
        });
      } catch {
        if (!cancelled) setState('unavailable');
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      drop();
    };
  }, [wanted]);

  return wanted ? state : 'off';
}
