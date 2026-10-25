import { Card, StatCard } from '../../components';
import type { LiveMetrics, RollingAverages } from '../../domain/metrics';
import { formatDuration } from '../../domain/format';
import styles from './Live.module.css';

const dash = (ms: number | null) => (ms === null ? '—' : formatDuration(ms));

export function StatCards({ metrics, dimmed }: { metrics: LiveMetrics; dimmed: boolean }) {
  const caption = dimmed ? undefined : 'last one';
  return (
    <div className={styles.stats}>
      <StatCard label="Time apart" value={dash(metrics.last.interval)} caption={caption} dimmed={dimmed} />
      <StatCard label="Lasting" value={dash(metrics.last.duration)} caption={caption} dimmed={dimmed} />
    </div>
  );
}

function averageText(avg: RollingAverages, enough: boolean): string {
  if (!enough || avg.interval === null || avg.duration === null) return 'Not enough yet';
  return `every ${formatDuration(avg.interval)} · ${formatDuration(avg.duration)} long`;
}

/** `enough` is false while fewer than 4 contractions count (the "Only 1–3 contractions" edge row). */
export function AveragesCard({ metrics, enough }: { metrics: LiveMetrics; enough: boolean }) {
  return (
    <Card className={styles.averages}>
      <dl className={styles.averageList}>
        <div className={styles.averageRow}>
          <dt>Last 30 min</dt>
          <dd>{averageText(metrics.avg30, enough)}</dd>
        </div>
        <div className={styles.averageRow}>
          <dt>Last hour</dt>
          <dd>{averageText(metrics.avg60, enough)}</dd>
        </div>
      </dl>
    </Card>
  );
}

const DOT = { Regular: 'mint', 'Fairly regular': 'butter', Irregular: 'faint' } as const;

/** Hidden while too little data: fewer than 4 counted contractions, or no regularity yet. */
export function PatternLine({ metrics, enough }: { metrics: LiveMetrics; enough: boolean }) {
  if (!enough || !metrics.regularity) return null;
  const { label } = metrics.regularity;
  const progression = metrics.progression.interval;
  return (
    <p className={styles.pattern}>
      <span className={styles.dot} data-tone={DOT[label]} aria-hidden="true" />
      {progression ? `${label} · ${progression}` : label}
    </p>
  );
}
