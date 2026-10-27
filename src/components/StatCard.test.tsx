import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatCard } from '.';

describe('StatCard', () => {
  it('shows label, value and caption; the value never wraps', () => {
    render(<StatCard label="Time apart" value="4m 40s" caption="avg, last hour" />);
    expect(screen.getByText('Time apart')).toBeInTheDocument();
    expect(screen.getByText('avg, last hour')).toBeInTheDocument();
    expect(screen.getByText('4m 40s')).toHaveStyle({ whiteSpace: 'nowrap' });
  });

  it('marks itself dimmed without putting 0.55 opacity on the card (the CSS dims its children)', () => {
    const { container } = render(<StatCard label="Lasting" value="—" dimmed />);
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute('data-dimmed', 'true');
    expect(card.style.opacity).toBe('');
  });
});
