process.env.TZ = 'Europe/London';
import { describe, expect, it } from 'vitest';
import { summaryText } from './summary';
import { MIN, SEC, c, ev, series } from './__tests__/fixtures';

const at = (h: number, m: number) => new Date(2026, 9, 24, h, m).getTime();
const NOW = at(23, 45);

describe('summaryText', () => {
  const contractions = series(12, NOW - 55 * MIN, 4.5 * MIN, 55 * SEC, 6);
  const events = [ev('w', at(23, 30), 'waters', 'clear')];

  it('matches the spec example', () => {
    expect(
      summaryText({ contractions, events, now: NOW, scope: 'last-hour', sessionStart: at(19, 0), sessionEnd: null }),
    ).toBe('Last hour: 12 contractions, every 4.5 min, lasting about 55 s, strength about 6/10. Waters broke 23:30, clear.');
  });
  it('prefixes the whole session', () => {
    const text = summaryText({ contractions, events, now: NOW, scope: 'whole', sessionStart: at(22, 50), sessionEnd: at(23, 45) });
    expect(text.startsWith('Whole session: 12 contractions,')).toBe(true);
  });
  it('looks further back for the whole session than for the last hour', () => {
    const early = [c('early', at(20, 0))];
    const input = { contractions: [...early, ...contractions], events: [], now: NOW, sessionStart: at(19, 0), sessionEnd: null };
    expect(summaryText({ ...input, scope: 'last-hour' })).toContain('12 contractions');
    expect(summaryText({ ...input, scope: 'whole' })).toContain('13 contractions');
  });
  it('omits the strength clause when nothing is rated', () => {
    const unrated = series(12, NOW - 55 * MIN, 4.5 * MIN, 55 * SEC, null);
    const text = summaryText({ contractions: unrated, events: [], now: NOW, scope: 'last-hour', sessionStart: at(19, 0), sessionEnd: null });
    expect(text).toBe('Last hour: 12 contractions, every 4.5 min, lasting about 55 s.');
  });
  it('omits the interval clause with fewer than 2 intervals', () => {
    const two = series(2, NOW - 20 * MIN, 4 * MIN, 60 * SEC, 5);
    const text = summaryText({ contractions: two, events: [], now: NOW, scope: 'last-hour', sessionStart: at(19, 0), sessionEnd: null });
    expect(text).toBe('Last hour: 2 contractions, lasting about 60 s, strength about 5/10.');
  });
  it('uses the singular and handles an empty hour', () => {
    const one = summaryText({ contractions: [c('a', NOW - 10 * MIN, null)], events: [], now: NOW, scope: 'last-hour', sessionStart: at(19, 0), sessionEnd: null });
    expect(one).toBe('Last hour: 1 contraction.');
    const none = summaryText({ contractions: [], events: [], now: NOW, scope: 'last-hour', sessionStart: at(19, 0), sessionEnd: null });
    expect(none).toBe('Last hour: 0 contractions.');
  });
  it('lists every non-deleted event in time order', () => {
    const many = [
      ev('b', at(23, 36), 'called-midwife'),
      ev('x', at(23, 0), 'note', null, 'gone', { deletedAt: 1 }),
      ev('a', at(18, 0), 'note', null, 'had a bath'),
      ev('w', at(23, 30), 'waters', 'clear'),
    ];
    const text = summaryText({ contractions: [], events: many, now: NOW, scope: 'last-hour', sessionStart: at(17, 0), sessionEnd: null });
    expect(text).toBe('Last hour: 0 contractions. Note 18:00: had a bath. Waters broke 23:30, clear. Called midwife 23:36.');
  });
  it('rounds the strength average to a whole number', () => {
    const cs = [c('a', NOW - 30 * MIN, 60 * SEC, { intensity: 5 }), c('b', NOW - 20 * MIN, 60 * SEC, { intensity: 6 }), c('c', NOW - 10 * MIN, 60 * SEC, { intensity: 6 })];
    const text = summaryText({ contractions: cs, events: [], now: NOW, scope: 'last-hour', sessionStart: at(19, 0), sessionEnd: null });
    expect(text).toContain('strength about 6/10');
  });
});
