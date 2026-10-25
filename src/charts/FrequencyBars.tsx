import { scaleLinear } from 'd3-scale';
import { max } from 'd3-array';
import { useWidth } from './useWidth';
import styles from './Chart.module.css';

export interface FrequencyBarsProps {
  buckets: { start: number; count: number }[];
  domain: [number, number];
  summary: string;
}

const BUCKET_MS = 10 * 60_000;
const HEIGHT = 96;
const LABEL_H = 18;

export function FrequencyBars({ buckets, domain, summary }: FrequencyBarsProps) {
  const [ref, width] = useWidth();
  const x = scaleLinear().domain(domain).range([0, width]);
  const peak = Math.max(1, max(buckets, (b) => b.count) ?? 1);
  const y = scaleLinear().domain([0, peak]).range([0, HEIGHT - LABEL_H]);
  return (
    <div ref={ref} className={styles.wrap}>
      <svg className={styles.svg} role="img" aria-label={summary} width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
        {buckets.map((b) => {
          const w = Math.max(4, x(b.start + BUCKET_MS) - x(b.start) - 4);
          const h = Math.max(3, y(b.count));
          const left = x(b.start) + 2;
          return (
            <g key={b.start}>
              <rect data-bucket={b.start} x={left} y={HEIGHT - h} width={w} height={h} rx={Math.min(6, w / 2)} fill="var(--sky)" />
              <text
                data-count
                x={left + w / 2}
                y={HEIGHT - h - 4}
                textAnchor="middle"
                fontSize={12}
                fontWeight={800}
                fill="var(--text)"
              >
                {b.count}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
