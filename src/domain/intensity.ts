export const WORD_SCALE = [
  { word: 'Mild', value: 2 },
  { word: 'Medium', value: 4 },
  { word: 'Strong', value: 6 },
  { word: 'Very strong', value: 8 },
  { word: 'Intense', value: 10 },
] as const;

/** Nearest word for a 1–10 value; a tie goes to the stronger word. */
export function toWord(value: number): string {
  let best: (typeof WORD_SCALE)[number] = WORD_SCALE[0];
  for (const entry of WORD_SCALE) {
    if (Math.abs(entry.value - value) <= Math.abs(best.value - value)) best = entry;
  }
  return best.word;
}
