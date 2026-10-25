import type { Contraction, EventType, Threshold } from '../../db/types';
import { evaluateThreshold } from '../../domain/thresholds';

const MIN = 60_000;
export const STALE_AFTER_MS = 5 * MIN;
export const PAUSED_AFTER_MS = 60 * MIN;

/** Minutes an in-progress contraction has been running, once that is over 5 minutes; otherwise null. */
export function staleMinutes(active: Contraction | null, now: number): number | null {
  if (!active) return null;
  const elapsed = now - active.startAt;
  return elapsed > STALE_AFTER_MS ? Math.floor(elapsed / MIN) : null;
}

/** Time since the last start when a resting session has gone quiet for 60 minutes or more; otherwise null. */
export function pausedMs(contractions: Contraction[], active: Contraction | null, now: number): number | null {
  if (active || contractions.length === 0) return null;
  const last = Math.max(...contractions.map((c) => c.startAt));
  const since = now - last;
  return since >= PAUSED_AFTER_MS ? since : null;
}

const EVENT_SHORT: Record<EventType, string> = {
  waters: 'waters',
  bleeding: 'bleeding',
  'reduced-movement': 'reduced movement',
  'called-midwife': 'called midwife',
  'went-to-hospital': 'went to hospital',
  note: 'note',
};

export const eventShort = (type: EventType): string => EVENT_SHORT[type];

export interface BannerEvaluation {
  /** Ids of every enabled threshold that holds right now. */
  held: string[];
  /** Dismissals that still apply: a dismissal ends as soon as its rule stops holding. */
  dismissed: Set<string>;
  /** The first held threshold, in list order, that the user has not dismissed. */
  shown: Threshold | null;
}

export function evaluateBanner(
  thresholds: Threshold[],
  contractions: Contraction[],
  now: number,
  dismissed: ReadonlySet<string>,
): BannerEvaluation {
  const heldThresholds = thresholds.filter((t) => t.enabled && evaluateThreshold(t, contractions, now));
  const held = heldThresholds.map((t) => t.id);
  return {
    held,
    dismissed: new Set([...dismissed].filter((id) => held.includes(id))),
    shown: heldThresholds.find((t) => !dismissed.has(t.id)) ?? null,
  };
}
