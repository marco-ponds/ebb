import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installPointerEvent } from './pointerPolyfill';
import { Timeline } from '.';

const MIN = 60_000;
const base = new Date(2026, 9, 25, 21, 0, 0).getTime();
const common = { markers: [], gaps: [], summary: 'Test timeline', variant: 'full' as const };

function bars(container: HTMLElement) {
  return Array.from(container.querySelectorAll<SVGRectElement>('rect[data-bar-id]'));
}

describe('Timeline geometry', () => {
  it('is an image with the summary as its label', () => {
    render(<Timeline {...common} items={[]} domain={[base, base + 60 * MIN]} summary="22 contractions, closer together" />);
    expect(screen.getByRole('img', { name: '22 contractions, closer together' })).toBeInTheDocument();
  });

  it('gives every bar at least 5 px width', () => {
    const items = [
      { id: 'a', startAt: base + 10 * MIN, endAt: base + 10 * MIN + 1000, intensity: 5 },
      { id: 'b', startAt: base + 20 * MIN, endAt: base + 21 * MIN, intensity: 5 },
    ];
    const { container } = render(<Timeline {...common} items={items} domain={[base, base + 8 * 60 * MIN]} />);
    const [a, b] = bars(container);
    expect(Number(a.getAttribute('width'))).toBe(5);
    expect(Number(b.getAttribute('width'))).toBeGreaterThanOrEqual(5);
  });

  it('maps intensity to height and draws unrated bars hollow at middle height', () => {
    const items = [
      { id: 'lo', startAt: base + 5 * MIN, endAt: base + 6 * MIN, intensity: 1 },
      { id: 'hi', startAt: base + 15 * MIN, endAt: base + 16 * MIN, intensity: 10 },
      { id: 'none', startAt: base + 25 * MIN, endAt: base + 26 * MIN, intensity: null },
    ];
    const { container } = render(<Timeline {...common} items={items} domain={[base, base + 60 * MIN]} />);
    const [lo, hi, none] = bars(container).map((r) => ({
      h: Number(r.getAttribute('height')),
      hollow: r.getAttribute('data-hollow'),
      fill: r.getAttribute('fill'),
    }));
    expect(hi.h).toBeGreaterThan(lo.h);
    expect(none.h).toBeGreaterThan(lo.h);
    expect(none.h).toBeLessThan(hi.h);
    expect(none.hollow).toBe('true');
    expect(none.fill).toBe('none');
    expect(lo.hollow).toBe('false');
    expect(lo.fill).not.toBe('none');
  });

  it('draws gaps as dashed empty boxes', () => {
    const { container } = render(
      <Timeline {...common} items={[]} gaps={[{ from: base + 10 * MIN, to: base + 30 * MIN }]} domain={[base, base + 60 * MIN]} />,
    );
    const gap = container.querySelector('rect[data-gap]')!;
    expect(gap.getAttribute('fill')).toBe('none');
    expect(gap.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(Number(gap.getAttribute('width'))).toBeGreaterThan(0);
  });

  it('draws a dotted now line only when now is inside the domain', () => {
    const { container, rerender } = render(<Timeline {...common} items={[]} now={base + 30 * MIN} domain={[base, base + 60 * MIN]} />);
    const line = container.querySelector('line[data-now]')!;
    expect(line.getAttribute('stroke-dasharray')).toBeTruthy();
    rerender(<Timeline {...common} items={[]} now={base + 90 * MIN} domain={[base, base + 60 * MIN]} />);
    expect(container.querySelector('line[data-now]')).toBeNull();
  });

  it('labels HH:mm on the axis and no date inside a single day', () => {
    const { container } = render(<Timeline {...common} items={[]} domain={[base, base + 2 * 60 * MIN]} />);
    const labels = Array.from(container.querySelectorAll('text[data-axis]')).map((t) => t.textContent);
    expect(labels).toContain('21:00');
    expect(labels.some((l) => /^\d\d:\d\d$/.test(l ?? ''))).toBe(true);
    expect(container.querySelector('text[data-axis-date]')).toBeNull();
  });

  it('labels the date when the domain crosses local midnight', () => {
    const start = new Date(2026, 9, 25, 23, 0, 0).getTime();
    const { container } = render(<Timeline {...common} items={[]} domain={[start, start + 2 * 60 * MIN]} />);
    const dates = Array.from(container.querySelectorAll('text[data-axis-date]')).map((t) => t.textContent);
    expect(dates).toContain('Sun 25 Oct');
    expect(dates).toContain('Mon 26 Oct');
  });

  it('renders lettered markers with legend on full, plain rings on mini', () => {
    const markers = [{ id: 'm1', at: base + 20 * MIN, letter: 'W', label: 'waters, clear', kind: 'event' as const }];
    const { container, rerender } = render(<Timeline {...common} items={[]} markers={markers} domain={[base, base + 60 * MIN]} />);
    expect(container.querySelector('[data-marker="m1"] text')?.textContent).toBe('W');
    expect(screen.getByText('W · waters, clear')).toBeInTheDocument();
    rerender(<Timeline {...common} variant="mini" items={[]} markers={markers} domain={[base, base + 60 * MIN]} />);
    expect(container.querySelector('[data-marker="m1"] text')).toBeNull();
    expect(container.querySelector('[data-marker="m1"] circle')).not.toBeNull();
  });

  it('styles compare series by fill and line style, not colour alone', () => {
    const items = [{ id: 'a', startAt: base + 5 * MIN, endAt: base + 6 * MIN, intensity: 5 }];
    const get = (series: 'primary' | 'secondary' | 'tertiary') => {
      const { container, unmount } = render(<Timeline {...common} variant="compare" series={series} items={items} domain={[base, base + 60 * MIN]} />);
      const r = bars(container)[0];
      const out = { fill: r.getAttribute('fill'), dash: r.getAttribute('stroke-dasharray'), stroke: r.getAttribute('stroke') };
      unmount();
      return out;
    };
    expect(get('primary').fill).toBe('var(--lavender)');
    const secondary = get('secondary');
    expect(secondary.fill).toBe('none');
    expect(secondary.stroke).toBe('var(--sky)');
    expect(secondary.dash).toBeTruthy();
    const tertiary = get('tertiary');
    expect(tertiary.fill).toBe('none');
    expect(tertiary.stroke).toBe('var(--text-muted)');
    expect(tertiary.dash).toBeTruthy();
    expect(tertiary.dash).not.toBe(secondary.dash);
  });
});

describe('Timeline interaction', () => {
  const items = [
    { id: 'a', startAt: base + 5 * MIN, endAt: base + 6 * MIN, intensity: 5 },
    { id: 'b', startAt: base + 15 * MIN, endAt: base + 16 * MIN, intensity: 7, flag: 'very-short' as const },
  ];

  it('shows a tooltip on hover with an Edit link that selects the item', () => {
    const onSelect = vi.fn();
    const { container } = render(<Timeline {...common} items={items} domain={[base, base + 60 * MIN]} onSelect={onSelect} />);
    fireEvent.pointerEnter(bars(container)[0]);
    expect(screen.getByRole('tooltip')).toHaveTextContent('21:05');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('is keyboard operable: arrows move through items, Enter selects, Escape hides', () => {
    const onSelect = vi.fn();
    render(<Timeline {...common} items={items} domain={[base, base + 60 * MIN]} onSelect={onSelect} />);
    const region = screen.getByRole('group');
    region.focus();
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(screen.getByRole('tooltip')).toHaveTextContent('21:05');
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(screen.getByRole('tooltip')).toHaveTextContent('21:15');
    expect(screen.getByRole('tooltip')).toHaveTextContent('very short');
    fireEvent.keyDown(region, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('b');
    fireEvent.keyDown(region, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('Timeline performance', () => {
  it('renders 320 items in under 50 ms', () => {
    const items = Array.from({ length: 320 }, (_, i) => ({
      id: `c${i}`,
      startAt: base + i * 4 * MIN,
      endAt: base + i * 4 * MIN + 55_000,
      intensity: (i % 10) + 1,
    }));
    const domain: [number, number] = [base, base + 320 * 4 * MIN];
    // Best of three: a parallel test run adds scheduling noise that has nothing to do with the render.
    const timings: number[] = [];
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      const { container, unmount } = render(<Timeline {...common} items={items} domain={domain} />);
      timings.push(performance.now() - t0);
      expect(bars(container)).toHaveLength(320);
      unmount();
    }
    expect(Math.min(...timings)).toBeLessThan(50);
  });
});

describe('Timeline panning', () => {
  beforeAll(installPointerEvent);

  it('moves a <g> transform during the drag and commits the domain once on release', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 320, height: 100, right: 320, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
    });
    const full: [number, number] = [base, base + 240 * MIN];
    const onDomainChange = vi.fn();
    const { container, rerender } = render(
      <Timeline {...common} items={[]} fullDomain={full} domain={[base + 60 * MIN, base + 120 * MIN]} onDomainChange={onDomainChange} />,
    );
    const svg = container.querySelector('svg')!;
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 140 });
    return new Promise<void>((resolve) =>
      requestAnimationFrame(() => {
        expect(container.querySelector('svg > g')!.getAttribute('transform')).toMatch(/^translate\(/);
        expect(onDomainChange).not.toHaveBeenCalled();
        fireEvent.pointerUp(svg, { pointerId: 1, clientX: 140 });
        expect(onDomainChange).toHaveBeenCalledTimes(1);
        expect(container.querySelector('svg > g')!.getAttribute('transform')).toBeNull();
        const committed = onDomainChange.mock.calls[0][0] as [number, number];
        rerender(<Timeline {...common} items={[]} fullDomain={full} domain={committed} onDomainChange={onDomainChange} />);
        expect(container.querySelector('svg > g')!.getAttribute('transform')).toBeNull();
        vi.restoreAllMocks();
        resolve();
      }),
    );
  });
});
