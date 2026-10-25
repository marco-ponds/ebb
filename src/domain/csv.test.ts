process.env.TZ = 'Europe/London';
import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';
import { SEC, c, ev } from './__tests__/fixtures';

const at = (h: number, m: number, s = 0) => new Date(2026, 9, 25, h, m, s).getTime();
const HEADER = 'type,start,end,duration_s,interval_s,intensity,note';

describe('toCsv', () => {
  it('writes just the header when empty', () => {
    expect(toCsv([], [])).toBe(HEADER);
  });
  it('writes contractions and events chronologically', () => {
    const cs = [
      c('b', at(23, 36, 5), 70 * SEC, { intensity: 6, note: 'strong one' }),
      c('a', at(23, 31, 5), 60 * SEC),
    ];
    const events = [ev('e', at(23, 33), 'waters', 'clear')];
    expect(toCsv(cs, events).split('\r\n')).toEqual([
      HEADER,
      'contraction,2026-10-25T23:31:05+00:00,2026-10-25T23:32:05+00:00,60,,,',
      'waters,2026-10-25T23:33:00+00:00,,,,,clear',
      'contraction,2026-10-25T23:36:05+00:00,2026-10-25T23:37:15+00:00,70,300,6,strong one',
    ]);
  });
  it('joins details and note with "; "', () => {
    const rows = toCsv([], [ev('e', at(23, 33), 'waters', 'pink', 'a little')]).split('\r\n');
    expect(rows[1]).toBe('waters,2026-10-25T23:33:00+00:00,,,,,pink; a little');
    expect(toCsv([], [ev('n', at(23, 33), 'note', null, 'had a bath')]).split('\r\n')[1]).toBe(
      'note,2026-10-25T23:33:00+00:00,,,,,had a bath',
    );
  });
  it('leaves end and duration empty for a contraction in progress', () => {
    expect(toCsv([c('a', at(23, 31), null)], []).split('\r\n')[1]).toBe('contraction,2026-10-25T23:31:00+00:00,,,,,');
  });
  it('excludes deleted rows and bases intervals on the remaining contractions', () => {
    const cs = [c('a', at(23, 0)), c('gone', at(23, 2), 60 * SEC, { deletedAt: 1 }), c('b', at(23, 5))];
    const events = [ev('x', at(23, 3), 'note', null, 'hidden', { deletedAt: 1 })];
    const rows = toCsv(cs, events).split('\r\n');
    expect(rows).toHaveLength(3);
    expect(rows[2].split(',')[4]).toBe('300');
  });
  it('quotes fields per RFC 4180', () => {
    const cs = [c('a', at(23, 0), 60 * SEC, { note: 'said "ow", then\nrested' })];
    expect(toCsv(cs, []).split('\r\n').slice(1).join('\r\n')).toBe(
      'contraction,2026-10-25T23:00:00+00:00,2026-10-25T23:01:00+00:00,60,,,"said ""ow"", then\nrested"',
    );
  });
  it('puts a contraction before an event at the same instant', () => {
    const rows = toCsv([c('a', at(23, 0))], [ev('e', at(23, 0), 'bleeding')]).split('\r\n');
    expect(rows[1].startsWith('contraction')).toBe(true);
    expect(rows[2].startsWith('bleeding')).toBe(true);
  });
  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx'])('neutralises a note that starts like a formula: %j', (note) => {
    const row = toCsv([c('a', at(23, 0), 60 * SEC, { note })], []).split('\r\n')[1];
    expect(row).toContain(`'${note}`);
    expect(row.split(',').slice(-1)[0].replace(/^"/, '')).toMatch(/^'/);
  });
  it('quotes after prefixing, and leaves numbers, timestamps and ordinary notes alone', () => {
    const rows = toCsv([c('a', at(23, 0), 60 * SEC, { note: '=A,B', intensity: 7 }), c('b', at(23, 10), 60 * SEC, { note: 'a=b' })], []).split('\r\n');
    expect(rows[1]).toBe('contraction,2026-10-25T23:00:00+00:00,2026-10-25T23:01:00+00:00,60,,7,"\'=A,B"');
    expect(rows[2]).toBe('contraction,2026-10-25T23:10:00+00:00,2026-10-25T23:11:00+00:00,60,600,,a=b');
  });
});
