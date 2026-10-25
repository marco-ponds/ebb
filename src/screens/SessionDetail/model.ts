import type { Contraction, EbbEvent, Session } from '../../db/types';
import { EVENT_LABELS, watersLower } from '../../domain/events';
import {
  VERY_SHORT_MS,
  allStarts,
  countedContractions,
  deriveRows,
  rollingMean,
  summarizeWindow,
} from '../../domain/metrics';

const MIN = 60_000;
const HOUR = 60 * MIN;
const MIN_SPAN = 10 * MIN;
/** Fewer counted contractions than this and averages show — and trend lines are omitted. */
export const ENOUGH = 4;

export type RangeKey = 'hour' | '3h' | 'session';
export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: 'hour', label: 'Last hour' },
  { value: '3h', label: 'Last 3 h' },
  { value: 'session', label: 'Whole session' },
];

/** The right edge of every chart: now while active, the end time once ended; never before the newest entry. */
export function sessionEnd(
  session: Pick<Session, 'startedAt' | 'endedAt'>,
  now: number,
  cs: Contraction[],
  events: EbbEvent[],
): number {
  const base = session.endedAt ?? now;
  let newest = session.startedAt;
  for (const x of cs) newest = Math.max(newest, x.startAt, x.endAt ?? 0);
  for (const e of events) newest = Math.max(newest, e.at);
  return Math.max(base, newest);
}

export function rangeDomain(range: RangeKey, startedAt: number, end: number): [number, number] {
  const span = range === 'hour' ? HOUR : range === '3h' ? 3 * HOUR : Infinity;
  const from = Math.max(startedAt, end - span);
  return [from, Math.max(end, from + MIN_SPAN)];
}

export type Flag = 'very short' | 'time changed';

export type LogRow =
  | { kind: 'contraction'; id: string; at: number; c: Contraction; duration: number | null; apart: number | null; flag: Flag | null }
  | { kind: 'event'; id: string; at: number; e: EbbEvent };

export function contractionFlag(c: Contraction): Flag | null {
  if (c.reviewed) return null;
  if (c.endAt !== null && c.endAt - c.startAt < VERY_SHORT_MS) return 'very short';
  return c.timeChanged ? 'time changed' : null;
}

/** Contractions and events mixed, newest first. Apart is start to start of the previous contraction. */
export function buildLog(cs: Contraction[], events: EbbEvent[]): LogRow[] {
  const sorted = [...cs].sort((a, b) => a.startAt - b.startAt);
  const rows: LogRow[] = sorted.map((x, i) => ({
    kind: 'contraction',
    id: x.id,
    at: x.startAt,
    c: x,
    duration: x.endAt === null ? null : x.endAt - x.startAt,
    apart: i === 0 ? null : x.startAt - sorted[i - 1].startAt,
    flag: contractionFlag(x),
  }));
  for (const e of events) rows.push({ kind: 'event', id: e.id, at: e.at, e });
  return rows.sort((a, b) => b.at - a.at || (a.kind === 'event' ? -1 : 1));
}

/** "Waters broke, clear", "Called midwife". */
export function eventTitle(e: Pick<EbbEvent, 'type' | 'details'>): string {
  return `${EVENT_LABELS[e.type]}${e.details ? `, ${watersLower(e.details)}` : ''}`;
}

/** Timeline legend wording: "waters, clear", "note: had a bath", "called midwife". */
export function eventLegendLabel(e: Pick<EbbEvent, 'type' | 'details' | 'note'>): string {
  const base = e.type === 'waters' ? 'waters' : EVENT_LABELS[e.type].toLowerCase();
  const detail = e.details ? `, ${watersLower(e.details)}` : '';
  const note = e.note?.trim();
  return `${base}${detail}${note ? `: ${note}` : ''}`;
}

export interface DetailStats {
  total: number;
  windowCount: number;
  avgInterval: number | null;
  avgDuration: number | null;
  avgIntensity: number | null;
  unrated: number;
}

/** Last hour while the session is active, the whole session once ended. Below 4 counted contractions the averages are null. */
export function detailStats(cs: Contraction[], end: number, active: boolean, startedAt: number): DetailStats {
  const from = active ? end - HOUR : startedAt;
  const w = summarizeWindow(cs, from, end);
  const counted = countedContractions(cs).filter((p) => p.startAt >= from && p.startAt <= end).length;
  const enough = counted >= ENOUGH;
  return {
    total: allStarts(cs).length,
    windowCount: w.count,
    avgInterval: enough ? w.avgInterval : null,
    avgDuration: enough ? w.avgDuration : null,
    avgIntensity: enough ? w.avgIntensity : null,
    unrated: w.unrated,
  };
}

export interface TrendPoints {
  points: { t: number; v: number; refId: string }[];
  line: { t: number; v: number }[] | null;
}

function withLine(points: TrendPoints['points'], draw: boolean): TrendPoints {
  if (!draw || points.length < 3) return { points, line: null };
  const means = rollingMean(
    points.map((p) => p.v),
    3,
  );
  const line = points.flatMap((p, i) => (means[i] === null ? [] : [{ t: p.t, v: means[i] as number }]));
  return { points, line: line.length > 1 ? line : null };
}

/** Dots per contraction plus a rolling average of 3, drawn only with 4 or more counted contractions. */
export function trendSeries(cs: Contraction[]): { interval: TrendPoints; duration: TrendPoints; intensity: TrendPoints } {
  const rows = deriveRows(countedContractions(cs));
  const draw = rows.length >= ENOUGH;
  return {
    interval: withLine(
      rows.filter((r) => r.interval !== null).map((r) => ({ t: r.c.startAt, v: (r.interval as number) / MIN, refId: r.c.id })),
      draw,
    ),
    duration: withLine(
      rows.map((r) => ({ t: r.c.startAt, v: r.duration / 1000, refId: r.c.id })),
      draw,
    ),
    intensity: withLine(
      rows.filter((r) => r.c.intensity !== null).map((r) => ({ t: r.c.startAt, v: r.c.intensity as number, refId: r.c.id })),
      draw,
    ),
  };
}

/** YYYY-MM-DD of the local start date, for export filenames. */
export function fileDate(epoch: number): string {
  const d = new Date(epoch);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
