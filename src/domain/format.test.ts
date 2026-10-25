process.env.TZ = 'Europe/London';
import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatDateShort,
  formatDuration,
  formatIntensity,
  formatRegularityRange,
  formatRelativeDays,
  formatSessionLength,
  formatSpoken,
  formatSummaryMinutes,
  formatSummarySeconds,
  formatTimeRange,
  formatTimer,
  toLocalIso,
} from './format';
import { HOUR, MIN, SEC } from './__tests__/fixtures';

// Europe/London: BST (UTC+1) until Sun 25 Oct 2026 01:00 UTC, then GMT.
const local = (y: number, mo: number, d: number, h: number, mi: number, s = 0) =>
  new Date(y, mo - 1, d, h, mi, s).getTime();

describe('time zone', () => {
  it('runs in Europe/London', () => {
    expect(new Date(Date.UTC(2026, 6, 1, 12)).getHours()).toBe(13);
    expect(new Date(Date.UTC(2026, 11, 1, 12)).getHours()).toBe(12);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0s'], [58 * SEC, '58s'], [59_600, '1m'], [250 * SEC, '4m 10s'], [305 * SEC, '5m 05s'],
    [4 * MIN, '4m'], [59 * MIN + 59 * SEC, '59m 59s'], [75 * MIN, '1 h 15 m'], [2 * HOUR, '2 h'],
    [-5, '0s'],
  ])('%s ms -> %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe('formatTimer', () => {
  it.each([
    [0, '0:00'], [48_900, '0:48'], [222 * SEC, '3:42'], [HOUR + 2 * MIN + 5 * SEC, '1:02:05'], [-3, '0:00'],
  ])('%s ms -> %s', (ms, text) => {
    expect(formatTimer(ms)).toBe(text);
  });
});

describe('local time formats', () => {
  it('formatClock uses 24-hour local time', () => {
    expect(formatClock(local(2026, 10, 24, 23, 44))).toBe('23:44');
    expect(formatClock(local(2026, 10, 24, 0, 5))).toBe('00:05');
  });
  it('formatDateShort', () => {
    expect(formatDateShort(local(2026, 10, 25, 12, 0))).toBe('Sun 25 Oct');
    expect(formatDateShort(local(2026, 1, 5, 12, 0))).toBe('Mon 5 Jan');
  });
  it('formatTimeRange', () => {
    expect(formatTimeRange(local(2026, 10, 20, 19, 5), local(2026, 10, 20, 23, 40))).toBe('19:05–23:40');
    expect(formatTimeRange(local(2026, 10, 20, 21, 40), null)).toBe('21:40 – now');
  });
  it('toLocalIso gives local time with offset', () => {
    expect(toLocalIso(local(2026, 10, 25, 23, 31, 5))).toBe('2026-10-25T23:31:05+00:00');
    expect(toLocalIso(local(2026, 7, 1, 9, 3, 0))).toBe('2026-07-01T09:03:00+01:00');
  });
  it('toLocalIso handles zones east of UTC and negative offsets', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'Asia/Kolkata';
      expect(toLocalIso(Date.UTC(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01T05:30:00+05:30');
      process.env.TZ = 'America/St_Johns';
      expect(toLocalIso(Date.UTC(2026, 0, 1, 12, 0, 0))).toBe('2026-01-01T08:30:00-03:30');
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('daylight saving end on 25 Oct 2026', () => {
  it('shows the repeated hour twice but measures real elapsed time', () => {
    const firstOneThirty = Date.UTC(2026, 9, 25, 0, 30); // 01:30 BST
    const secondOneThirty = Date.UTC(2026, 9, 25, 1, 30); // 01:30 GMT
    expect(formatClock(firstOneThirty)).toBe('01:30');
    expect(formatClock(secondOneThirty)).toBe('01:30');
    expect(toLocalIso(firstOneThirty)).toBe('2026-10-25T01:30:00+01:00');
    expect(toLocalIso(secondOneThirty)).toBe('2026-10-25T01:30:00+00:00');
    const start = local(2026, 10, 24, 23, 0);
    const end = local(2026, 10, 25, 3, 0);
    expect(end - start).toBe(5 * HOUR);
    expect(formatSessionLength(end - start)).toBe('5 h');
    expect(formatTimeRange(start, end)).toBe('23:00–03:00');
  });
});

describe('formatSessionLength', () => {
  it.each([[40 * MIN, '40 m'], [139 * MIN, '2 h 19 m'], [2 * HOUR, '2 h'], [0, '0 m']])('%s -> %s', (ms, t) => {
    expect(formatSessionLength(ms)).toBe(t);
  });
});

describe('formatSpoken', () => {
  it.each([
    [222 * SEC, '3 minutes 42 seconds'], [58 * SEC, '58 seconds'], [SEC, '1 second'], [0, '0 seconds'],
    [62 * MIN, '1 hour 2 minutes'], [MIN, '1 minute'], [3 * MIN, '3 minutes'], [2 * HOUR, '2 hours'],
    [MIN + SEC, '1 minute 1 second'],
  ])('%s -> %s', (ms, t) => {
    expect(formatSpoken(ms)).toBe(t);
  });
});

describe('formatRelativeDays', () => {
  const now = local(2026, 10, 25, 10, 0);
  it('uses calendar days in local time', () => {
    expect(formatRelativeDays(null, now)).toBe('never');
    expect(formatRelativeDays(local(2026, 10, 25, 0, 1), now)).toBe('today');
    expect(formatRelativeDays(local(2026, 10, 24, 23, 59), now)).toBe('yesterday');
    expect(formatRelativeDays(local(2026, 10, 20, 12, 0), now)).toBe('5 days ago');
    expect(formatRelativeDays(local(2026, 10, 26, 12, 0), now)).toBe('today');
  });
  it('is not thrown off by the 25 hour day', () => {
    expect(formatRelativeDays(local(2026, 10, 24, 0, 30), now)).toBe('yesterday');
    expect(formatRelativeDays(local(2026, 10, 25, 0, 30), local(2026, 10, 25, 23, 30))).toBe('today');
  });
});

describe('summary formats', () => {
  it('minutes', () => {
    expect(formatSummaryMinutes(4.5 * MIN)).toBe('4.5 min');
    expect(formatSummaryMinutes(5 * MIN)).toBe('5 min');
    expect(formatSummaryMinutes(4.96 * MIN)).toBe('5 min');
  });
  it('seconds', () => {
    expect(formatSummarySeconds(55 * SEC)).toBe('55 s');
    expect(formatSummarySeconds(55_400)).toBe('55 s');
  });
});

describe('formatIntensity', () => {
  it('formats by scale', () => {
    expect(formatIntensity(6, 'words')).toBe('Strong');
    expect(formatIntensity(6, 'numeric')).toBe('6');
    expect(formatIntensity(6, 'both')).toBe('Strong · 6');
    expect(formatIntensity(5, 'words')).toBe('Strong');
    expect(formatIntensity(3, 'both')).toBe('Medium · 3');
    expect(formatIntensity(null, 'words')).toBe('—');
    expect(formatIntensity(null, 'numeric')).toBe('—');
  });
});

describe('formatRegularityRange', () => {
  it('collapses equal ends', () => {
    expect(formatRegularityRange([4, 6])).toBe('every 4–6 min');
    expect(formatRegularityRange([5, 5])).toBe('every 5 min');
  });
});
