import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastHost, showToast } from '.';
import { useToastStore } from './Toast/toastStore';

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    act(() => useToastStore.getState().dismissToast());
    vi.useRealTimers();
  });

  it('renders in a status region, one at a time, newest replacing', () => {
    render(<ToastHost />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => showToast({ message: 'First', durationMs: 5000 }));
    act(() => showToast({ message: 'Second', durationMs: 5000 }));
    expect(screen.getByRole('status')).toHaveTextContent('Second');
    expect(screen.queryByText('First')).toBeNull();
  });

  it('disappears after durationMs', () => {
    render(<ToastHost />);
    act(() => showToast({ message: 'Undone', durationMs: 3000 }));
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.getByText('Undone')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.queryByText('Undone')).toBeNull();
  });

  it('runs the action and dismisses', () => {
    const onAction = vi.fn();
    render(<ToastHost />);
    act(() => showToast({ message: 'Deleted', actionLabel: 'Undo', onAction, durationMs: 5000 }));
    act(() => {
      screen.getByRole('button', { name: 'Undo' }).click();
    });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Deleted')).toBeNull();
  });
});
