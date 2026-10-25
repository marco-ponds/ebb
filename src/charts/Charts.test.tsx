import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChartTooltip, FrequencyBars, Sparkline, TrendChart } from '.';

const MIN = 60_000;
const t0 = new Date(2026, 9, 25, 21, 0, 0).getTime();

describe('Sparkline', () => {
  it('is an image with bars coloured by tone token', () => {
    const items = [
      { startAt: t0 + 5 * MIN, endAt: t0 + 6 * MIN },
      { startAt: t0 + 15 * MIN, endAt: t0 + 16 * MIN },
    ];
    const { container } = render(<Sparkline items={items} domain={[t0, t0 + 60 * MIN]} tone="sky" summary="2 in the last hour" />);
    expect(screen.getByRole('img', { name: '2 in the last hour' })).toBeInTheDocument();
    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(2);
    expect(rects[0].getAttribute('fill')).toBe('var(--sky)');
  });
});

describe('FrequencyBars', () => {
  it('draws one sky bar per bucket with a count label', () => {
    const buckets = [
      { start: t0, count: 2 },
      { start: t0 + 10 * MIN, count: 0 },
      { start: t0 + 20 * MIN, count: 3 },
    ];
    const { container } = render(<FrequencyBars buckets={buckets} domain={[t0, t0 + 30 * MIN]} summary="Per 10 minutes" />);
    expect(screen.getByRole('img', { name: 'Per 10 minutes' })).toBeInTheDocument();
    const bars = container.querySelectorAll('rect[data-bucket]');
    expect(bars).toHaveLength(3);
    expect(bars[0].getAttribute('fill')).toBe('var(--sky)');
    expect(Array.from(container.querySelectorAll('text[data-count]')).map((t) => t.textContent)).toEqual(['2', '0', '3']);
    expect(Number(bars[2].getAttribute('height'))).toBeGreaterThan(Number(bars[0].getAttribute('height')));
  });
});

describe('TrendChart', () => {
  const series = [
    {
      id: 'apart',
      style: 'solid' as const,
      tone: 'lavender' as const,
      points: [
        { t: t0 + 5 * MIN, v: 8, refId: 'c1' },
        { t: t0 + 15 * MIN, v: 6, refId: 'c2' },
      ],
      line: [
        { t: t0 + 5 * MIN, v: 8 },
        { t: t0 + 15 * MIN, v: 7 },
      ],
    },
    {
      id: 'other',
      style: 'dashed' as const,
      tone: 'sky' as const,
      points: [{ t: t0 + 10 * MIN, v: 5 }],
      line: null,
    },
  ];
  const props = { series, domain: [t0, t0 + 30 * MIN] as [number, number], yUnit: 'min', yTicks: [0, 5, 10], summary: 'Time apart is shrinking' };

  it('draws a dot per point and a line only where one is given', () => {
    const { container } = render(<TrendChart {...props} />);
    expect(screen.getByRole('img', { name: 'Time apart is shrinking' })).toBeInTheDocument();
    expect(container.querySelectorAll('circle[data-point]')).toHaveLength(3);
    const lines = container.querySelectorAll('path[data-line]');
    expect(lines).toHaveLength(1);
    expect(lines[0].getAttribute('stroke')).toBe('var(--lavender)');
    expect(lines[0].getAttribute('stroke-dasharray')).toBeNull();
  });

  it('encodes line style: dashed and dotted carry a dash pattern', () => {
    const styled = [
      { ...series[0], id: 'd', style: 'dashed' as const },
      { ...series[0], id: 'p', style: 'dotted' as const },
    ];
    const { container } = render(<TrendChart {...props} series={styled} />);
    const [d, p] = Array.from(container.querySelectorAll('path[data-line]')).map((l) => l.getAttribute('stroke-dasharray'));
    expect(d).toBeTruthy();
    expect(p).toBeTruthy();
    expect(d).not.toBe(p);
  });

  it('labels y ticks', () => {
    const { container } = render(<TrendChart {...props} />);
    expect(Array.from(container.querySelectorAll('text[data-ytick]')).map((t) => t.textContent)).toEqual(['0', '5', '10']);
  });

  it('shows a tooltip on a point and selects its refId through Edit', () => {
    const onSelect = vi.fn();
    const { container } = render(<TrendChart {...props} onSelect={onSelect} />);
    fireEvent.pointerEnter(container.querySelector('circle[data-ref="c2"]')!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('6 min');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onSelect).toHaveBeenCalledWith('c2');
  });

  it('is keyboard operable through arrow keys', () => {
    const onSelect = vi.fn();
    render(<TrendChart {...props} onSelect={onSelect} />);
    const region = screen.getByRole('group');
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(screen.getByRole('tooltip')).toHaveTextContent('21:05');
    fireEvent.keyDown(region, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('c1');
  });
});

describe('ChartTooltip', () => {
  it('shows title and lines, with an Edit link only when onEdit is given', () => {
    const onEdit = vi.fn();
    const { rerender } = render(<ChartTooltip title="21:05" lines={['58 s', 'Strength 6']} onEdit={onEdit} />);
    expect(screen.getByRole('tooltip')).toHaveTextContent('21:05');
    expect(screen.getByText('Strength 6')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    rerender(<ChartTooltip title="21:05" lines={[]} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});
