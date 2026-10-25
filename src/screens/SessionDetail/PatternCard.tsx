import { ChevronsDownUp, MoveHorizontal, TrendingUp } from 'lucide-react';
import { Card } from '../../components';
import { formatRegularityRange } from '../../domain/format';
import type { Progression, Regularity, RegularityLabel } from '../../domain/metrics';
import styles from './SessionDetail.module.css';

const FILLED: Record<RegularityLabel, number> = { Regular: 3, 'Fairly regular': 2, Irregular: 1 };

export interface PatternCardProps {
  regularity: Regularity | null;
  progression: Progression;
  active: boolean;
  /** False while fewer than 4 contractions count: the card shows its empty state. */
  enough: boolean;
}

/** SD-03: a three-step meter (filled segments and the label, never colour alone), the range and three progression rows. */
export function PatternCard({ regularity, progression, active, enough }: PatternCardProps) {
  if (!enough || !regularity) {
    return (
      <Card className={styles.pattern}>
        <p className={styles.empty}>Not enough yet to describe a pattern</p>
      </Card>
    );
  }
  const filled = FILLED[regularity.label];
  const range = formatRegularityRange(regularity.rangeMin);
  return (
    <Card className={styles.pattern}>
      <div className={styles.patternTop}>
        <h2 className={styles.patternLabel}>{regularity.label}</h2>
        <div className={styles.meter} role="img" aria-label={`${regularity.label}: ${filled} of 3`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={styles.segment} data-filled={i < filled ? 'true' : 'false'} />
          ))}
        </div>
      </div>
      <p className={styles.range}>
        {range.charAt(0).toUpperCase() + range.slice(1)} over the last hour{active ? '' : ' of the session'}
      </p>
      <dl className={styles.progress}>
        <div className={styles.progressRow}>
          <span className={styles.progressIcon} aria-hidden="true">
            <ChevronsDownUp size={18} strokeWidth={2.2} />
          </span>
          <dt>Time apart</dt>
          <dd>{progression.interval ?? '—'}</dd>
        </div>
        <div className={styles.progressRow}>
          <span className={styles.progressIcon} aria-hidden="true">
            <MoveHorizontal size={18} strokeWidth={2.2} />
          </span>
          <dt>Length</dt>
          <dd>{progression.duration ?? '—'}</dd>
        </div>
        <div className={styles.progressRow}>
          <span className={styles.progressIcon} aria-hidden="true">
            <TrendingUp size={18} strokeWidth={2.2} />
          </span>
          <dt>Strength</dt>
          <dd>{progression.intensity ?? '—'}</dd>
        </div>
      </dl>
    </Card>
  );
}
