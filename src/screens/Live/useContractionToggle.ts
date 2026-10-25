import { useCallback, useRef, useState } from 'react';
import { startContraction, stopContraction } from '../../db/contractions';
import type { Contraction } from '../../db/types';
import { formatSpoken } from '../../domain/format';
import { setRatingFor } from './rating';
import { hapticStart, hapticStop } from './haptics';

export const DEBOUNCE_MS = 600;
export const DIDNT_APPLY = "That tap didn't apply — the session changed in another window.";

/** The hero's tap handler: ignores a second tap within 600 ms, buzzes, writes, and announces for screen readers. */
export function useContractionToggle(sessionId: string, active: Contraction | null, haptics: boolean) {
  const lastToggle = useRef(Number.NEGATIVE_INFINITY);
  const [announcement, setAnnouncement] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const toggle = useCallback(() => {
    const at = Date.now();
    if (at - lastToggle.current < DEBOUNCE_MS) return;
    lastToggle.current = at;
    setProblem(null);
    // A refused tap (another window got there first) changes nothing; the store re-syncs from the DB.
    const refused = () => setProblem(DIDNT_APPLY);
    if (active) {
      hapticStop(haptics);
      void stopContraction(active.id, at)
        .then((c) => {
          setAnnouncement(`Contraction ended, lasted ${formatSpoken((c.endAt ?? at) - c.startAt)}`);
          setRatingFor(c.id); // the strength card follows a stop made here
        })
        .catch(refused);
    } else {
      hapticStart(haptics);
      void startContraction(sessionId, at)
        .then(() => setAnnouncement('Contraction started'))
        .catch(refused);
    }
  }, [sessionId, active, haptics]);

  return { toggle, announcement, problem, clearProblem: () => setProblem(null) };
}
