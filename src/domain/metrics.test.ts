import { describe, expect, it } from 'vitest';
import {
  GAP_MIN_MS,
  VERY_SHORT_MS,
  allStarts,
  computeLiveMetrics,
  computeSessionMetrics,
  countedContractions,
  createMemo,
  deriveRows,
  findOverlap,
  lastStats,
  leastSquaresSlope,
  per10Min,
  progression,
  regularity,
  rollingAverages,
  rollingMean,
  patternAt,
  summarizeEnough,
  ENOUGH,
  summarizeWindow,
  tenMinuteBuckets,
  type CPoint,
} from './metrics';
import { HOUR, MIN, SEC, c, ev, series } from './__tests__/fixtures';

const T0 = Date.UTC(2026, 9, 24, 20, 0, 0);
const pt = (startOffsetMin: number, durSec = 60, intensity: number | null = null): CPoint => {
  const startAt = T0 + startOffsetMin * MIN;
  return { id: `p${startOffsetMin}`, startAt, endAt: startAt + durSec * SEC, intensity };
};

describe('constants', () => {
  it('exposes the thresholds', () => {
    expect(VERY_SHORT_MS).toBe(5000);
    expect(GAP_MIN_MS).toBe(15 * MIN);
  });
});

describe('countedContractions', () => {
  it('keeps finished, non-deleted rows sorted by start', () => {
    const cs = [c('b', T0 + 10 * MIN), c('a', T0), c('open', T0 + 20 * MIN, null), c('d', T0 + 5 * MIN, 60 * SEC, { deletedAt: 1 })];
    expect(countedContractions(cs).map((p) => p.id)).toEqual(['a', 'b']);
  });
  it('drops a very short contraction until it is reviewed', () => {
    const short = c('s', T0, 4 * SEC);
    expect(countedContractions([short])).toEqual([]);
    expect(countedContractions([{ ...short, reviewed: true }]).map((p) => p.id)).toEqual(['s']);
  });
  it('treats exactly 5 s as long enough', () => {
    expect(countedContractions([c('s', T0, 5 * SEC)])).toHaveLength(1);
  });
  it('drops a time-changed contraction until it is reviewed', () => {
    const moved = c('m', T0, 60 * SEC, { timeChanged: true });
    expect(countedContractions([moved])).toEqual([]);
    expect(countedContractions([{ ...moved, reviewed: true }])).toHaveLength(1);
  });
  it('returns only the point fields', () => {
    expect(countedContractions([c('a', T0, 60 * SEC, { intensity: 6 })])).toEqual([
      { id: 'a', startAt: T0, endAt: T0 + 60 * SEC, intensity: 6 },
    ]);
  });
});

describe('allStarts', () => {
  it('lists every non-deleted start including in-progress and very short', () => {
    const cs = [c('a', T0 + 3), c('b', T0 + 1, null), c('x', T0 + 2, 1 * SEC), c('d', T0, 60 * SEC, { deletedAt: 5 })];
    expect(allStarts(cs).sort()).toEqual([T0 + 1, T0 + 2, T0 + 3]);
  });
});

describe('deriveRows', () => {
  it('computes duration, interval and rest', () => {
    const rows = deriveRows([pt(0, 60), pt(5, 45)]);
    expect(rows[0]).toMatchObject({ duration: 60 * SEC, interval: null, rest: null, isGap: false });
    expect(rows[1]).toMatchObject({ duration: 45 * SEC, interval: 5 * MIN, rest: 4 * MIN, isGap: false });
    expect(rows[1].c.id).toBe('p5');
  });
  it('flags a gap above 2.5x the median of the previous intervals and 15 min', () => {
    const base = [0, 4, 8, 12, 16].map((m) => pt(m));
    const rows = deriveRows([...base, pt(16 + 20)]);
    expect(rows.map((r) => r.isGap)).toEqual([false, false, false, false, false, true]);
  });
  it('needs three previous intervals', () => {
    const rows = deriveRows([pt(0), pt(4), pt(8), pt(50)]);
    expect(rows[3].isGap).toBe(false);
    const more = deriveRows([pt(0), pt(4), pt(8), pt(12), pt(60)]);
    expect(more[4].isGap).toBe(true);
  });
  it('is not a gap below 15 min even if above 2.5x the median', () => {
    const rows = deriveRows([pt(0), pt(2), pt(4), pt(6), pt(8), pt(8 + 14)]);
    expect(rows[5].isGap).toBe(false);
  });
  it('is not a gap at 2.5x the median exactly', () => {
    const rows = deriveRows([pt(0), pt(6), pt(12), pt(18), pt(33)]);
    expect(rows[4].interval).toBe(15 * MIN);
    expect(rows[4].isGap).toBe(false);
  });
  it('uses only the previous five intervals for the median', () => {
    const early = [0, 30, 60, 90, 120].map((m) => pt(m));
    const quick = [124, 128, 132, 136, 140].map((m) => pt(m));
    const rows = deriveRows([...early, ...quick, pt(140 + 20)]);
    expect(rows[10].isGap).toBe(true);
  });
  it('handles an empty list', () => {
    expect(deriveRows([])).toEqual([]);
  });
});

describe('lastStats', () => {
  it('returns nulls for none and one point', () => {
    expect(lastStats([])).toEqual({ interval: null, duration: null });
    expect(lastStats([pt(0, 50)])).toEqual({ interval: null, duration: 50 * SEC });
  });
  it('returns the last interval and duration', () => {
    expect(lastStats([pt(0, 50), pt(4, 70)])).toEqual({ interval: 4 * MIN, duration: 70 * SEC });
  });
});

describe('rollingAverages', () => {
  const now = T0 + 60 * MIN;
  it('averages intervals and durations inside the window', () => {
    const pts = [pt(30, 40), pt(35, 50), pt(41, 60), pt(46, 70)];
    const r = rollingAverages(pts, now, 30);
    expect(r.intervalCount).toBe(3);
    expect(r.interval).toBeCloseTo((5 + 6 + 5) / 3 * MIN);
    expect(r.duration).toBe(55 * SEC);
  });
  it('treats the window as [now - window, now)', () => {
    const pts = [pt(30), pt(35), pt(40), pt(60)];
    const r = rollingAverages(pts, now, 30);
    expect(r.intervalCount).toBe(2);
  });
  it('is null with fewer than 2 intervals', () => {
    expect(rollingAverages([pt(50), pt(55)], now, 30)).toEqual({ interval: null, duration: null, intervalCount: 1 });
    expect(rollingAverages([], now, 60)).toEqual({ interval: null, duration: null, intervalCount: 0 });
  });
  it('counts an interval by the start of the later contraction', () => {
    const r = rollingAverages([pt(25), pt(31), pt(36)], now, 30);
    expect(r.intervalCount).toBe(2);
  });
  it('supports the 60 min window', () => {
    const r = rollingAverages([pt(1), pt(6), pt(11)], now, 60);
    expect(r.intervalCount).toBe(2);
  });
});

describe('per10Min', () => {
  it('counts starts in [now - 10 min, now)', () => {
    const now = T0 + 20 * MIN;
    const starts = [T0 + 9 * MIN, T0 + 10 * MIN, T0 + 15 * MIN, T0 + 20 * MIN];
    expect(per10Min(starts, now)).toBe(2);
  });
});

describe('tenMinuteBuckets', () => {
  it('builds fixed buckets from the session start', () => {
    const starts = [T0 + 1 * MIN, T0 + 9 * MIN, T0 + 10 * MIN, T0 + 25 * MIN];
    expect(tenMinuteBuckets(starts, T0, T0 + 25 * MIN)).toEqual([
      { start: T0, count: 2 },
      { start: T0 + 10 * MIN, count: 1 },
      { start: T0 + 20 * MIN, count: 1 },
    ]);
  });
  it('always has one bucket and ignores starts outside the range', () => {
    expect(tenMinuteBuckets([T0 - 1, T0 + 30 * MIN], T0, T0)).toEqual([{ start: T0, count: 0 }]);
  });
  it('never returns buckets for an end before the start', () => {
    expect(tenMinuteBuckets([], T0, T0 - 5 * MIN)).toEqual([{ start: T0, count: 0 }]);
  });
});

describe('leastSquaresSlope and rollingMean', () => {
  it('fits a line', () => {
    expect(leastSquaresSlope([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }])).toBeCloseTo(2);
    expect(leastSquaresSlope([{ x: 0, y: 5 }, { x: 1, y: 4 }])).toBeCloseTo(-1);
  });
  it('returns 0 when x never changes or there are too few points', () => {
    expect(leastSquaresSlope([{ x: 1, y: 1 }, { x: 1, y: 9 }])).toBe(0);
    expect(leastSquaresSlope([{ x: 1, y: 1 }])).toBe(0);
    expect(leastSquaresSlope([])).toBe(0);
  });
  it('rolls a trailing mean, null until k values exist', () => {
    expect(rollingMean([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    expect(rollingMean([1, 2], 3)).toEqual([null, null]);
  });
});

describe('regularity', () => {
  const now = T0 + 60 * MIN;
  const every = (n: number, gapMin: number, start = 0) =>
    Array.from({ length: n }, (_, i) => pt(start + i * gapMin));
  it('is null with fewer than 4 intervals', () => {
    expect(regularity(every(4, 5, 10), now)).toBeNull();
  });
  it('labels even spacing as Regular and gives the range in minutes', () => {
    const r = regularity(every(7, 5, 20), now);
    expect(r).toEqual({ label: 'Regular', cv: 0, rangeMin: [5, 5] });
  });
  it('labels CV 0.20 up to 0.40 Fairly regular', () => {
    const offsets = [0, 4, 9, 13, 18, 22, 27];
    const r = regularity(offsets.map((m) => pt(25 + m)), now)!;
    expect(r.cv).toBeGreaterThanOrEqual(0.1);
    const wide = [0, 3, 9, 12, 18, 21, 27].map((m) => pt(25 + m));
    const w = regularity(wide, now)!;
    expect(w.cv).toBeGreaterThanOrEqual(0.2);
    expect(w.cv).toBeLessThanOrEqual(0.4);
    expect(w.label).toBe('Fairly regular');
    expect(w.rangeMin).toEqual([3, 6]);
  });
  it('labels CV above 0.40 Irregular', () => {
    const odd = [0, 1, 8, 9, 16, 17, 24].map((m) => pt(30 + m));
    const r = regularity(odd, now)!;
    expect(r.cv).toBeGreaterThan(0.4);
    expect(r.label).toBe('Irregular');
  });
  it('labels CV just under 0.20 Regular', () => {
    const near = [0, 5, 10, 15, 21, 26].map((m) => pt(30 + m));
    const r = regularity(near, now)!;
    expect(r.cv).toBeLessThan(0.2);
    expect(r.label).toBe('Regular');
  });
  it('ignores gaps and intervals older than an hour', () => {
    const pts = [-30, -25, -20, -15, -10, 30, 35, 40, 45, 50].map((m) => pt(m));
    expect(regularity(pts, now)).toEqual({ label: 'Regular', cv: 0, rangeMin: [5, 5] });
    expect(regularity([pt(0), pt(5), pt(10), pt(15), pt(20), pt(25)], now + 120 * MIN)).toBeNull();
  });
  it('excludes a gap interval from the statistics', () => {
    const pts = [0, 5, 10, 15, 20, 25, 30, 50, 55, 60, 65].map((m) => pt(m));
    expect(deriveRows(pts).filter((r) => r.isGap)).toHaveLength(1);
    expect(regularity(pts, T0 + 65 * MIN)).toEqual({ label: 'Regular', cv: 0, rangeMin: [5, 5] });
  });
});

describe('progression', () => {
  const now = T0 + 60 * MIN;
  it('is all null with fewer than 5 points', () => {
    const pts = [pt(40), pt(45), pt(50), pt(55)];
    expect(progression(pts, now)).toEqual({ interval: null, duration: null, intensity: null });
  });
  it('detects intervals closing in', () => {
    const mins = [10, 20, 29, 37, 44, 50, 55];
    const p = progression(mins.map((m) => pt(m)), now);
    expect(p.interval).toBe('getting closer together');
  });
  it('detects intervals growing', () => {
    const mins = [10, 15, 21, 28, 36, 45, 55];
    expect(progression(mins.map((m) => pt(m)), now).interval).toBe('getting further apart');
  });
  it('reports steady for flat series', () => {
    const pts = [0, 10, 20, 30, 40, 50].map((m) => pt(m, 60, 5));
    expect(progression(pts, now)).toEqual({ interval: 'steady', duration: 'steady', intensity: 'steady' });
  });
  it('detects duration trends', () => {
    const longer = [10, 20, 30, 40, 50].map((m, i) => pt(m, 40 + i * 10));
    expect(progression(longer, now).duration).toBe('getting longer');
    const shorter = [10, 20, 30, 40, 50].map((m, i) => pt(m, 100 - i * 10));
    expect(progression(shorter, now).duration).toBe('getting shorter');
  });
  it('detects intensity trends using rated points only', () => {
    const up = [10, 20, 30, 40, 50].map((m, i) => pt(m, 60, 2 + i));
    expect(progression(up, now).intensity).toBe('getting stronger');
    const down = [10, 20, 30, 40, 50].map((m, i) => pt(m, 60, 9 - i));
    expect(progression(down, now).intensity).toBe('easing off');
    const sparse = [10, 20, 30, 40, 50].map((m, i) => pt(m, 60, i < 4 ? 5 : null));
    expect(progression(sparse, now).intensity).toBeNull();
  });
  it('only looks at the last 60 minutes', () => {
    const old = [-50, -40, -30, -20, -10].map((m) => pt(m));
    expect(progression(old, now)).toEqual({ interval: null, duration: null, intensity: null });
  });
  it('excludes gaps', () => {
    const mins = [0, 5, 10, 15, 20, 45, 50, 55];
    const p = progression(mins.map((m) => pt(m)), T0 + 56 * MIN);
    expect(p.interval).toBe('steady');
  });
});

describe('summarizeWindow', () => {
  it('counts every non-deleted start and averages counted rows only', () => {
    const cs = [
      c('a', T0, 60 * SEC, { intensity: 4 }),
      c('b', T0 + 5 * MIN, 50 * SEC, { intensity: 8 }),
      c('c', T0 + 10 * MIN, 40 * SEC),
      c('short', T0 + 12 * MIN, 2 * SEC, { intensity: 10 }),
      c('del', T0 + 13 * MIN, 60 * SEC, { deletedAt: 9 }),
      c('out', T0 + 3 * HOUR, 60 * SEC),
    ];
    const s = summarizeWindow(cs, T0, T0 + HOUR);
    expect(s.count).toBe(4);
    expect(s.avgInterval).toBe(5 * MIN);
    expect(s.avgDuration).toBe(50 * SEC);
    expect(s.avgIntensity).toBe(6);
    expect(s.unrated).toBe(1);
  });
  it('gives nulls for an empty window and for a single interval', () => {
    expect(summarizeWindow([], T0, T0 + HOUR)).toEqual({
      count: 0, counted: 0, avgInterval: null, avgDuration: null, avgIntensity: null, unrated: 0,
    });
    const s = summarizeWindow([c('a', T0), c('b', T0 + 4 * MIN)], T0, T0 + HOUR);
    expect(s.avgInterval).toBeNull();
    expect(s.avgDuration).toBe(60 * SEC);
  });
  it('counts a very short contraction in count but not in averages until reviewed', () => {
    const cs = [c('a', T0), c('s', T0 + MIN, 3 * SEC), c('b', T0 + 4 * MIN), c('d', T0 + 8 * MIN)];
    expect(summarizeWindow(cs, T0, T0 + HOUR).count).toBe(4);
    expect(summarizeWindow(cs, T0, T0 + HOUR).avgInterval).toBe(4 * MIN);
    const reviewed = cs.map((x) => (x.id === 's' ? { ...x, reviewed: true } : x));
    expect(summarizeWindow(reviewed, T0, T0 + HOUR).avgInterval).toBeCloseTo((8 * MIN) / 3);
  });
});

describe('summarizeWindow vs rollingAverages', () => {
  it('uses the interval that crosses the window edge, like rollingAverages', () => {
    // starts at -75, -50, -41, -20, -10 min: the -50 contraction's interval (25 min) reaches back out of the window.
    const now = T0 + 2 * HOUR;
    const cs = [75, 50, 41, 20, 10].map((m, i) => c(`x${i}`, now - m * MIN));
    const ra = rollingAverages(countedContractions(cs), now, 60);
    const sw = summarizeWindow(cs, now - HOUR, now);
    expect(ra.interval).toBe(((25 + 9 + 21 + 10) / 4) * MIN);
    expect(sw.avgInterval).toBe(ra.interval);
  });
  it('treats the window as [from, to)', () => {
    const cs = [c('a', T0), c('b', T0 + 4 * MIN), c('c', T0 + 8 * MIN)];
    expect(summarizeWindow(cs, T0, T0 + 8 * MIN).count).toBe(2);
    expect(summarizeWindow(cs, T0 + 4 * MIN, T0 + 9 * MIN).count).toBe(2);
  });
});

describe('summarizeEnough and patternAt', () => {
  it('hides averages below ENOUGH counted contractions', () => {
    const three = [c('a', T0), c('b', T0 + 4 * MIN), c('c', T0 + 8 * MIN)];
    const s = summarizeEnough(three, T0, T0 + HOUR);
    expect(s.enough).toBe(false);
    expect([s.count, s.avgInterval, s.avgDuration, s.avgIntensity]).toEqual([3, null, null, null]);
    expect(ENOUGH).toBe(4);
    expect(summarizeEnough([...three, c('d', T0 + 12 * MIN)], T0, T0 + HOUR).avgInterval).toBe(4 * MIN);
  });
  it('describes an ended session at its last contraction and an active one now', () => {
    const cs = [c('a', T0, 60 * SEC), c('b', T0 + 4 * MIN, 60 * SEC), c('gone', T0 + 9 * MIN, 60 * SEC, { deletedAt: 1 })];
    expect(patternAt({ startedAt: T0 - MIN, endedAt: T0 + 5 * HOUR }, cs, T0 + 9 * HOUR)).toBe(T0 + 5 * MIN);
    expect(patternAt({ startedAt: T0 - MIN, endedAt: null }, cs, T0 + 9 * HOUR)).toBe(T0 + 9 * HOUR);
    expect(patternAt({ startedAt: T0, endedAt: T0 + MIN }, [], T0 + HOUR)).toBe(T0);
  });
});

describe('findOverlap', () => {
  const cs = [c('a', T0, 60 * SEC), c('b', T0 + 10 * MIN, 60 * SEC), c('del', T0 + 20 * MIN, 60 * SEC, { deletedAt: 1 }), c('open', T0 + 30 * MIN, null)];
  it('finds an overlapping finished contraction', () => {
    expect(findOverlap(cs, { startAt: T0 + 30 * SEC, endAt: T0 + 2 * MIN })?.id).toBe('a');
    expect(findOverlap(cs, { startAt: T0 - MIN, endAt: T0 + 5 * SEC })?.id).toBe('a');
  });
  it('allows touching ranges', () => {
    expect(findOverlap(cs, { startAt: T0 + 60 * SEC, endAt: T0 + 2 * MIN })).toBeNull();
    expect(findOverlap(cs, { startAt: T0 - MIN, endAt: T0 })).toBeNull();
  });
  it('ignores deleted and in-progress rows and the excluded id', () => {
    expect(findOverlap(cs, { startAt: T0 + 20 * MIN, endAt: T0 + 21 * MIN })).toBeNull();
    expect(findOverlap(cs, { startAt: T0 + 30 * MIN, endAt: T0 + 31 * MIN })).toBeNull();
    expect(findOverlap(cs, { startAt: T0, endAt: T0 + MIN }, 'a')).toBeNull();
  });
});

describe('computeLiveMetrics', () => {
  it('bundles live numbers', () => {
    const now = T0 + 60 * MIN;
    const cs = series(8, T0 + 25 * MIN, 4 * MIN, 55 * SEC, 6);
    const m = computeLiveMetrics(cs, now);
    expect(m.last).toEqual({ interval: 4 * MIN, duration: 55 * SEC });
    expect(m.avg30.intervalCount).toBe(6);
    expect(m.avg60.interval).toBe(4 * MIN);
    expect(m.regularity?.label).toBe('Regular');
    expect(m.progression.interval).toBe('steady');
    expect(m.per10).toBe(1);
    expect(m.lastHour).toHaveLength(8);
  });
  it('is empty and null with no contractions', () => {
    const m = computeLiveMetrics([], T0);
    expect(m.last).toEqual({ interval: null, duration: null });
    expect(m.regularity).toBeNull();
    expect(m.per10).toBe(0);
    expect(m.lastHour).toEqual([]);
  });
});

describe('computeSessionMetrics', () => {
  const range = { from: T0, to: T0 + 2 * HOUR };
  it('returns rows, summary, buckets and trend lines for a normal session', () => {
    const cs = series(10, T0 + 70 * MIN, 5 * MIN, 60 * SEC, 4);
    const events = [ev('e2', T0 + 80 * MIN, 'note', null, 'hi'), ev('e1', T0 + 75 * MIN, 'bleeding'), ev('x', T0, 'note', null, null, { deletedAt: 1 })];
    const m = computeSessionMetrics(cs, events, range);
    expect(m.rows).toHaveLength(10);
    expect(m.summary.count).toBe(10);
    expect(m.buckets).toHaveLength(13);
    expect(m.events.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(m.trends.interval.points).toHaveLength(9);
    expect(m.trends.interval.line).toHaveLength(9);
    expect(m.trends.duration.line?.[2]).toBe(60 * SEC);
    expect(m.trends.intensity.points).toHaveLength(10);
    expect(m.regularity?.label).toBe('Regular');
    expect(m.progression.interval).toBe('steady');
  });
  it('has no trend lines and null stats for 1 to 3 contractions', () => {
    for (const n of [1, 2, 3]) {
      const m = computeSessionMetrics(series(n, T0 + 10 * MIN, 5 * MIN), [], range);
      expect(m.regularity).toBeNull();
      expect(m.progression).toEqual({ interval: null, duration: null, intensity: null });
      expect(m.trends.interval.line).toBeNull();
      expect(m.trends.duration.line).toBeNull();
      expect(m.trends.intensity.line).toBeNull();
    }
  });
  it('only includes contractions inside the range', () => {
    const cs = [...series(3, T0 - HOUR, 5 * MIN), ...series(2, T0 + 10 * MIN, 5 * MIN).map((x) => ({ ...x, id: `in-${x.id}` }))];
    const m = computeSessionMetrics(cs, [], range);
    expect(m.rows.map((r) => r.c.id)).toEqual(['in-c0', 'in-c1']);
    expect(m.summary.count).toBe(2);
  });
  it.runIf(process.env.EBB_BENCH === '1')('computes a 24 h session with 320 contractions in under 16 ms', { retry: 2 }, () => {
    // Opt-in timing benchmark (fake-indexeddb/jsdom timings are load-sensitive): run with `npm run test:bench`.
    // The binding in-browser budgets are enforced by e2e/quality/perf.spec.ts.
    const start = T0;
    const cs = Array.from({ length: 320 }, (_, i) =>
      c(`c${i}`, start + i * 4.5 * MIN + (i % 7) * SEC, 50 * SEC + (i % 11) * SEC, { intensity: (i % 9) + 1 }),
    );
    const events = Array.from({ length: 20 }, (_, i) => ev(`e${i}`, start + i * HOUR, 'note'));
    const r = { from: start, to: start + 24 * HOUR };
    // Warm-up runs (not measured) so first-call costs don't land in the sample.
    for (let i = 0; i < 10; i++) {
      computeSessionMetrics(cs, events, r);
    }
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      computeSessionMetrics(cs, events, r);
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    expect(times[2]).toBeLessThan(16);
  });
});

describe('createMemo', () => {
  it('reuses the live result for the same array and the same second', () => {
    const memo = createMemo();
    const cs = series(3, T0, 5 * MIN);
    const a = memo.live(cs, T0 + 1000);
    expect(memo.live(cs, T0 + 1999)).toBe(a);
    expect(memo.live(cs, T0 + 2000)).not.toBe(a);
    expect(memo.live([...cs], T0 + 2000)).not.toBe(a);
  });
  it('reuses the session result for same arrays and range, recomputes otherwise', () => {
    const memo = createMemo();
    const cs = series(3, T0, 5 * MIN);
    const events = [ev('e', T0, 'note')];
    const a = memo.session(cs, events, { from: T0, to: T0 + 5000 });
    expect(memo.session(cs, events, { from: T0, to: T0 + 5500 })).toBe(a);
    expect(memo.session(cs, events, { from: T0, to: T0 + 6000 })).not.toBe(a);
    const b = memo.session(cs, events, { from: T0, to: T0 + 6000 });
    expect(memo.session(cs, [...events], { from: T0, to: T0 + 6000 })).not.toBe(b);
    expect(memo.session([...cs], events, { from: T0, to: T0 + 6000 })).not.toBe(b);
    expect(memo.session(cs, events, { from: T0 + 1, to: T0 + 6000 })).not.toBe(b);
  });
});
