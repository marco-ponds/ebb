import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

export type InstallHint = { kind: 'none' | 'ios' | 'prompt'; prompt?: () => Promise<void> };

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Captured at import time: main.tsx imports this module first, because the event can fire before React mounts.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
  emit();
});

window.addEventListener('appinstalled', () => {
  deferred = null;
  emit();
});

async function prompt(): Promise<void> {
  const event = deferred;
  if (!event) return;
  deferred = null; // a deferred prompt can be used once
  emit();
  await event.prompt();
  await event.userChoice;
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
}

function isIos(): boolean {
  const nav = navigator;
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

function compute(): InstallHint {
  if (isStandalone()) return { kind: 'none' };
  if (deferred) return { kind: 'prompt', prompt };
  if (isIos()) return { kind: 'ios' };
  return { kind: 'none' };
}

// useSyncExternalStore needs a stable snapshot: recompute only when the inputs change.
let cached: InstallHint = compute();
let cachedKey = '';
function snapshot(): InstallHint {
  const key = `${isStandalone()}|${deferred !== null}|${isIos()}`;
  if (key !== cachedKey) {
    cachedKey = key;
    cached = compute();
  }
  return cached;
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

export function useInstallHint(): InstallHint {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function __resetInstallPromptForTests(): void {
  deferred = null;
  cachedKey = '';
}
