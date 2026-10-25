import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, Card, IconButton, Pill, SafetyLine, Skeleton } from '.';

const Icon = () => <svg data-testid="icon" aria-hidden="true" />;

describe('Button', () => {
  it('is a real button that fires onClick and exposes its variant', async () => {
    const onClick = vi.fn();
    render(<Button variant="primary" onClick={onClick}>Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b).toHaveAttribute('data-variant', 'primary');
    await userEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is reachable and activatable by keyboard', async () => {
    const onClick = vi.fn();
    render(<Button variant="destructive-text" onClick={onClick}>Delete all data</Button>);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Delete all data' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalled();
  });
});

describe('IconButton', () => {
  it('uses label as the accessible name', async () => {
    const onClick = vi.fn();
    render(<IconButton label="Back" icon={<Icon />} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});

describe('Pill, Card, SafetyLine, Skeleton', () => {
  it('renders a pill with tone, icon and text', () => {
    render(<Pill tone="mint" icon={<Icon />}>Screen stays on</Pill>);
    const pill = screen.getByText('Screen stays on').closest('[data-tone]');
    expect(pill).toHaveAttribute('data-tone', 'mint');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders card children', () => {
    render(<Card>inside</Card>);
    expect(screen.getByText('inside')).toBeInTheDocument();
  });

  it('renders the safety line verbatim', () => {
    render(<SafetyLine />);
    expect(
      screen.getByText(
        "This app records contractions. It doesn't give medical advice — if you're worried, contact your midwife or maternity unit.",
      ),
    ).toBeInTheDocument();
  });

  it('renders a skeleton with no text and no spinner', () => {
    const { container } = render(<Skeleton />);
    expect(container.textContent).toBe('');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(container.querySelector('[data-skeleton="button"]')).not.toBeNull();
  });
});
