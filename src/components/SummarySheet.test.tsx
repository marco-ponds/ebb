import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SummarySheet, ToastHost } from '.';
import { useToastStore } from './Toast/toastStore';

const text = 'Last hour: 12 contractions, every 4.5 min.';

describe('SummarySheet', () => {
  afterEach(() => {
    act(() => useToastStore.getState().dismissToast());
    vi.unstubAllGlobals();
  });

  it('shows the paragraph in a sheet titled Share summary', () => {
    vi.stubGlobal('navigator', {});
    render(<SummarySheet open onClose={() => {}} text={text} />);
    expect(screen.getByRole('dialog', { name: 'Share summary' })).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('copies and shows a Copied toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(
      <>
        <SummarySheet open onClose={() => {}} text={text} />
        <ToastHost />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(text);
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('hides Share… when unsupported and shares text when supported', async () => {
    vi.stubGlobal('navigator', {});
    const { unmount } = render(<SummarySheet open onClose={() => {}} text={text} />);
    expect(screen.queryByRole('button', { name: 'Share…' })).toBeNull();
    unmount();
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    render(<SummarySheet open onClose={() => {}} text={text} />);
    await userEvent.click(screen.getByRole('button', { name: 'Share…' }));
    expect(share).toHaveBeenCalledWith({ text });
  });
});
