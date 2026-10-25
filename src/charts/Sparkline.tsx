import { scaleLinear } from 'd3-scale';
import { useWidth } from './useWidth';
import styles from './Chart.module.css';

export interface SparklineProps {
  items: { startAt: number; endAt: number }[];
  domain: [number, number];
  tone: 'lavender' | 'sky' | 'faint';
  height?: number;
  summary?: string;
}

const TONE = { lavender: 'var(--lavender)', sky: 'var(--sky)', faint: 'var(--text-faint)' } as const;

export function Sparkline({ items, domain, tone, height = 28, summary = 'Contractions over time' }: SparklineProps) {
  const [ref, width] = useWidth();
  const x = scaleLinear().domain(domain).range([0, width]);
  return (
    <div ref={ref} className={styles.wrap}>
      <svg className={styles.svg} role="img" aria-label={summary} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {items
          .filter((i) => i.endAt >= domain[0] && i.startAt <= domain[1])
          .map((i, n) => (
            <rect
              key={n}
              x={x(i.startAt)}
              y={height * 0.2}
              width={Math.max(2, x(i.endAt) - x(i.startAt))}
              height={height * 0.8}
              rx={1}
              fill={TONE[tone]}
            />
          ))}
      </svg>
    </div>
  );
}
