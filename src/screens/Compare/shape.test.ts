import { describe, expect, it } from 'vitest';
import type { Contraction, Session } from '../../db/types';
import { parseIds, shapeCompare } from './shape';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = new Date(2026, 9, 20, 19, 5).getTime();
const T1 = new Date(2026, 9, 25, 21, 40).getTime();

const session = (id: string, startedAt: number, endedAt: number | null, name: string | null = null): Session => ({
  id,
  name,
  startedAt,
  endedAt,
  notes: '',
  createdAt: 0,
  updatedAt: 0,
  thresholdMetAt: null,
});
const series = (sessionId: string, startedAt: number, count: number, everyMin: number, intensity: number | null = null): Contraction[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${sessionId}-${i}`,
    sessionId,
    startAt: startedAt + i * everyMin * MIN,
    endAt: startedAt + i * everyMin * MIN + 45_000,
    intensity,
    note: null,
    deletedAt: null,
    timeChanged: false,
    reviewed: false,
    updatedAt: 0,
  }));

const a = session('a', T0, T0 + 4.5 * HOUR);
const b = session('b', T1, null);
const now = T1 + 2 * HOUR;

describe('parseIds', () => {
  it('keeps known ids once, in order, up to three', () => {
    const known = ['a', 'b', 'c', 'd'].map((id) => session(id, 0, 1));
    expect(parseIds(['b', 'x', 'a', 'b', 'c', 'd'], known).map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('shapeCompare', () => {
  const model = shapeCompare(
    [
      { session: a, contractions: series('a', T0, 30, 9, 4) },
      { session: b, contractions: series('b', T1, 20, 6, 6) },
    ],
    now,
    'numeric',
  );

  it('assigns series styles in order', () => {
    expect(model.series.map((s) => s.key)).toEqual(['primary', 'secondary']);
    expect(model.series.map((s) => s.style)).toEqual(['solid', 'dashed']);
  });

  it('offsets every timeline to t = 0 and sizes the domain to the longest session', () => {
    expect(model.series[0]!.items[0]!.startAt).toBe(0);
    expect(model.series[1]!.items[1]!.startAt).toBe(6 * MIN);
    expect(model.domain).toEqual([0, 4.5 * HOUR]);
  });

  it('uses now as the end of an active session', () => {
    expect(model.series[1]!.lengthMs).toBe(2 * HOUR);
  });

  it('builds a rolling average of four over the intervals, in minutes, from t = 0', () => {
    const line = model.series[1]!.line;
    // 19 intervals of 6 min; the first mean needs 4 values, so it sits on the 4th interval.
    expect(line).toHaveLength(16);
    expect(line[0]).toEqual({ t: 4 * 6 * MIN, v: 6 });
  });

  it('keeps every interval as a point in minutes, relative to the start', () => {
    const pts = model.series[1]!.points;
    expect(pts).toHaveLength(19);
    expect(pts[0]).toEqual({ t: 6 * MIN, v: 6, refId: 'b-1' });
  });

  it('fills the table rows per session with the settings scale', () => {
    expect(model.series.map((s) => s.heading)).toEqual(['Tuesday', 'Tonight']);
    expect(model.series[0]!.metrics).toEqual({
      length: '4 h 30 m',
      contractions: '30',
      apart: '9m',
      lasting: '45s',
      strength: '4',
      pattern: 'Regular',
    });
    expect(model.series[1]!.metrics.strength).toBe('6');
  });

  it('formats strength with the words scale and rounds the mean', () => {
    const m = shapeCompare(
      [
        { session: a, contractions: series('a', T0, 5, 9, 5) },
        { session: b, contractions: series('b', T1, 5, 6, null) },
      ],
      now,
      'words',
    );
    expect(m.series[0]!.metrics.strength).toBe('Strong');
    expect(m.series[1]!.metrics.strength).toBe('—');
  });

  it('reports the regularity label for the last hour of a steady session', () => {
    const steady = shapeCompare(
      [
        { session: session('a', T0, T0 + 2 * HOUR), contractions: series('a', T0, 24, 5) },
        { session: b, contractions: [] },
      ],
      now,
      'numeric',
    );
    expect(steady.series[0]!.metrics.pattern).toBe('Regular');
  });

  it('shows a dash for the pattern when the last hour has too few intervals', () => {
    const m = shapeCompare(
      [
        { session: a, contractions: series('a', T0, 3, 9) },
        { session: b, contractions: [] },
      ],
      now,
      'numeric',
    );
    expect(m.series[0]!.metrics.pattern).toBe('—');
    expect(m.series[1]!.metrics).toMatchObject({ contractions: '0', apart: '—', lasting: '—', strength: '—' });
  });

  it('labels the legend with the date', () => {
    expect(model.series[0]!.dateLabel).toBe('Tue 20 Oct');
  });
});
