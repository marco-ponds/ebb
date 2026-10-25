import { useSyncExternalStore } from 'react';
import { useAppStore } from '../state/store';

/** A worker found this soon after launch counts as "a cold start with a worker waiting". */
const COLD_START_MS = 30_000;

let waiting = false;
let applied = false;
/** A session was open at some point in this page's life: the update then waits for the next cold start. */
let sessionSeen = false;
let updateSW: ((reload?: boolean) => Promise<void>) | undefined;
let launchedAt = Date.now();
let unsubscribe: (() => void) | undefined;
const listeners = new Set<() => void>();

function maybeApply(): void {
  if (!waiting || applied || !updateSW) return;
  const { ready, activeSession } = useAppStore.getState();
  if (!ready) return; // decided once the store can say whether a session is open
  if (activeSession || sessionSeen) return; // never activate or reload during a session
  if (Date.now() - launchedAt > COLD_START_MS) return; // later: wait for the next cold start
  applied = true;
  void updateSW(true);
}

/** The shape of `registerSW` from `virtual:pwa-register`. */
export type RegisterSW = (options: { immediate?: boolean; onNeedRefresh?: () => void }) => (reload?: boolean) => Promise<void>;

/**
 * Registers the service worker. Call once, from main.tsx, passing `registerSW` from `virtual:pwa-register`
 * (injected because that virtual module only exists under the Vite PWA plugin, not under Vitest).
 */
export function initSwUpdate(registerSW: RegisterSW): void {
  waiting = false;
  applied = false;
  sessionSeen = false;
  launchedAt = Date.now();
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      waiting = true;
      listeners.forEach((l) => l());
      maybeApply();
    },
  });
  unsubscribe?.();
  unsubscribe = useAppStore.subscribe((state) => {
    if (state.activeSession) sessionSeen = true;
    maybeApply();
  });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

/** True while a new version is installed and waiting for the next cold start. */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(subscribe, () => waiting, () => false);
}
