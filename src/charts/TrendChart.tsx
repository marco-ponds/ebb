import { useMemo } from 'react';
import { scaleLinear } from 'd3-scale';
import { extent } from 'd3-array';
import { Chart, type ChartTarget } from './Chart';
import { TimeAxis, formatClock, formatOffset } from './timeAxis';
import { useWidth } from './useWidth';

export interface TrendSeries {
  id: string;
  points: { t: number; v: number; refId?: string }[];
  line?: { t: number; v: number }[] | null;
  style: 'solid' | 'dashed' | 'dotted';
  tone: 'lavender' | 'peach' | 'butter' | 'sky' | 'muted';
}

export interface TrendChartProps {
  series: TrendSeries[];
  domain: [number, number];
  yUnit: string;
  yTicks?: number[];
  summary: string;
  /** Axis and tooltips read as time since the domain start ("0 h, 1 h, …") instead of clock times. */
  relative?: boolean;
  onSelect?: (refId: string) => void;
  /** Extra tooltip lines for a point that has a refId, appended after the value. */
  tooltipLines?: (refId: string) => string[];
  /** Spread onto the SVG to wire up useZoomPan. */
  svgProps?: React.SVGProps<SVGSVGElement>;
}

const TONE = {
  lavender: 'var(--lavender)',
  peach: 'var(--peach)',
  butter: 'var(--butter)',
  sky: 'var(--sky)',
  muted: 'var(--text-muted)',
} as const;
const DASH = { solid: undefined, dashed: '6 4', dotted: '1.5 4' } as const;

const HEIGHT = 150;
const PAD = { top: 10, right: 10, bottom: 34, left: 30 };

const round1 = (v: number) => String(Math.round(v * 10) / 10);

export function TrendChart({ series, domain, yUnit, yTicks, summary, relative, onSelect, tooltipLines, svgProps }: TrendChartProps) {
  const [ref, width] = useWidth();
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const x = useMemo(() => scaleLinear().domain(domain).range([PAD.left, width - PAD.right]), [domain, width]);
  const y = useMemo(() => {
    const values = series.flatMap((s) => [...s.points.map((p) => p.v), ...(s.line ?? []).map((p) => p.v)]);
    const [lo = 0, hi = 1] = extent([...values, ...(yTicks ?? [])]);
    return scaleLinear()
      .domain([Math.min(0, lo), hi === lo ? lo + 1 : hi])
      .nice()
      .range([PAD.top + plotH, PAD.top]);
  }, [series, yTicks, plotH]);
  const ticks = yTicks ?? y.ticks(3);

  const targets = useMemo<ChartTarget[]>(
    () =>
      series
        .flatMap((s) => s.points.map((p, i) => ({ s, p, key: `${s.id}:${i}` })))
        .filter(({ p }) => p.t >= domain[0] && p.t <= domain[1])
        .sort((a, b) => a.p.t - b.p.t)
        .map(({ p, key }) => ({
          id: key,
          x: x(p.t),
          describe: () => ({ title: relative ? `${formatOffset(p.t - domain[0])} in` : formatClock(p.t), lines: [`${round1(p.v)} ${yUnit}`, ...(p.refId !== undefined ? (tooltipLines?.(p.refId) ?? []) : [])] }),
          selectId: p.refId,
        })),
    [series, domain, x, yUnit, relative, tooltipLines],
  );

  return (
    <Chart wrapRef={ref} width={width} height={HEIGHT} summary={summary} targets={targets} onSelect={onSelect} svgProps={svgProps}>
      {({ activeId, activate }) => (
        <>
          {ticks.map((t) => (
            <g key={t} aria-hidden="true">
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--hairline)" strokeWidth={1} />
              <text data-ytick x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={12} fontWeight={700} fill="var(--text-faint)">
                {t}
              </text>
            </g>
          ))}
          <TimeAxis scale={x} domain={domain} y={PAD.top + plotH} width={width} relative={relative} />
          {series.map((s) =>
            s.line && s.line.length > 1 ? (
              <path
                key={`${s.id}-line`}
                data-line={s.id}
                d={s.line.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join('')}
                fill="none"
                stroke={TONE[s.tone]}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={DASH[s.style]}
              />
            ) : null,
          )}
          {series.flatMap((s) =>
            s.points.map((p, i) => {
              if (p.t < domain[0] || p.t > domain[1]) return null;
              const key = `${s.id}:${i}`;
              return (
                <circle
                  key={key}
                  data-point={key}
                  data-ref={p.refId}
                  cx={x(p.t)}
                  cy={y(p.v)}
                  r={activeId === key ? 6 : 3.5}
                  fill={TONE[s.tone]}
                  opacity={0.9}
                  onPointerEnter={() => activate(key)}
                  onClick={() => activate(key)}
                />
              );
            }),
          )}
        </>
      )}
    </Chart>
  );
}
