import { describe, expect, it } from 'vitest';
import { WORD_SCALE, toWord } from './intensity';

describe('intensity words', () => {
  it('has the five-word scale', () => {
    expect(WORD_SCALE).toEqual([
      { word: 'Mild', value: 2 },
      { word: 'Medium', value: 4 },
      { word: 'Strong', value: 6 },
      { word: 'Very strong', value: 8 },
      { word: 'Intense', value: 10 },
    ]);
  });
  it.each([
    [1, 'Mild'], [2, 'Mild'], [3, 'Medium'], [4, 'Medium'], [5, 'Strong'],
    [6, 'Strong'], [7, 'Very strong'], [8, 'Very strong'], [9, 'Intense'], [10, 'Intense'],
  ])('maps %s to %s, ties going up', (value, word) => {
    expect(toWord(value)).toBe(word);
  });
});
