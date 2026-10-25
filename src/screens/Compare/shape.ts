import type { Contraction, IntensityScale, Session } from '../../db/types';
import { formatDateShort, formatDuration, formatIntensity, formatSessionLength } from '../../domain/format';
import { countedContractions, deriveRows, regularity, rollingMean, summarizeWindow } from '../../domain/metrics';
import { displayName } from '../../domain/naming';
import type { TimelineItem } from '../../charts';

const MIN = 60_000;
export const MAX_COMPARED = 3;
export const TREND_WINDOW = 4;

export type SeriesKey = 'primary' | 'secondary' | 'tertiary';

const STYLES: Record<SeriesKey, { style: 'solid' | 'dashed' | 'dotted'; tone: 'lavender' | 'sky' | 'muted' }> = {
  primary: { style: 'solid', tone: 'lavender' },
  secondary: { style: 'dashed', tone: 'sky' },
  tertiary: { style: 'dotted', tone: 'muted' },
};
const KEYS: SeriesKey[] = ['primary', 'secondary', 'tertiary'];

export interface CompareInput {
  session: Session;
  contractions: Contraction[];
}

export interface CompareMetrics {
  length: string;
  contractions: string;
  apart: string;
  lasting: string;
  strength: string;
  pattern: string;
}

export interface CompareSeries {
  id: string;
  key: SeriesKey;
  style: 'solid' | 'dashed' | 'dotted';
  tone: 'lavender' | 'sky' | 'muted';
  name: string;
  /** First word of the name, for the table's column header. */
  heading: string;
  dateLabel: string;
  lengthMs: number;
  /** Timeline items with times relative to the session start. */
  items: TimelineItem[];
  /** Rolling average of 4 intervals, in minutes, at ms since the session start. */
  line: { t: number; v: number }[];
  /** Every interval in minutes at ms since the session start (the dots behind the line). */
  points: { t: number; v: number; refId: string }[];
  metrics: CompareMetrics;
}

export interface CompareModel {
  series: CompareSeries[];
  /** [0, longest session length]. */
  domain: [number, number];
}

/** Known sessions for the requested ids: first three, in the order given, without repeats. */
export function parseIds(ids: string[], sessions: Session[]): Session[] {
  const out: Session[] = [];
  for (const id of ids) {
    const s = sessions.find((x) => x.id === id);
    if (s && !out.includes(s)) out.push(s);
    if (out.length === MAX_COMPARED) break;
  }
  return out;
}

export function shapeCompare(inputs: CompareInput[], now: number, scale: IntensityScale): CompareModel {
  const series = inputs.slice(0, MAX_COMPARED).map(({ session, contractions }, index): CompareSeries => {
    const key = KEYS[index]!;
    const end = session.endedAt ?? now;
    const base = session.startedAt;
    const points = countedContractions(contractions);
    const rows = deriveRows(points);
    const withInterval = rows.filter((r) => r.interval !== null);
    const averaged = rollingMean(
      withInterval.map((r) => (r.interval as number) / MIN),
      TREND_WINDOW,
    );
    const line = withInterval.flatMap((r, i) => {
      const v = averaged[i];
      return v === null || v === undefined ? [] : [{ t: r.c.startAt - base, v }];
    });
    const summary = summarizeWindow(contractions, base, end);
    const name = displayName(session, now);
    return {
      id: session.id,
      key,
      ...STYLES[key],
      name,
      heading: name.split(' ')[0] ?? name,
      dateLabel: formatDateShort(base),
      lengthMs: end - base,
      items: points.map((p) => ({ id: p.id, startAt: p.startAt - base, endAt: p.endAt - base, intensity: p.intensity })),
      line,
      points: withInterval.map((r) => ({ t: r.c.startAt - base, v: (r.interval as number) / MIN, refId: r.c.id })),
      metrics: {
        length: formatSessionLength(end - base),
        contractions: String(summary.count),
        apart: summary.avgInterval === null ? '—' : formatDuration(summary.avgInterval),
        lasting: summary.avgDuration === null ? '—' : formatDuration(summary.avgDuration),
        strength: formatIntensity(summary.avgIntensity === null ? null : Math.round(summary.avgIntensity), scale),
        pattern: regularity(points, end)?.label ?? '—',
      },
    };
  });
  return { series, domain: [0, Math.max(0, ...series.map((s) => s.lengthMs))] };
}

export const MIN_COMPARED = 2;
