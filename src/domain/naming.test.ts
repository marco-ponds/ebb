process.env.TZ = 'Europe/London';
import { describe, expect, it } from 'vitest';
import type { Session } from '../db/types';
import { defaultSessionName, displayName, partOfDay } from './naming';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime(); // Oct 2026
const session = (over: Partial<Session> = {}): Session => ({
  id: 's', name: null, startedAt: at(20, 19, 5), endedAt: at(20, 23, 40), notes: '',
  createdAt: 0, updatedAt: 0, thresholdMetAt: null, ...over,
});

describe('partOfDay', () => {
  it.each([
    [4, 59, 'night'], [5, 0, 'morning'], [11, 59, 'morning'], [12, 0, 'afternoon'],
    [16, 59, 'afternoon'], [17, 0, 'evening'], [20, 59, 'evening'], [21, 0, 'night'], [0, 0, 'night'],
  ])('%s:%s is %s', (h, m, part) => {
    expect(partOfDay(at(20, h, m))).toBe(part);
  });
});

describe('defaultSessionName', () => {
  it('uses the weekday of the start', () => {
    expect(defaultSessionName(at(20, 19, 5))).toBe('Tuesday evening');
    expect(defaultSessionName(at(24, 23, 30))).toBe('Saturday night');
    expect(defaultSessionName(at(25, 2, 10))).toBe('Sunday night');
    expect(defaultSessionName(at(25, 6, 0))).toBe('Sunday morning');
  });
  it('keeps the start day for a session that runs past midnight', () => {
    const s = session({ startedAt: at(24, 23, 30), endedAt: at(25, 4, 0) });
    expect(displayName(s, at(26, 12))).toBe('Saturday night');
  });
});

describe('displayName', () => {
  it('prefers the set name', () => {
    expect(displayName(session({ name: 'Baby 2' }), at(21, 9))).toBe('Baby 2');
  });
  it('treats a blank name as unset', () => {
    expect(displayName(session({ name: '  ' }), at(21, 9))).toBe('Tuesday evening');
  });
  it('shows a relative name for an active unnamed session', () => {
    const active = session({ endedAt: null });
    expect(displayName(active, at(20, 19, 30))).toBe('Tonight');
    expect(displayName(active, at(21, 2, 0))).toBe('Tonight');
    expect(displayName(active, at(21, 8, 0))).toBe('This morning');
    expect(displayName(active, at(21, 14, 0))).toBe('This afternoon');
  });
  it('falls back to the default name for an ended unnamed session', () => {
    expect(displayName(session(), at(21, 9))).toBe('Tuesday evening');
  });
});
