import { deviation, mean, median, quantile } from 'd3-array';
import type { Contraction, EbbEvent } from '../db/types';

export const VERY_SHORT_MS = 5000;
export const GAP_MIN_MS = 15 * 60_000;

const MIN = 60_000;
const HOUR = 60 * MIN;
const BUCKET_MS = 10 * MIN;
const GAP_FACTOR = 2.5;
const GAP_MIN_HISTORY = 3;
const GAP_HISTORY = 5;
const MIN_REGULARITY_INTERVALS = 4;
const MIN_PROGRESSION_POINTS = 5;
const MIN_TREND_POINTS = 4;

export interface CPoint {
  id: string;
  startAt: number;
  endAt: number;
  intensity: number | null;
}

export interface Row {
  c: CPoint;
  duration: number;
  interval: number | null;
  rest: number | null;
  isGap: boolean;
}

/** Finished, non-deleted contractions by start, minus unreviewed very short or time-changed ones. */
export function countedContractions(cs: Contraction[]): CPoint[] {
  const out: CPoint[] = [];
  for (const x of cs) {
    if (x.endAt == null || x.deletedAt != null) continue;
    if ((x.endAt - x.startAt < VERY_SHORT_MS || x.timeChanged) && !x.reviewed) continue;
    out.push({ id: x.id, startAt: x.startAt, endAt: x.endAt, intensity: x.intensity });
  }
  return out.sort((a, b) => a.startAt - b.startAt);
}

/** Start of every non-deleted contraction, including in-progress and unreviewed ones. */
export function allStarts(cs: Contraction[]): number[] {
  return cs.filter((x) => x.deletedAt == null).map((x) => x.startAt);
}

export function deriveRows(points: CPoint[]): Row[] {
  const rows: Row[] = [];
  const intervals: Array<number | null> = [];
  points.forEach((p, i) => {
    const prev = i > 0 ? points[i - 1] : null;
    const interval = prev ? p.startAt - prev.startAt : null;
    const rest = prev ? p.startAt - prev.endAt : null;
    let isGap = false;
    if (interval !== null) {
      const history = intervals.slice(-GAP_HISTORY).filter((v): v is number => v !== null);
      if (history.length >= GAP_MIN_HISTORY) {
        isGap = interval > GAP_FACTOR * (median(history) as number) && interval >= GAP_MIN_MS;
      }
    }
    intervals.push(interval);
    rows.push({ c: p, duration: p.endAt - p.startAt, interval, rest, isGap });
  });
  return rows;
}

export function lastStats(points: CPoint[]): { interval: number | null; duration: number | null } {
  const last = points[points.length - 1];
  if (!last) return { interval: null, duration: null };
  const prev = points[points.length - 2];
  return { interval: prev ? last.startAt - prev.startAt : null, duration: last.endAt - last.startAt };
}

export interface RollingAverages {
  interval: number | null;
  duration: number | null;
  intervalCount: number;
}

export function rollingAverages(points: CPoint[], now: number, windowMin: 30 | 60): RollingAverages {
  const from = now - windowMin * MIN;
  const inWindow = (t: number) => t >= from && t < now;
  const intervals = deriveRows(points)
    .filter((r) => r.interval !== null && inWindow(r.c.startAt))
    .map((r) => r.interval as number);
  const durations = points.filter((p) => inWindow(p.startAt)).map((p) => p.endAt - p.startAt);
  if (intervals.length < 2) return { interval: null, duration: null, intervalCount: intervals.length };
  return { interval: mean(intervals) as number, duration: mean(durations) as number, intervalCount: intervals.length };
}

export function per10Min(starts: number[], now: number): number {
  return starts.filter((s) => s >= now - BUCKET_MS && s < now).length;
}

export function tenMinuteBuckets(
  starts: number[],
  sessionStart: number,
  end: number,
): { start: number; count: number }[] {
  const n = Math.max(1, Math.floor((end - sessionStart) / BUCKET_MS) + 1);
  const buckets = Array.from({ length: n }, (_, i) => ({ start: sessionStart + i * BUCKET_MS, count: 0 }));
  for (const s of starts) {
    const i = Math.floor((s - sessionStart) / BUCKET_MS);
    if (i >= 0 && i < n) buckets[i].count += 1;
  }
  return buckets;
}

export function leastSquaresSlope(points: { x: number; y: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;
  const mx = mean(points, (p) => p.x) as number;
  const my = mean(points, (p) => p.y) as number;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Trailing mean over k values; null until k values exist. */
export function rollingMean(values: number[], k: number): (number | null)[] {
  return values.map((_, i) => (i < k - 1 ? null : (mean(values.slice(i - k + 1, i + 1)) as number)));
}

export type RegularityLabel = 'Regular' | 'Fairly regular' | 'Irregular';

export interface Regularity {
  label: RegularityLabel;
  cv: number;
  rangeMin: [number, number];
}

/** Non-gap rows that start in the last 60 min. */
function recentRows(points: CPoint[], now: number): Row[] {
  const from = now - HOUR;
  return deriveRows(points).filter((r) => !r.isGap && r.c.startAt >= from && r.c.startAt <= now);
}

export function regularity(points: CPoint[], now: number): Regularity | null {
  const intervals = recentRows(points, now)
    .filter((r) => r.interval !== null)
    .map((r) => r.interval as number);
  if (intervals.length < MIN_REGULARITY_INTERVALS) return null;
  const cv = (deviation(intervals) as number) / (mean(intervals) as number);
  const label: RegularityLabel = cv < 0.2 ? 'Regular' : cv <= 0.4 ? 'Fairly regular' : 'Irregular';
  const lo = quantile(intervals, 0.1) as number;
  const hi = quantile(intervals, 0.9) as number;
  return { label, cv, rangeMin: [Math.round(lo / MIN), Math.round(hi / MIN)] };
}

export interface Progression {
  interval: 'getting closer together' | 'getting further apart' | 'steady' | null;
  duration: 'getting longer' | 'getting shorter' | 'steady' | null;
  intensity: 'getting stronger' | 'easing off' | 'steady' | null;
}

function slopePerHour(rows: Array<{ t: number; y: number }>): number | null {
  if (rows.length < MIN_PROGRESSION_POINTS) return null;
  return leastSquaresSlope(rows.map((r) => ({ x: r.t / HOUR, y: r.y })));
}

export function progression(points: CPoint[], now: number): Progression {
  const rows = recentRows(points, now);
  const intervalSlope = slopePerHour(
    rows.filter((r) => r.interval !== null).map((r) => ({ t: r.c.startAt, y: (r.interval as number) / MIN })),
  );
  const durationSlope = slopePerHour(rows.map((r) => ({ t: r.c.startAt, y: r.duration / 1000 })));
  const intensitySlope = slopePerHour(
    rows.filter((r) => r.c.intensity !== null).map((r) => ({ t: r.c.startAt, y: r.c.intensity as number })),
  );
  return {
    interval:
      intervalSlope === null ? null : intervalSlope < -0.5 ? 'getting closer together' : intervalSlope > 0.5 ? 'getting further apart' : 'steady',
    duration:
      durationSlope === null ? null : durationSlope > 5 ? 'getting longer' : durationSlope < -5 ? 'getting shorter' : 'steady',
    intensity:
      intensitySlope === null ? null : intensitySlope > 0.5 ? 'getting stronger' : intensitySlope < -0.5 ? 'easing off' : 'steady',
  };
}

export interface WindowSummary {
  count: number;
  avgInterval: number | null;
  avgDuration: number | null;
  avgIntensity: number | null;
  unrated: number;
}

/** Summary for starts in [from, to]. Averages skip unreviewed very short and time-changed rows. */
export function summarizeWindow(cs: Contraction[], from: number, to: number): WindowSummary {
  const inRange = (t: number) => t >= from && t <= to;
  const count = allStarts(cs).filter(inRange).length;
  const points = countedContractions(cs).filter((p) => inRange(p.startAt));
  const intervals = deriveRows(points)
    .map((r) => r.interval)
    .filter((v): v is number => v !== null);
  const rated = points.filter((p) => p.intensity !== null).map((p) => p.intensity as number);
  return {
    count,
    avgInterval: intervals.length >= 2 ? (mean(intervals) as number) : null,
    avgDuration: points.length ? (mean(points, (p) => p.endAt - p.startAt) as number) : null,
    avgIntensity: rated.length ? (mean(rated) as number) : null,
    unrated: points.length - rated.length,
  };
}

/** A finished, non-deleted contraction whose time range overlaps the candidate (touching is fine). */
export function findOverlap(
  cs: Contraction[],
  cand: { startAt: number; endAt: number },
  excludeId?: string,
): Contraction | null {
  return (
    cs.find(
      (x) =>
        x.deletedAt == null &&
        x.endAt != null &&
        x.id !== excludeId &&
        x.startAt < cand.endAt &&
        cand.startAt < x.endAt,
    ) ?? null
  );
}

export interface LiveMetrics {
  last: { interval: number | null; duration: number | null };
  avg30: RollingAverages;
  avg60: RollingAverages;
  regularity: Regularity | null;
  progression: Progression;
  per10: number;
  lastHour: CPoint[];
}

export function computeLiveMetrics(cs: Contraction[], now: number): LiveMetrics {
  const points = countedContractions(cs);
  return {
    last: lastStats(points),
    avg30: rollingAverages(points, now, 30),
    avg60: rollingAverages(points, now, 60),
    regularity: regularity(points, now),
    progression: progression(points, now),
    per10: per10Min(allStarts(cs), now),
    lastHour: points.filter((p) => p.startAt >= now - HOUR && p.startAt <= now),
  };
}

export interface TrendSeries {
  points: { x: number; y: number }[];
  /** Rolling mean (k = 3), aligned with `points`; null when there are fewer than 4 points. */
  line: (number | null)[] | null;
}

export interface SessionMetrics {
  rows: Row[];
  summary: WindowSummary;
  regularity: Regularity | null;
  progression: Progression;
  buckets: { start: number; count: number }[];
  events: EbbEvent[];
  trends: { interval: TrendSeries; duration: TrendSeries; intensity: TrendSeries };
}

function trend(points: { x: number; y: number }[]): TrendSeries {
  return {
    points,
    line: points.length >= MIN_TREND_POINTS ? rollingMean(points.map((p) => p.y), 3) : null,
  };
}

export function computeSessionMetrics(
  cs: Contraction[],
  events: EbbEvent[],
  range: { from: number; to: number },
): SessionMetrics {
  const inRange = cs.filter((x) => x.startAt >= range.from && x.startAt <= range.to);
  const points = countedContractions(inRange);
  const rows = deriveRows(points);
  return {
    rows,
    summary: summarizeWindow(cs, range.from, range.to),
    regularity: regularity(points, range.to),
    progression: progression(points, range.to),
    buckets: tenMinuteBuckets(allStarts(inRange), range.from, range.to),
    events: events.filter((e) => e.deletedAt == null && e.at >= range.from && e.at <= range.to).sort((a, b) => a.at - b.at),
    trends: {
      interval: trend(rows.filter((r) => r.interval !== null).map((r) => ({ x: r.c.startAt, y: r.interval as number }))),
      duration: trend(rows.map((r) => ({ x: r.c.startAt, y: r.duration }))),
      intensity: trend(
        rows.filter((r) => r.c.intensity !== null).map((r) => ({ x: r.c.startAt, y: r.c.intensity as number })),
      ),
    },
  };
}

/** Memoised wrappers: results are reused while the input arrays and the second are unchanged. */
export function createMemo() {
  let live: { cs: Contraction[]; sec: number; value: LiveMetrics } | null = null;
  let session: {
    cs: Contraction[];
    events: EbbEvent[];
    from: number;
    sec: number;
    value: SessionMetrics;
  } | null = null;
  return {
    live(cs: Contraction[], now: number): LiveMetrics {
      const sec = Math.floor(now / 1000);
      if (live && live.cs === cs && live.sec === sec) return live.value;
      const value = computeLiveMetrics(cs, now);
      live = { cs, sec, value };
      return value;
    },
    session(cs: Contraction[], events: EbbEvent[], range: { from: number; to: number }): SessionMetrics {
      const sec = Math.floor(range.to / 1000);
      if (session && session.cs === cs && session.events === events && session.from === range.from && session.sec === sec) {
        return session.value;
      }
      const value = computeSessionMetrics(cs, events, range);
      session = { cs, events, from: range.from, sec, value };
      return value;
    },
  };
}
