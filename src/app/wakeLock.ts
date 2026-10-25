import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useAppStore } from '../state/store';

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

const useWakeLockStatus = create<{ state: WakeLockState }>(() => ({ state: 'off' }));

/** What the app-level hook currently holds, for the Live header pill. */
export const useWakeLockState = (): WakeLockState => useWakeLockStatus((s) => s.state);

/**
 * Mounted once at the app level: the screen stays on for the whole session, whichever screen is open
 * (a partner reading the charts to the midwife must not see the phone lock), and is released when the session ends.
 */
export function useAppWakeLock(): void {
  const hasSession = useAppStore((s) => s.activeSession !== null);
  const keepAwake = useAppStore((s) => s.settings.keepAwake);
  const state = useWakeLock(hasSession, keepAwake);
  useEffect(() => {
    useWakeLockStatus.setState({ state });
    return () => useWakeLockStatus.setState({ state: 'off' });
  }, [state]);
}
