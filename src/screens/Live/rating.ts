import { useSyncExternalStore } from 'react';

/**
 * Which finished contraction the strength card is open for. Module state so the hook (which hides the stats) and the
 * slot component (which draws the card) agree; the Live screen clears it when it unmounts.
 */
let openFor: string | null = null;
let openedAt = 0;
const listeners = new Set<() => void>();

export function setRatingFor(id: string | null): void {
  if (openFor === id) return;
  openFor = id;
  openedAt = Date.now();
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useRatingFor = (): string | null => useSyncExternalStore(subscribe, () => openFor, () => null);

/** When the card was last opened, for telling a contraction that just ended from one that was already old. */
export const ratingOpenedAt = (): number => openedAt;
