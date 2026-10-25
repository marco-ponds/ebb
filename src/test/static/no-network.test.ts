import { describe, expect, it } from 'vitest';
import { sourceFiles } from './files';

const FORBIDDEN: Array<[string, RegExp]> = [
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['sendBeacon', /sendBeacon/],
  ['new WebSocket', /new\s+WebSocket/],
  ['new EventSource', /new\s+EventSource/],
  ['http(s):// URL literal', /https?:\/\//],
];

describe('no network access in app code', () => {
  const files = sourceFiles(['.ts', '.tsx']);

  it('scans some files', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(FORBIDDEN)('contains no %s', (_label, re) => {
    const offenders = files.filter((f) => re.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
