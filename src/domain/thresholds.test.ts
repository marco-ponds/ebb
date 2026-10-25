import { describe, expect, it } from 'vitest';
import type { AldThreshold, NInMThreshold, Threshold } from '../db/types';
import {
  bannerText,
  evaluateThreshold,
  firstMet,
  thresholdDescription,
  thresholdName,
  validateCustom,
} from './thresholds';
import { HOUR, MIN, SEC, c, series } from './__tests__/fixtures';

const NOW = Date.UTC(2026, 9, 24, 22, 0, 0);

const nInM = (n: number, minutes: number, over: Partial<NInMThreshold> = {}): NInMThreshold => ({
  id: `n${n}-${minutes}`, kind: 'n-in-m', n, minutes, enabled: true, label: null, preset: false, ...over,
});
const ald = (apartMin: number, lastingMin: number, hours: number, over: Partial<AldThreshold> = {}): AldThreshold => ({
  id: `a${apartMin}-${lastingMin}-${hours}`, kind: 'ald', apartMin, lastingMin, hours, enabled: true, label: null, preset: false, ...over,
});

describe('names and descriptions', () => {
  it('names thresholds', () => {
    expect(thresholdName(nInM(3, 10))).toBe('3 in 10 min');
    expect(thresholdName(ald(5, 1, 1))).toBe('5-1-1');
    expect(thresholdName(ald(5, 0.5, 2))).toBe('5-0.5-2');
    expect(thresholdName(nInM(3, 10, { label: 'Midwife plan' }))).toBe('Midwife plan');
    expect(thresholdName(nInM(3, 10, { label: '  ' }))).toBe('3 in 10 min');
  });
  it('describes thresholds', () => {
    expect(thresholdDescription(nInM(3, 10))).toBe('Three contractions within ten minutes');
    expect(thresholdDescription(nInM(1, 1))).toBe('One contraction within one minute');
    expect(thresholdDescription(nInM(20, 45))).toBe('Twenty contractions within 45 minutes');
    expect(thresholdDescription(nInM(21 as number, 120))).toBe('21 contractions within 120 minutes');
    expect(thresholdDescription(ald(5, 1, 1))).toBe('5 min apart, 1 min long, for 1 hour');
    expect(thresholdDescription(ald(4, 0.5, 2))).toBe('4 min apart, 0.5 min long, for 2 hours');
  });
  it('writes the banner', () => {
    expect(bannerText(ald(5, 1, 1))).toBe('Matches the threshold you set — 5-1-1');
    expect(bannerText(nInM(3, 10, { label: 'My plan' }))).toBe('Matches the threshold you set — My plan');
  });
});

describe('N in M', () => {
  const t = nInM(3, 10);
  it('is met with N starts in the last M minutes', () => {
    const cs = series(3, NOW - 9 * MIN, 4 * MIN);
    expect(evaluateThreshold(t, cs, NOW)).toBe(true);
  });
  it('is not met with fewer', () => {
    expect(evaluateThreshold(t, series(2, NOW - 9 * MIN, 4 * MIN), NOW)).toBe(false);
  });
  it('counts a start exactly M minutes ago but not one just before', () => {
    const edge = [c('a', NOW - 10 * MIN), c('b', NOW - 5 * MIN), c('c', NOW - MIN)];
    expect(evaluateThreshold(t, edge, NOW)).toBe(true);
    const late = [c('a', NOW - 10 * MIN - 1), c('b', NOW - 5 * MIN), c('c', NOW - MIN)];
    expect(evaluateThreshold(t, late, NOW)).toBe(false);
  });
  it('uses every non-deleted start, including in-progress and very short', () => {
    const cs = [c('a', NOW - 9 * MIN, 2 * SEC), c('b', NOW - 5 * MIN), c('c', NOW - MIN, null), c('d', NOW - 2 * MIN, 60 * SEC, { deletedAt: 1 })];
    expect(evaluateThreshold(t, cs, NOW)).toBe(true);
    expect(evaluateThreshold(nInM(4, 10), cs, NOW)).toBe(false);
  });
});

describe('A-L-D', () => {
  const t = ald(5, 1, 1);
  const hour = (every: number, dur: number, n = 12) => series(n, NOW - 56 * MIN, every, dur);
  it('is met by 12 contractions 5 min apart lasting 1 min', () => {
    expect(evaluateThreshold(t, hour(5 * MIN, 60 * SEC), NOW)).toBe(true);
  });
  it('is met with the minimum count (D x 60 / A - 1 = 11)', () => {
    expect(evaluateThreshold(t, hour(5 * MIN, 60 * SEC, 11), NOW)).toBe(true);
    expect(evaluateThreshold(t, hour(5 * MIN, 60 * SEC, 10), NOW)).toBe(false);
  });
  it('allows 5 s of tolerance on interval, but not more', () => {
    expect(evaluateThreshold(t, hour(5 * MIN + 5 * SEC, 60 * SEC, 11), NOW)).toBe(true);
    expect(evaluateThreshold(t, hour(5 * MIN + 6 * SEC, 60 * SEC, 11), NOW)).toBe(false);
  });
  it('allows 5 s of tolerance on duration, but not more', () => {
    expect(evaluateThreshold(t, hour(5 * MIN, 55 * SEC), NOW)).toBe(true);
    expect(evaluateThreshold(t, hour(5 * MIN, 54 * SEC), NOW)).toBe(false);
  });
  it('is not met when one interval is too long', () => {
    const starts = [0, 5, 10, 15, 20, 25, 32, 37, 42, 47, 52, 57].map((m) => NOW - (58 - m) * MIN);
    const cs = starts.map((s, i) => c(`c${i}`, s, 60 * SEC));
    expect(evaluateThreshold(t, cs, NOW)).toBe(false);
  });
  it('only looks at the last D hours', () => {
    const old = series(12, NOW - 3 * HOUR, 5 * MIN);
    expect(evaluateThreshold(t, old, NOW)).toBe(false);
  });
  it('ignores very short unreviewed contractions', () => {
    const cs = [...hour(5 * MIN, 60 * SEC, 12), c('tiny', NOW - 30 * MIN, 2 * SEC)];
    expect(evaluateThreshold(t, cs, NOW)).toBe(true);
  });
  it('is not met when a gap breaks the run', () => {
    // 5 min apart, then a 40 min silence, then 5 min apart again; all within a long window.
    const long = ald(60, 1, 3); // intervals up to 60 min allowed, so only the gap rule can fail it
    const before = series(6, NOW - 150 * MIN, 5 * MIN).map((x) => ({ ...x, id: `b${x.id}` }));
    const after = series(14, NOW - 80 * MIN, 5 * MIN).map((x) => ({ ...x, id: `a${x.id}` }));
    expect(evaluateThreshold(long, [...before, ...after], NOW)).toBe(false);
    expect(evaluateThreshold(long, after, NOW)).toBe(true);
  });
  it('needs at least one contraction', () => {
    expect(evaluateThreshold(ald(30, 1, 0.5), [], NOW)).toBe(false);
  });
});

describe('firstMet', () => {
  const cs = series(12, NOW - 56 * MIN, 5 * MIN);
  it('returns the first enabled threshold that is met, in list order', () => {
    const a = ald(5, 1, 1, { id: 'a' });
    const b = nInM(3, 15, { id: 'b' });
    expect(firstMet([a, b], cs, NOW)?.id).toBe('a');
    expect(firstMet([b, a], cs, NOW)?.id).toBe('b');
  });
  it('skips disabled and unmet thresholds', () => {
    const list: Threshold[] = [nInM(3, 10, { id: 'off', enabled: false }), nInM(9, 10, { id: 'no' }), ald(5, 1, 1, { id: 'yes' })];
    expect(firstMet(list, cs, NOW)?.id).toBe('yes');
  });
  it('returns null when nothing matches', () => {
    expect(firstMet([nInM(9, 10)], cs, NOW)).toBeNull();
    expect(firstMet([], cs, NOW)).toBeNull();
  });
});

describe('validateCustom', () => {
  it('accepts valid input', () => {
    expect(validateCustom({ kind: 'n-in-m', n: 3, minutes: 10 })).toEqual({});
    expect(validateCustom({ kind: 'ald', apartMin: 5, lastingMin: 1, hours: 1 })).toEqual({});
    expect(validateCustom({ kind: 'n-in-m', n: 20, minutes: 120 })).toEqual({});
    expect(validateCustom({ kind: 'ald', apartMin: 30, lastingMin: 5, hours: 6 })).toEqual({});
    expect(validateCustom({ kind: 'ald', apartMin: 1, lastingMin: 0.5, hours: 0.5 })).toEqual({});
  });
  it('rejects out-of-range and non-positive n-in-m values', () => {
    expect(Object.keys(validateCustom({ kind: 'n-in-m', n: 0, minutes: 0 }))).toEqual(['n', 'minutes']);
    expect(validateCustom({ kind: 'n-in-m', n: 21, minutes: 121 })).toEqual({
      n: 'Use a whole number from 1 to 20',
      minutes: 'Use a number from 1 to 120',
    });
    expect(validateCustom({ kind: 'n-in-m', n: 2.5, minutes: 10 }).n).toBeDefined();
    expect(validateCustom({ kind: 'n-in-m', n: -1, minutes: Number.NaN })).toMatchObject({ n: expect.any(String), minutes: expect.any(String) });
  });
  it('rejects out-of-range A-L-D values', () => {
    expect(validateCustom({ kind: 'ald', apartMin: 31, lastingMin: 0.4, hours: 6.5 })).toEqual({
      apartMin: 'Use a number from 1 to 30',
      lastingMin: 'Use a number from 0.5 to 5',
      hours: 'Use a number from 0.5 to 6',
    });
    expect(Object.keys(validateCustom({ kind: 'ald', apartMin: 0, lastingMin: 5.1, hours: 0 }))).toEqual(['apartMin', 'lastingMin', 'hours']);
  });
});
