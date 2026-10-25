import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from '.';

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Sheet
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        title="Add event"
      >
        <button>First</button>
        <button>Last</button>
      </Sheet>
    </>
  );
}

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(<Sheet open={false} onClose={() => {}} title="T">x</Sheet>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a modal dialog labelled by its title', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText('Open'));
    const dialog = screen.getByRole('dialog', { name: 'Add event' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('moves focus in, traps Tab, and restores focus on close', async () => {
    render(<Harness />);
    const opener = screen.getByText('Open');
    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('closes on scrim click but not on content click', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByText('Open'));
    await userEvent.click(screen.getByText('First'));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fades instead of sliding under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
    render(<Sheet open onClose={() => {}} title="T">x</Sheet>);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-motion', 'fade');
    vi.unstubAllGlobals();
  });

  it('puts initial focus on the first content control, not Close', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByText('Open'));
    expect(screen.getByText('First')).toHaveFocus();
  });

  it('still closes on Esc and traps Tab after the focused element unmounts', async () => {
    function Swap() {
      const [step, setStep] = useState(0);
      const [open, setOpen] = useState(true);
      return (
        <Sheet open={open} onClose={() => setOpen(false)} title="Event">
          {step === 0 ? <button key="save" onClick={() => setStep(1)}>Save</button> : <button key="done">Done</button>}
        </Sheet>
      );
    }
    render(<Swap />);
    await userEvent.click(screen.getByText('Save')); // the focused button unmounts
    expect(document.body).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    act(() => (document.activeElement as HTMLElement).blur());
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
