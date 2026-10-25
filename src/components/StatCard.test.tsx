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

  it('dims to 0.55 opacity', () => {
    const { container } = render(<StatCard label="Lasting" value="—" dimmed />);
    expect(container.firstChild).toHaveStyle({ opacity: '0.55' });
  });
});
