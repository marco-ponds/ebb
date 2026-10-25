import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../db/defaults';
import type { Contraction, Threshold } from '../../db/types';
import { evaluateBanner, eventShort, pausedMs, staleMinutes } from './liveLogic';

const MIN = 60_000;
const NOW = 1_700_000_000_000;

function c(startAt: number, endAt: number | null, extra: Partial<Contraction> = {}): Contraction {
  return {
    id: `c-${startAt}`,
    sessionId: 's',
    startAt,
    endAt,
    intensity: null,
    note: null,
    deletedAt: null,
    timeChanged: false,
    reviewed: false,
    updatedAt: startAt,
    ...extra,
  };
}

describe('staleMinutes', () => {
  it('is null for no contraction or up to 5 minutes', () => {
    expect(staleMinutes(null, NOW)).toBeNull();
    expect(staleMinutes(c(NOW - 5 * MIN, null), NOW)).toBeNull();
  });

  it('floors the elapsed minutes once over 5 minutes', () => {
    expect(staleMinutes(c(NOW - (23 * MIN + 59_000), null), NOW)).toBe(23);
    expect(staleMinutes(c(NOW - (5 * MIN + 1), null), NOW)).toBe(5);
  });
});

describe('pausedMs', () => {
  it('needs a resting session with at least one contraction and a start 60 minutes ago', () => {
    expect(pausedMs([], null, NOW)).toBeNull();
    expect(pausedMs([c(NOW - 59 * MIN, NOW - 58 * MIN)], null, NOW)).toBeNull();
    expect(pausedMs([c(NOW - 72 * MIN, NOW - 71 * MIN)], null, NOW)).toBe(72 * MIN);
    expect(pausedMs([c(NOW - 60 * MIN, NOW - 59 * MIN)], null, NOW)).toBe(60 * MIN);
  });

  it('is null while a contraction is in progress', () => {
    const open = c(NOW - 90 * MIN, null);
    expect(pausedMs([open], open, NOW)).toBeNull();
  });

  it('measures from the latest start', () => {
    expect(pausedMs([c(NOW - 200 * MIN, NOW - 199 * MIN), c(NOW - 61 * MIN, NOW - 60 * MIN)], null, NOW)).toBe(61 * MIN);
  });
});

describe('eventShort', () => {
  it('uses short lower-case names', () => {
    expect(eventShort('waters')).toBe('waters');
    expect(eventShort('reduced-movement')).toBe('reduced movement');
    expect(eventShort('went-to-hospital')).toBe('went to hospital');
  });
});

describe('evaluateBanner', () => {
  const threeInTen: Threshold = { id: 't1', kind: 'n-in-m', n: 3, minutes: 10, enabled: true, label: null, preset: false };
  const three = [c(NOW - 8 * MIN, NOW - 7 * MIN), c(NOW - 5 * MIN, NOW - 4 * MIN), c(NOW - 2 * MIN, NOW - MIN)];
  const idle = [c(NOW - 40 * MIN, NOW - 39 * MIN)];

  it('shows an enabled threshold that holds', () => {
    const r = evaluateBanner([threeInTen], three, NOW, new Set());
    expect(r.shown?.id).toBe('t1');
    expect(r.held).toEqual(['t1']);
  });

  it('ignores disabled thresholds', () => {
    expect(evaluateBanner([{ ...threeInTen, enabled: false }], three, NOW, new Set()).shown).toBeNull();
  });

  it('stays hidden after dismissal while the rule keeps holding', () => {
    const r = evaluateBanner([threeInTen], three, NOW, new Set(['t1']));
    expect(r.shown).toBeNull();
    expect(r.held).toEqual(['t1']);
    expect([...r.dismissed]).toEqual(['t1']);
  });

  it('forgets the dismissal once the rule stops holding, so it can show again', () => {
    const broken = evaluateBanner([threeInTen], idle, NOW, new Set(['t1']));
    expect(broken.shown).toBeNull();
    expect([...broken.dismissed]).toEqual([]);
    expect(evaluateBanner([threeInTen], three, NOW, broken.dismissed).shown?.id).toBe('t1');
  });

  it('shows the first held threshold that has not been dismissed', () => {
    const second: Threshold = { ...threeInTen, id: 't2', n: 2 };
    expect(evaluateBanner([threeInTen, second], three, NOW, new Set(['t1'])).shown?.id).toBe('t2');
  });

  it('works with the shipped presets (all off by default)', () => {
    expect(evaluateBanner(DEFAULT_SETTINGS.thresholds, three, NOW, new Set()).shown).toBeNull();
  });
});
