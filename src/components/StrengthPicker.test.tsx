import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrengthPicker } from '.';

function setup(scale: 'words' | 'numeric' | 'both', extra: Partial<React.ComponentProps<typeof StrengthPicker>> = {}) {
  const onChoose = vi.fn();
  const onSkip = vi.fn();
  const onAutoClose = vi.fn();
  render(
    <StrengthPicker scale={scale} durationLabel="1m 02s" onChoose={onChoose} onSkip={onSkip} onAutoClose={onAutoClose} {...extra} />,
  );
  return { onChoose, onSkip, onAutoClose };
}

describe('StrengthPicker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows header, duration, caption and Skip', () => {
    setup('words');
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByText('How strong was that one?')).toBeInTheDocument();
    expect(screen.getByText('1m 02s')).toBeInTheDocument();
    expect(screen.getByText('Closes by itself — you can rate it later')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
  });

  it('words scale: five options mapping to 2/4/6/8/10', () => {
    const { onChoose } = setup('words');
    const expected: Array<[string, number]> = [
      ['Mild', 2],
      ['Medium', 4],
      ['Strong', 6],
      ['Very strong', 8],
      ['Intense', 10],
    ];
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    for (const [name, v] of expected) {
      fireEvent.click(screen.getByRole('radio', { name }));
      expect(onChoose).toHaveBeenLastCalledWith(v);
    }
  });

  it('numeric scale: 1 to 10', () => {
    const { onChoose } = setup('numeric');
    expect(screen.getAllByRole('radio')).toHaveLength(10);
    fireEvent.click(screen.getByRole('radio', { name: '7' }));
    expect(onChoose).toHaveBeenCalledWith(7);
    expect(screen.queryByRole('radio', { name: 'Mild' })).toBeNull();
  });

  it('both scale: words and numbers together', () => {
    const { onChoose } = setup('both');
    expect(screen.getAllByRole('radio')).toHaveLength(15);
    fireEvent.click(screen.getByRole('radio', { name: 'Strong' }));
    expect(onChoose).toHaveBeenLastCalledWith(6);
    fireEvent.click(screen.getByRole('radio', { name: '3' }));
    expect(onChoose).toHaveBeenLastCalledWith(3);
  });

  it('Skip calls onSkip', () => {
    const { onSkip } = setup('words');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('auto-closes after 30 s, not before', () => {
    const { onAutoClose } = setup('words');
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(onAutoClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(onAutoClose).toHaveBeenCalledTimes(1);
  });

  it('honours a custom autoCloseMs', () => {
    const { onAutoClose } = setup('words', { autoCloseMs: 2000 });
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(onAutoClose).toHaveBeenCalledTimes(1);
  });

  it('pauses while focus is inside and resumes on blur', () => {
    const { onAutoClose } = setup('words');
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    act(() => screen.getByRole('radio', { name: 'Mild' }).focus());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onAutoClose).not.toHaveBeenCalled();
    act(() => screen.getByRole('radio', { name: 'Mild' }).blur());
    act(() => {
      vi.advanceTimersByTime(19_000);
    });
    expect(onAutoClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(onAutoClose).toHaveBeenCalledTimes(1);
  });

  it('shows remaining time as a progress bar', () => {
    setup('words');
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBe(50);
  });

  it('supports arrow-key focus movement between options', () => {
    setup('words');
    screen.getByRole('radio', { name: 'Mild' }).focus();
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Mild' }), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Medium' })).toHaveFocus();
  });
});
