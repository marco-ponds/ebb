import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Timeline, TrendChart } from '.';

const MIN = 60_000;
const base = new Date(2026, 9, 25, 21, 0, 0).getTime();
const items = [{ id: 'a', startAt: base + 5 * MIN, endAt: base + 6 * MIN, intensity: 5 }];

describe('tooltipLines', () => {
  it('Timeline appends the caller lines to a bar tooltip', () => {
    const { container } = render(
      <Timeline items={items} markers={[]} gaps={[]} domain={[base, base + 30 * MIN]} variant="full" summary="t" tooltipLines={(id) => [`extra ${id}`]} />,
    );
    fireEvent.click(container.querySelector('[data-bar-id="a"]')!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Lasting 1m 00sStrength 5/10extra a');
  });

  it('Timeline keeps the default tooltip without the option', () => {
    const { container } = render(<Timeline items={items} markers={[]} gaps={[]} domain={[base, base + 30 * MIN]} variant="full" summary="t" />);
    fireEvent.click(container.querySelector('[data-bar-id="a"]')!);
    expect(screen.getByRole('tooltip')).not.toHaveTextContent('extra');
  });

  it('TrendChart appends the caller lines for points with a refId', () => {
    const series = [{ id: 's', points: [{ t: base + 5 * MIN, v: 5, refId: 'a' }], style: 'solid' as const, tone: 'lavender' as const }];
    const { container } = render(
      <TrendChart series={series} domain={[base, base + 30 * MIN]} yUnit="min" summary="t" tooltipLines={(id) => [`extra ${id}`]} />,
    );
    fireEvent.click(container.querySelector('[data-point]')!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('5 minextra a');
  });
});
