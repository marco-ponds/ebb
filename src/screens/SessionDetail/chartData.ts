import type { TimelineItem, TimelineMarker, TrendSeries } from '../../charts';
import type { Contraction, EbbEvent, Session } from '../../db/types';
import { THRESHOLD_LETTER, TIMELINE_LETTERS } from '../../domain/events';
import { formatClock, formatDuration } from '../../domain/format';
import { allStarts, countedContractions, deriveRows, tenMinuteBuckets } from '../../domain/metrics';
import { contractionFlag, eventLegendLabel, trendSeries, type TrendPoints } from './model';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export interface ChartModel {
  items: TimelineItem[];
  markers: TimelineMarker[];
  gaps: { from: number; to: number }[];
  apart: TrendSeries[];
  lasting: TrendSeries[];
  strength: TrendSeries[];
  buckets: { start: number; count: number }[];
  unrated: number;
  summaries: { timeline: string; apart: string; lasting: string; strength: string; per10: string };
}

const toSeries = (id: string, t: TrendPoints, tone: TrendSeries['tone']): TrendSeries[] => [
  { id, points: t.points, line: t.line, style: 'solid', tone },
];

/** Everything the five charts need, shared by the screen and the PDF so they never disagree. */
export function buildChartModel(
  session: Pick<Session, 'startedAt' | 'thresholdMetAt'>,
  cs: Contraction[],
  events: EbbEvent[],
  end: number,
): ChartModel {
  const items: TimelineItem[] = cs.map((c) => ({
    id: c.id,
    startAt: c.startAt,
    endAt: c.endAt ?? end,
    intensity: c.intensity,
    flag: contractionFlag(c) === 'very short' ? 'very-short' : contractionFlag(c) === 'time changed' ? 'time-changed' : undefined,
  }));
  const markers: TimelineMarker[] = events.map((e) => ({
    id: e.id,
    at: e.at,
    letter: TIMELINE_LETTERS[e.type],
    label: eventLegendLabel(e),
    kind: 'event',
  }));
  if (session.thresholdMetAt !== null) {
    markers.push({ id: 'threshold-met', at: session.thresholdMetAt, letter: THRESHOLD_LETTER, label: 'Threshold met', kind: 'threshold' });
  }
  markers.sort((a, b) => a.at - b.at);

  const counted = countedContractions(cs);
  const rows = deriveRows(counted);
  const gaps = rows.flatMap((r, i) => (r.isGap && i > 0 ? [{ from: rows[i - 1].c.endAt, to: r.c.startAt }] : []));
  const trends = trendSeries(cs);
  const buckets = tenMinuteBuckets(allStarts(cs), session.startedAt, end);
  const unrated = counted.filter((p) => p.intensity === null).length;

  const intervals = trends.interval.points.map((p) => p.v);
  const durations = trends.duration.points.map((p) => p.v);
  const ratings = trends.intensity.points.map((p) => p.v);
  const busiest = Math.max(0, ...buckets.map((b) => b.count));
  const summaries = {
    timeline:
      `Timeline of ${plural(cs.length, 'contraction', 'contractions')} from ${formatClock(session.startedAt)} to ${formatClock(end)}` +
      (events.length ? `, with ${plural(events.length, 'event', 'events')} marked.` : '.'),
    apart: intervals.length
      ? `Time apart across ${plural(intervals.length, 'interval', 'intervals')}, averaging ${formatDuration(mean(intervals) * 60_000)}.`
      : 'Time apart: not enough contractions yet.',
    lasting: durations.length
      ? `Lasting across ${plural(durations.length, 'contraction', 'contractions')}, averaging ${formatDuration(mean(durations) * 1000)}.`
      : 'Lasting: no finished contractions yet.',
    strength: ratings.length
      ? `Strength of ${plural(ratings.length, 'rated contraction', 'rated contractions')}, averaging ${Math.round(mean(ratings))} out of 10; ${unrated} not rated.`
      : `Strength: none rated yet; ${unrated} not rated.`,
    per10: `Contractions per 10 minutes, busiest ${busiest}.`,
  };

  return {
    items,
    markers,
    gaps,
    apart: toSeries('apart', trends.interval, 'lavender'),
    lasting: toSeries('lasting', trends.duration, 'peach'),
    strength: toSeries('strength', trends.intensity, 'butter'),
    buckets,
    unrated,
    summaries,
  };
}

