import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HoldToConfirm } from '.';

function stubMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: () => {}, removeEventListener: () => {} }));
}

describe('HoldToConfirm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubMotion(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const btn = () => screen.getByRole('button');

  it('confirms after holding the full duration', () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Hold to end session" onConfirm={onConfirm} />);
    fireEvent.pointerDown(btn());
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels when released early', () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Hold" onConfirm={onConfirm} />);
    fireEvent.pointerDown(btn());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.pointerUp(btn());
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels when the pointer leaves or is cancelled', () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Hold" onConfirm={onConfirm} />);
    fireEvent.pointerDown(btn());
    fireEvent.pointerCancel(btn());
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('respects a custom durationMs', () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Hold" durationMs={500} onConfirm={onConfirm} />);
    fireEvent.pointerDown(btn());
    act(() => {
      vi.advanceTimersByTime(501);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('a click with detail 0 (assistive tech) confirms immediately', () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Hold" onConfirm={onConfirm} />);
    fireEvent.click(btn(), { detail: 0 });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('a click with detail 1 (end of a pointer press) does not confirm', () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Hold" onConfirm={onConfirm} />);
    fireEvent.click(btn(), { detail: 1 });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it.each([' ', 'Enter'])('holding %j for the duration confirms; releasing early does not', (key) => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Hold" onConfirm={onConfirm} />);
    fireEvent.keyDown(btn(), { key });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.keyUp(btn(), { key });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.keyDown(btn(), { key });
    act(() => {
      vi.advanceTimersByTime(1501);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('ignores key auto-repeat so holding does not restart the timer', () => {
    const onConfirm = vi.fn();
    render(<HoldToConfirm label="Hold" onConfirm={onConfirm} />);
    fireEvent.keyDown(btn(), { key: ' ' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.keyDown(btn(), { key: ' ', repeat: true });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows a fill ring while holding when motion is allowed', () => {
    render(<HoldToConfirm label="Hold" onConfirm={() => {}} />);
    expect(btn().querySelector('[data-fill]')).not.toBeNull();
    expect(btn()).toHaveAttribute('data-holding', 'false');
    fireEvent.pointerDown(btn());
    expect(btn()).toHaveAttribute('data-holding', 'true');
    expect(btn()).toHaveTextContent('Hold');
  });

  it('draws the ring with plain numeric geometry (no calc())', () => {
    render(<HoldToConfirm label="Hold" onConfirm={() => {}} />);
    const rect = btn().querySelector('[data-fill] rect')!;
    for (const attr of ['x', 'y', 'width', 'height']) {
      expect(rect.getAttribute(attr)).not.toMatch(/calc|%/);
      expect(Number.isFinite(Number(rect.getAttribute(attr)))).toBe(true);
    }
  });

  it('under reduced motion: no fill, text counts down 1.5 > 1.0 > 0.5 s', () => {
    stubMotion(true);
    render(<HoldToConfirm label="Hold to end" onConfirm={() => {}} />);
    expect(btn().querySelector('[data-fill]')).toBeNull();
    expect(btn()).toHaveTextContent('Hold to end');
    fireEvent.pointerDown(btn());
    expect(btn()).toHaveTextContent('Keep holding · 1.5 s');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(btn()).toHaveTextContent('Keep holding · 1.0 s');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(btn()).toHaveTextContent('Keep holding · 0.5 s');
    fireEvent.pointerUp(btn());
    expect(btn()).toHaveTextContent('Hold to end');
  });
});
