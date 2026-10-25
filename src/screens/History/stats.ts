import type { Contraction, Session } from '../../db/types';
import { summarizeEnough } from '../../domain/metrics';
import { displayName } from '../../domain/naming';
import { formatDateShort, formatDuration, formatSessionLength, formatTimeRange } from '../../domain/format';

export interface CardStats {
  title: string;
  active: boolean;
  /** "Sun 25 Oct · 21:40 – now · 2 h 19 m" */
  when: string;
  counts: { count: string; apart: string; long: string };
  /** Domain for the sparkline. */
  domain: [number, number];
}

/** Whole-session figures for a History card: from startedAt to endedAt, or to now while active. */
export function cardStats(session: Session, contractions: Contraction[], now: number): CardStats {
  const end = session.endedAt ?? now;
  const summary = summarizeEnough(contractions, session.startedAt, end);
  return {
    title: displayName(session, now),
    active: session.endedAt === null,
    when: [
      formatDateShort(session.startedAt),
      formatTimeRange(session.startedAt, session.endedAt),
      formatSessionLength(end - session.startedAt),
    ].join(' · '),
    counts: {
      count: String(summary.count),
      apart: summary.avgInterval === null ? '—' : formatDuration(summary.avgInterval),
      long: summary.avgDuration === null ? '—' : formatDuration(summary.avgDuration),
    },
    domain: [session.startedAt, Math.max(end, session.startedAt + 1)],
  };
}
