import type { Contraction, Session } from '../db/types';

export type Landing = 'welcome' | 'live' | 'start';

/** The four landing rules, in order. Rule 2 and 3 both open Live; Live itself shows contracting or resting. */
export function decideLanding(s: {
  onboardedAt: number | null;
  activeSession: Session | null;
  activeContraction: Contraction | null;
}): Landing {
  if (s.onboardedAt === null) return 'welcome';
  if (s.activeContraction !== null) return 'live';
  if (s.activeSession !== null) return 'live';
  return 'start';
}
