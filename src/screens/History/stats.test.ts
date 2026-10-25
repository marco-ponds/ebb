import { describe, expect, it } from 'vitest';
import type { Contraction, Session } from '../../db/types';
import { cardStats } from './stats';

const MIN = 60_000;
const session = (p: Partial<Session> = {}): Session => ({
  id: 's',
  name: null,
  startedAt: new Date(2026, 9, 25, 21, 40).getTime(),
  endedAt: null,
  notes: '',
  createdAt: 0,
  updatedAt: 0,
  thresholdMetAt: null,
  ...p,
});
const series = (startedAt: number, count: number, everyMin: number, lastingS: number): Contraction[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    sessionId: 's',
    startAt: startedAt + i * everyMin * MIN,
    endAt: startedAt + i * everyMin * MIN + lastingS * 1000,
    intensity: null,
    note: null,
    deletedAt: null,
    timeChanged: false,
    reviewed: false,
    updatedAt: 0,
  }));

describe('cardStats', () => {
  it('describes an active session up to now', () => {
    const s = session();
    const now = s.startedAt + 139 * MIN;
    const stats = cardStats(s, series(s.startedAt, 22, 6, 48), now);
    expect(stats.title).toBe('Tonight');
    expect(stats.active).toBe(true);
    expect(stats.when).toBe('Sun 25 Oct · 21:40 – now · 2 h 19 m');
    expect(stats.counts).toEqual({ count: '22', apart: '6m', long: '48s' });
  });

  it('describes an ended session with its time range and a default name', () => {
    const s = session({ endedAt: new Date(2026, 9, 25, 22, 20).getTime() });
    const stats = cardStats(s, series(s.startedAt, 5, 9, 30), s.endedAt! + 5 * MIN);
    expect(stats.title).toBe('Sunday night');
    expect(stats.active).toBe(false);
    expect(stats.when).toBe('Sun 25 Oct · 21:40–22:20 · 40 m');
    expect(stats.counts.long).toBe('30s');
  });

  it('shows dashes when there are too few contractions to average', () => {
    const s = session({ endedAt: session().startedAt + 10 * MIN });
    const stats = cardStats(s, series(s.startedAt, 1, 5, 40), s.endedAt!);
    expect(stats.counts.count).toBe('1');
    expect(stats.counts.apart).toBe('—');
  });

  it('shows a custom name and ignores deleted contractions in the count', () => {
    const s = session({ name: 'Round two', endedAt: session().startedAt + 30 * MIN });
    const cs = series(s.startedAt, 3, 5, 40);
    cs[2] = { ...cs[2]!, deletedAt: 1 };
    const stats = cardStats(s, cs, s.endedAt!);
    expect(stats.title).toBe('Round two');
    expect(stats.counts.count).toBe('2');
  });
});
