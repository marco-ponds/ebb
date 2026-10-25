import { afterEach, describe, expect, it, vi } from 'vitest';
import { hapticStart, hapticStop } from './haptics';

function stubVibrate() {
  const spy = vi.fn(() => true);
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: spy });
  return spy;
}

describe('haptics', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
  });

  it('buzzes 15 ms on start', () => {
    const spy = stubVibrate();
    hapticStart(true);
    expect(spy).toHaveBeenCalledExactlyOnceWith(15);
  });

  it('buzzes [10, 60, 10] on stop', () => {
    const spy = stubVibrate();
    hapticStop(true);
    expect(spy).toHaveBeenCalledExactlyOnceWith([10, 60, 10]);
  });

  it('stays silent when haptics are off', () => {
    const spy = stubVibrate();
    hapticStart(false);
    hapticStop(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does nothing, and does not throw, when vibrate is missing', () => {
    expect(() => {
      hapticStart(true);
      hapticStop(true);
    }).not.toThrow();
  });
});
