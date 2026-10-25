import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Timeline, TrendChart } from '.';

const MIN = 60_000;
const HOUR = 60 * MIN;
const common = { markers: [], gaps: [], summary: 'Test', variant: 'compare' as const };
const items = [{ id: 'a', startAt: 6 * MIN, endAt: 7 * MIN, intensity: 5 }];

describe('compare timeline relative labels', () => {
  it('words a tooltip as time into the session, never a clock time', () => {
    const { container } = render(<Timeline {...common} items={items} domain={[0, 2 * HOUR]} />);
    fireEvent.pointerEnter(container.querySelector('rect[data-bar-id]')!);
    const text = screen.getByRole('tooltip').textContent ?? '';
    expect(text).toContain('6m in');
    expect(text).not.toMatch(/\d\d:\d\d/);
  });

  it('can omit its axis so a stack shares one', () => {
    const { container } = render(<Timeline {...common} items={items} domain={[0, 2 * HOUR]} showAxis={false} />);
    expect(container.querySelectorAll('[data-axis]')).toHaveLength(0);
    const withAxis = render(<Timeline {...common} items={items} domain={[0, 2 * HOUR]} />);
    expect(Array.from(withAxis.container.querySelectorAll('[data-axis]')).map((n) => n.textContent)).toEqual(['0 h', '1 h', '2 h']);
  });

  it('keeps clock tooltips for the full variant', () => {
    const base = new Date(2026, 9, 25, 21, 0).getTime();
    const { container } = render(
      <Timeline {...common} variant="full" items={[{ id: 'a', startAt: base + 5 * MIN, endAt: base + 6 * MIN, intensity: 5 }]} domain={[base, base + HOUR]} />,
    );
    fireEvent.pointerEnter(container.querySelector('rect[data-bar-id]')!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('21:05');
  });
});

describe('TrendChart relative mode', () => {
  const props = {
    series: [{ id: 'a', style: 'solid' as const, tone: 'lavender' as const, points: [{ t: 65 * MIN, v: 6 }], line: null }],
    domain: [0, 2 * HOUR] as [number, number],
    yUnit: 'min',
    summary: 'Test',
  };

  it('labels the x axis in hours from the start', () => {
    const { container } = render(<TrendChart {...props} relative />);
    expect(Array.from(container.querySelectorAll('[data-axis]')).map((n) => n.textContent)).toEqual(['0 h', '1 h', '2 h']);
  });

  it('words a tooltip as time into the session', () => {
    const { container } = render(<TrendChart {...props} relative />);
    fireEvent.pointerEnter(container.querySelector('[data-point]')!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('1 h 05 m in');
  });
});
