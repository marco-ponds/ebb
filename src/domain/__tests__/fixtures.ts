import type { Contraction, EbbEvent, EventType, WatersDetail } from '../../db/types';

export const MIN = 60_000;
export const SEC = 1000;
export const HOUR = 60 * MIN;

export function c(
  id: string,
  startAt: number,
  durationMs: number | null = 60 * SEC,
  over: Partial<Contraction> = {},
): Contraction {
  return {
    id,
    sessionId: 's1',
    startAt,
    endAt: durationMs === null ? null : startAt + durationMs,
    intensity: null,
    note: null,
    deletedAt: null,
    timeChanged: false,
    reviewed: false,
    updatedAt: startAt,
    ...over,
  };
}

export function ev(
  id: string,
  at: number,
  type: EventType,
  details: WatersDetail | null = null,
  note: string | null = null,
  over: Partial<EbbEvent> = {},
): EbbEvent {
  return { id, sessionId: 's1', at, type, details, note, deletedAt: null, updatedAt: at, ...over };
}

/** n contractions starting at `t0`, every `everyMs`, each lasting `durMs`. */
export function series(
  n: number,
  t0: number,
  everyMs: number,
  durMs = 60 * SEC,
  intensity: number | null = null,
): Contraction[] {
  return Array.from({ length: n }, (_, i) => c(`c${i}`, t0 + i * everyMs, durMs, { intensity }));
}
