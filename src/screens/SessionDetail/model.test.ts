import { describe, expect, it } from 'vitest';
import { c, ev, series, MIN, HOUR } from '../../domain/__tests__/fixtures';
import {
  buildLog,
  detailStats,
  eventLegendLabel,
  eventTitle,
  fileDate,
  rangeDomain,
  sessionEnd,
  timingById,
  timingLines,
  trendSeries,
} from './model';

const T0 = new Date(2026, 9, 25, 21, 40).getTime();

describe('rangeDomain', () => {
  it('whole session spans start to end, with a 10 minute minimum', () => {
    expect(rangeDomain('session', T0, T0 + 3 * HOUR)).toEqual([T0, T0 + 3 * HOUR]);
    expect(rangeDomain('session', T0, T0 + MIN)).toEqual([T0, T0 + 10 * MIN]);
  });
  it('last hour and last 3 h end at the end and never start before the session', () => {
    expect(rangeDomain('hour', T0, T0 + 3 * HOUR)).toEqual([T0 + 2 * HOUR, T0 + 3 * HOUR]);
    expect(rangeDomain('3h', T0, T0 + 5 * HOUR)).toEqual([T0 + 2 * HOUR, T0 + 5 * HOUR]);
    expect(rangeDomain('hour', T0, T0 + 20 * MIN)).toEqual([T0, T0 + 20 * MIN]);
  });
});

describe('sessionEnd', () => {
  it('is now while active, the end time once ended, and never before the newest entry', () => {
    const cs = [c('a', T0, 60_000)];
    expect(sessionEnd({ startedAt: T0, endedAt: null }, T0 + HOUR, cs, [])).toBe(T0 + HOUR);
    expect(sessionEnd({ startedAt: T0, endedAt: T0 + 30 * MIN }, T0 + 9 * HOUR, cs, [])).toBe(T0 + 30 * MIN);
    expect(sessionEnd({ startedAt: T0, endedAt: T0 + 30 * MIN }, 0, [c('b', T0 + HOUR, 60_000)], [ev('e', T0 + 2 * HOUR, 'note')])).toBe(
      T0 + 2 * HOUR,
    );
  });
});

describe('buildLog', () => {
  it('mixes contractions and events newest first with apart and flags', () => {
    const cs = [c('a', T0, 60_000), c('b', T0 + 5 * MIN, 3000), c('d', T0 + 9 * MIN, 60_000, { timeChanged: true })];
    const rows = buildLog(cs, [ev('e', T0 + 7 * MIN, 'called-midwife')]);
    expect(rows.map((r) => r.id)).toEqual(['d', 'e', 'b', 'a']);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.a).toMatchObject({ kind: 'contraction', apart: null, flag: null });
    expect(byId.b).toMatchObject({ apart: 5 * MIN, flag: 'very short' });
    expect(byId.d).toMatchObject({ apart: 4 * MIN, flag: 'time changed' });
    expect(byId.e).toMatchObject({ kind: 'event' });
  });
  it('drops flags once reviewed', () => {
    const rows = buildLog([c('a', T0, 3000, { reviewed: true })], []);
    expect(rows[0]).toMatchObject({ flag: null });
  });
});

describe('event labels', () => {
  it('legend labels are lower-case with details and notes', () => {
    expect(eventLegendLabel(ev('1', T0, 'note', null, 'had a bath'))).toBe('note: had a bath');
    expect(eventLegendLabel(ev('2', T0, 'waters', 'clear'))).toBe('waters, clear');
    expect(eventLegendLabel(ev('3', T0, 'called-midwife'))).toBe('called midwife');
  });
  it('titles are sentence case', () => {
    expect(eventTitle(ev('2', T0, 'waters', 'green-brown'))).toBe('Waters broke, green or brown');
    expect(eventTitle(ev('3', T0, 'called-midwife'))).toBe('Called midwife');
  });
});

describe('detailStats', () => {
  it('uses the last hour while active and shows — below 4 counted contractions', () => {
    const cs = series(3, T0, 5 * MIN, 50_000, 6);
    const s = detailStats(cs, T0 + HOUR, true, T0);
    expect(s).toMatchObject({ total: 3, windowCount: 3, avgInterval: null, avgDuration: null, avgIntensity: null });
  });
  it('averages the last hour of an active session', () => {
    const cs = series(20, T0, 5 * MIN, 50_000, 6);
    const now = T0 + 100 * MIN;
    const s = detailStats(cs, now, true, T0);
    expect(s.total).toBe(20);
    expect(s.windowCount).toBe(12);
    const ended = detailStats(cs, now, false, T0);
    expect(ended.windowCount).toBe(20);
    expect(ended.avgInterval).toBe(5 * MIN);
    expect(ended.avgDuration).toBe(50_000);
    expect(ended.avgIntensity).toBe(6);
  });
  it('ignores unreviewed very short contractions in the averages', () => {
    const cs = [...series(5, T0, 5 * MIN, 60_000), c('short', T0 + 30 * MIN, 2000)];
    const s = detailStats(cs, T0 + HOUR, false, T0);
    expect(s.total).toBe(6);
    expect(s.avgDuration).toBe(60_000);
  });
});

describe('trendSeries', () => {
  it('draws the rolling average only with 4 or more contractions', () => {
    const few = trendSeries(series(3, T0, 5 * MIN, 50_000, 6));
    expect(few.duration.line).toBeNull();
    const many = trendSeries(series(6, T0, 5 * MIN, 50_000, 6));
    expect(many.duration.points).toHaveLength(6);
    expect(many.duration.line).toHaveLength(4);
    expect(many.interval.points).toHaveLength(5);
    expect(many.interval.points[0]).toMatchObject({ v: 5, refId: 'c1' });
    expect(many.intensity.points[0].v).toBe(6);
  });
  it('leaves unrated contractions out of the strength series', () => {
    const t = trendSeries(series(5, T0, 5 * MIN, 50_000, null));
    expect(t.intensity.points).toEqual([]);
    expect(t.intensity.line).toBeNull();
  });
});

describe('fileDate', () => {
  it('is the local start date', () => {
    expect(fileDate(new Date(2026, 9, 5, 23, 59).getTime())).toBe('2026-10-05');
  });
});

describe('timingById and timingLines', () => {
  it('derives interval and rest from the previous contraction, with — for the first', () => {
    const cs = [c('a', T0, 60_000), c('b', T0 + 5 * MIN, 50_000), c('d', T0 + 9 * MIN + 30_000, 40_000)];
    const t = timingById(cs);
    expect(t.get('a')).toEqual({ interval: null, rest: null });
    expect(t.get('b')).toEqual({ interval: 5 * MIN, rest: 4 * MIN });
    expect(t.get('d')).toEqual({ interval: 4.5 * MIN, rest: 4 * MIN - 20_000 });
    expect(timingLines(t.get('a'))).toEqual(['Interval —', 'Rest —']);
    expect(timingLines(t.get('b'))).toEqual(['Interval 5m', 'Rest 4m']);
  });
  it('counts unreviewed very short contractions and ignores deleted ones', () => {
    const cs = [c('a', T0, 60_000), c('x', T0 + MIN, 2000, { deletedAt: 1 }), c('s', T0 + 3 * MIN, 2000)];
    expect(timingById(cs).get('s')).toEqual({ interval: 3 * MIN, rest: 2 * MIN });
    expect(timingById(cs).has('x')).toBe(false);
  });
});
