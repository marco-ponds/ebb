import { StatCard } from '../../components';
import { formatDuration } from '../../domain/format';
import type { DetailStats } from './model';
import styles from './SessionDetail.module.css';

const dash = (ms: number | null) => (ms === null ? '—' : formatDuration(ms));

/** SD-02: totals plus the averages over the last hour, or the whole session once it has ended. */
export function SummaryCards({ stats, active }: { stats: DetailStats; active: boolean }) {
  const scope = active ? 'avg, last hour' : 'avg, whole session';
  return (
    <section className={styles.stats} aria-label="Summary">
      <StatCard
        label="Contractions"
        value={String(stats.total)}
        caption={active ? `${stats.windowCount} in the last hour` : 'whole session'}
      />
      <StatCard label="Time apart" value={dash(stats.avgInterval)} caption={scope} />
      <StatCard label="Lasting" value={dash(stats.avgDuration)} caption={scope} />
      <StatCard
        label="Strength"
        value={stats.avgIntensity === null ? '—' : `${Math.round(stats.avgIntensity)}/10`}
        caption={scope}
      />
    </section>
  );
}
