import { useLayoutEffect, useMemo, useRef } from 'react';
import { scaleLinear } from 'd3-scale';
import { Chart, type ChartTarget } from './Chart';
import { TimeAxis, formatClock, formatLength, formatOffset } from './timeAxis';
import { useWidth } from './useWidth';
import { useZoomPan } from './useZoomPan';
import styles from './Chart.module.css';

export interface TimelineItem {
  id: string;
  startAt: number;
  endAt: number;
  intensity: number | null;
  flag?: 'very-short' | 'time-changed';
}
export interface TimelineMarker {
  id: string;
  at: number;
  letter: string;
  label: string;
  kind: 'event' | 'threshold';
}
export interface TimelineProps {
  items: TimelineItem[];
  markers: TimelineMarker[];
  gaps: { from: number; to: number }[];
  domain: [number, number];
  now?: number;
  variant: 'mini' | 'full' | 'compare';
  series?: 'primary' | 'secondary' | 'tertiary';
  summary: string;
  /** Label times as offsets from the domain start ("6m in") instead of clock times. Default: true for compare. */
  relative?: boolean;
  /** Draw the hour axis under the bars (compare only). Default true; stack several and show it on the last. */
  showAxis?: boolean;
  onSelect?: (id: string) => void;
  /** With onDomainChange, pinch / drag / double-tap adjust the visible range. */
  fullDomain?: [number, number];
  onDomainChange?: (domain: [number, number]) => void;
}

const LAYOUT = {
  mini: { markers: 16, bars: 40, axis: 0 },
  full: { markers: 28, bars: 88, axis: 40 },
  compare: { markers: 0, bars: 40, axis: 22 },
} as const;
const PAD_X = 8;
const MIN_BAR_PX = 5;
const SERIES_STYLE = {
  primary: { fill: 'var(--lavender)', stroke: 'var(--lavender)', dash: undefined },
  secondary: { fill: 'none', stroke: 'var(--sky)', dash: '5 3' },
  tertiary: { fill: 'none', stroke: 'var(--text-muted)', dash: '1.5 3.5' },
} as const;
const FLAG_TEXT = { 'very-short': 'very short', 'time-changed': 'time changed' } as const;

/** Bar height fraction for intensity 1-10; unrated sits at the middle (5.5). */
export const barFraction = (intensity: number | null) => 0.2 + 0.8 * (((intensity ?? 5.5) - 1) / 9);

export function Timeline({
  items,
  markers,
  gaps,
  domain,
  now,
  variant,
  series = 'primary',
  summary,
  relative: relativeProp,
  showAxis = true,
  onSelect,
  fullDomain,
  onDomainChange,
}: TimelineProps) {
  const [ref, width] = useWidth();
  const gRef = useRef<SVGGElement>(null);
  const relative = relativeProp ?? variant === 'compare';
  const layout = { ...LAYOUT[variant], axis: showAxis ? LAYOUT[variant].axis : 0 };
  const height = layout.markers + layout.bars + layout.axis + 4;
  const baseY = layout.markers + layout.bars;
  const style = SERIES_STYLE[series];

  const x = useMemo(() => scaleLinear().domain(domain).range([PAD_X, width - PAD_X]), [domain, width]);

  const zoom = useZoomPan({
    fullDomain: fullDomain ?? domain,
    domain,
    onChange: (d) => {
      gRef.current?.removeAttribute('transform'); // the committed domain re-lays out the bars
      onDomainChange?.(d);
    },
    // During the gesture only the data layer's transform changes; React commits the domain at the end.
    onPreview: (d) => {
      const g = gRef.current;
      if (!g) return;
      const k = (domain[1] - domain[0]) / (d[1] - d[0]);
      const shift = PAD_X - k * x(d[0]); // maps the old pixel of d[0] onto the left edge
      g.setAttribute('transform', `translate(${shift} 0) scale(${k} 1)`);
    },
  });

  useLayoutEffect(() => {
    gRef.current?.removeAttribute('transform');
  }, [domain]);

  const visibleItems = useMemo(() => items.filter((i) => i.endAt >= domain[0] && i.startAt <= domain[1]), [items, domain]);

  const bars = useMemo(
    () =>
      visibleItems.map((it) => {
        const w = Math.max(MIN_BAR_PX, x(it.endAt) - x(it.startAt));
        const h = layout.bars * barFraction(it.intensity);
        const hollow = it.intensity === null;
        const fill = hollow ? 'none' : style.fill;
        const stroke = hollow || style.fill === 'none' ? style.stroke : undefined;
        return (
          <rect
            key={it.id}
            data-bar-id={it.id}
            data-hollow={hollow ? 'true' : 'false'}
            data-flag={it.flag}
            x={x(it.startAt)}
            y={baseY - h}
            width={w}
            height={h}
            rx={Math.min(3, w / 2)}
            fill={fill}
            stroke={stroke}
            strokeWidth={stroke ? 2 : undefined}
            strokeDasharray={stroke ? style.dash : undefined}
            strokeLinecap="round"
          />
        );
      }),
    [visibleItems, x, layout.bars, baseY, style],
  );

  const targets = useMemo<ChartTarget[]>(() => {
    const itemTargets = visibleItems.map((it) => ({
      t: it.startAt,
      target: {
        id: it.id,
        x: x(it.startAt) + Math.max(MIN_BAR_PX, x(it.endAt) - x(it.startAt)) / 2,
        describe: () => ({
          title: relative
            ? `${formatOffset(it.startAt - domain[0])} in`
            : `${formatClock(it.startAt)}–${formatClock(it.endAt)}`,
          lines: [
            `Lasting ${formatLength(it.endAt - it.startAt)}`,
            it.intensity === null ? 'Strength not rated' : `Strength ${it.intensity}/10`,
            ...(it.flag ? [FLAG_TEXT[it.flag]] : []),
          ],
        }),
        selectId: it.id,
      } satisfies ChartTarget,
    }));
    const markerTargets = markers
      .filter((m) => m.at >= domain[0] && m.at <= domain[1])
      .map((m) => ({
        t: m.at,
        target: {
          id: `marker:${m.id}`,
          x: x(m.at),
          describe: () => ({ title: relative ? `${formatOffset(m.at - domain[0])} in` : formatClock(m.at), lines: [m.label] }),
        } satisfies ChartTarget,
      }));
    return [...itemTargets, ...markerTargets].sort((a, b) => a.t - b.t).map((e) => e.target);
  }, [visibleItems, markers, domain, x, relative]);

  const markerR = variant === 'full' ? 10 : 5;
  const legend =
    variant === 'full' && markers.length > 0 ? (
      <ul className={styles.legend}>
        {markers.map((m) => (
          <li key={m.id}>
            <span>{`${m.letter} · ${m.label}`}</span>
          </li>
        ))}
      </ul>
    ) : undefined;

  return (
    <Chart
      wrapRef={ref}
      width={width}
      height={height}
      summary={summary}
      targets={targets}
      onSelect={onSelect}
      svgProps={onDomainChange ? { ...zoom.bind } : undefined}
      legend={legend}
    >
      {({ activate }) => (
        <>
          <g ref={gRef}>
            {gaps.map((g, i) => (
              <rect
                key={i}
                data-gap
                x={x(Math.max(g.from, domain[0]))}
                y={layout.markers + 4}
                width={Math.max(0, x(Math.min(g.to, domain[1])) - x(Math.max(g.from, domain[0])))}
                height={layout.bars - 4}
                rx={6}
                fill="none"
                stroke="var(--text-faint)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            ))}
            <g
              data-bars
              className={styles.hit}
              onPointerOver={(e) => {
                const id = (e.target as Element).closest('[data-bar-id]')?.getAttribute('data-bar-id');
                if (id) activate(id);
              }}
              onClick={(e) => {
                const id = (e.target as Element).closest('[data-bar-id]')?.getAttribute('data-bar-id');
                if (id) activate(id);
              }}
            >
              {bars}
            </g>
            {markers
              .filter((m) => m.at >= domain[0] && m.at <= domain[1])
              .map((m) => (
                <g key={m.id} data-marker={m.id} onPointerEnter={() => activate(`marker:${m.id}`)} onClick={() => activate(`marker:${m.id}`)}>
                  <circle
                    cx={x(m.at)}
                    cy={layout.markers / 2}
                    r={markerR}
                    fill={variant === 'full' ? (m.kind === 'threshold' ? 'var(--butter)' : 'var(--mint)') : 'none'}
                    stroke={m.kind === 'threshold' ? 'var(--butter)' : 'var(--mint)'}
                    strokeWidth={2}
                  />
                  {variant === 'full' ? (
                    <text
                      x={x(m.at)}
                      y={layout.markers / 2 + 4}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={900}
                      fill="var(--ink)"
                    >
                      {m.letter}
                    </text>
                  ) : null}
                </g>
              ))}
            {now !== undefined && now >= domain[0] && now <= domain[1] ? (
              <line
                data-now
                x1={x(now)}
                x2={x(now)}
                y1={0}
                y2={baseY}
                stroke="var(--text-muted)"
                strokeWidth={1.5}
                strokeDasharray="1.5 4"
                strokeLinecap="round"
              />
            ) : null}
          </g>
          {layout.axis > 0 ? (
            <TimeAxis scale={x} domain={domain} y={baseY + 2} width={width} relative={relative} />
          ) : null}
        </>
      )}
    </Chart>
  );
}
