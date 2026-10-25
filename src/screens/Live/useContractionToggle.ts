import { useCallback, useRef, useState } from 'react';
import { startContraction, stopContraction } from '../../db/contractions';
import type { Contraction } from '../../db/types';
import { formatSpoken } from '../../domain/format';
import { hapticStart, hapticStop } from './haptics';

export const DEBOUNCE_MS = 600;

/** The hero's tap handler: ignores a second tap within 600 ms, buzzes, writes, and announces for screen readers. */
export function useContractionToggle(sessionId: string, active: Contraction | null, haptics: boolean) {
  const lastToggle = useRef(Number.NEGATIVE_INFINITY);
  const [announcement, setAnnouncement] = useState('');

  const toggle = useCallback(() => {
    const at = Date.now();
    if (at - lastToggle.current < DEBOUNCE_MS) return;
    lastToggle.current = at;
    if (active) {
      hapticStop(haptics);
      void stopContraction(active.id, at).then((c) =>
        setAnnouncement(`Contraction ended, lasted ${formatSpoken((c.endAt ?? at) - c.startAt)}`),
      );
    } else {
      hapticStart(haptics);
      void startContraction(sessionId, at).then(() => setAnnouncement('Contraction started'));
    }
  }, [sessionId, active, haptics]);

  return { toggle, announcement };
}
