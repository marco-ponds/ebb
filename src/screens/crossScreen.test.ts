import { describe, expect, it } from 'vitest';
import type { Contraction, Session } from '../db/types';
import { formatDuration, formatSummaryMinutes, formatSummarySeconds } from '../domain/format';
import { computeSessionMetrics, patternAt } from '../domain/metrics';
import { summaryText } from '../domain/summary';
import { shapeCompare } from './Compare/shape';
import { cardStats } from './History/stats';
import { detailStats } from './SessionDetail/model';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = new Date(2026, 9, 24, 20, 0).getTime();

function ended(): { session: Session; cs: Contraction[] } {
  const gaps = [0, 5, 9, 3, 7, 4, 10, 6, 5, 8];
  let t = T0;
  const cs: Contraction[] = gaps.map((g, i) => {
    t += g * MIN;
    return {
      id: `c${i}`,
      sessionId: 's',
      startAt: t,
      endAt: t + (40 + i * 5) * 1000,
      intensity: null,
      note: null,
      deletedAt: null,
      timeChanged: false,
      reviewed: false,
      updatedAt: 0,
    };
  });
  // Ended 3 h after the last contraction: patterns must still be described at the last contraction.
  const session: Session = {
    id: 's', name: null, startedAt: T0, endedAt: t + 3 * HOUR, notes: '', createdAt: 0, updatedAt: 0, thresholdMetAt: null,
  };
  return { session, cs };
}

describe('one irregular ended session across screens', () => {
  const { session, cs } = ended();
  const now = session.endedAt! + 5 * HOUR;

  const history = cardStats(session, cs, now).counts;
  const compare = shapeCompare([{ session, contractions: cs }], now, 'numeric').series[0]!.metrics;
  const detail = detailStats(cs, session.endedAt!, false, session.startedAt);
  const patternTo = patternAt(session, cs, session.endedAt!);
  const pattern = computeSessionMetrics(cs, [], { from: session.startedAt, to: patternTo }).regularity;
  const share = summaryText({ contractions: cs, events: [], now: session.endedAt!, scope: 'whole', sessionStart: session.startedAt, sessionEnd: session.endedAt });

  it('agrees on time apart', () => {
    expect(detail.avgInterval).not.toBeNull();
    const apart = formatDuration(detail.avgInterval!);
    expect(history.apart).toBe(apart);
    expect(compare.apart).toBe(apart);
    expect(share).toContain(`every ${formatSummaryMinutes(detail.avgInterval!)}`);
  });
  it('agrees on lasting', () => {
    const lasting = formatDuration(detail.avgDuration!);
    expect(history.long).toBe(lasting);
    expect(compare.lasting).toBe(lasting);
    expect(share).toContain(`lasting about ${formatSummarySeconds(detail.avgDuration!)}`);
  });
  it('agrees on the pattern, evaluated at the last contraction rather than at the end of the session', () => {
    expect(pattern).not.toBeNull();
    expect(compare.pattern).toBe(pattern!.label);
  });
  it('shows the same count', () => {
    expect(history.count).toBe(String(detail.windowCount));
    expect(compare.contractions).toBe(history.count);
  });
});

describe('a session with one contraction', () => {
  it('shows — on the History card and in Compare, like Session detail', () => {
    const { session, cs } = ended();
    const one = [cs[0]!];
    const s = { ...session, endedAt: one[0]!.endAt! + MIN };
    const counts = cardStats(s, one, s.endedAt!).counts;
    expect(counts).toMatchObject({ count: '1', apart: '—', long: '—' });
    expect(shapeCompare([{ session: s, contractions: one }], s.endedAt!, 'numeric').series[0]!.metrics.lasting).toBe('—');
    expect(detailStats(one, s.endedAt!, false, s.startedAt).avgDuration).toBeNull();
  });
});
