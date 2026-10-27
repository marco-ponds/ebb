import { afterEach, describe, expect, it } from 'vitest';
import { breatheKeyframes, ensureBreatheKeyframes } from './breathe';

describe('breatheKeyframes', () => {
  it.each([
    [4, 4, '50%'],
    [6, 3, '66.667%'],
    [3, 8, '27.273%'],
  ])('puts the %i s in / %i s out peak at %s', (inS, outS, peak) => {
    const { name, css } = breatheKeyframes(inS, outS);
    expect(name).toBe(`breathe-${inS}-${outS}`);
    expect(css).toBe(
      `@keyframes ${name} { 0%, 100% { transform: scale(0.7); opacity: 0.4; } ${peak} { transform: scale(1); opacity: 0.9; } }`,
    );
  });
});

describe('ensureBreatheKeyframes', () => {
  afterEach(() => document.head.querySelectorAll('style[data-ebb-breathe]').forEach((e) => e.remove()));

  it('returns the name and adds one rule per name to a single style element', () => {
    expect(ensureBreatheKeyframes(6, 3)).toBe('breathe-6-3');
    expect(ensureBreatheKeyframes(6, 3)).toBe('breathe-6-3');
    const styles = document.head.querySelectorAll('style[data-ebb-breathe]');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent?.match(/@keyframes breathe-6-3/g)).toHaveLength(1);
    ensureBreatheKeyframes(4, 4);
    expect(document.head.querySelectorAll('style[data-ebb-breathe]')).toHaveLength(1);
    expect(styles[0].textContent).toContain('@keyframes breathe-4-4');
  });
});
