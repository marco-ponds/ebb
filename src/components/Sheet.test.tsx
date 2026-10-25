import { render, screen } from '@testing-library/react';
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
});
