import { describe, expect, it } from 'vitest';
import { sourceFiles } from './files';

const BANNED = [
  'active labour',
  'early labour',
  'Braxton Hicks',
  'false labour',
  'progressing well',
  'go to hospital',
  'call now',
  'labour has stopped',
];

describe('copy rules: no medical labels or urgent calls to action', () => {
  const files = sourceFiles(['.ts', '.tsx', '.css', '.html', '.json']);

  it.each(BANNED)('never contains "%s"', (phrase) => {
    const needle = phrase.toLowerCase();
    const offenders = files.filter((f) => f.text.toLowerCase().includes(needle)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
