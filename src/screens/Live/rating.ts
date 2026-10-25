import { useSyncExternalStore } from 'react';

/**
 * Which finished contraction the strength card is open for. Set by a stop made in this view (the hero tap, or "Ended
 * earlier"); module state so the hook (which hides the stats) and the slot component (which draws the card) agree.
 */
let openFor: string | null = null;
const listeners = new Set<() => void>();

export function setRatingFor(id: string | null): void {
  if (openFor === id) return;
  openFor = id;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useRatingFor = (): string | null => useSyncExternalStore(subscribe, () => openFor, () => null);

export { DIDNT_SAVE } from '../../lib/undoFeedback';
