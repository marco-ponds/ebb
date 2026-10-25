import { HeroButton } from '../../components';
import type { Contraction } from '../../db/types';
import { formatSpoken, formatTimer } from '../../domain/format';
import styles from './Live.module.css';

export interface LiveHeroProps {
  /** Start of the latest contraction, or null when there are none yet. */
  lastStartAt: number | null;
  active: Contraction | null;
  now: number;
  glow: boolean;
  onPress: () => void;
}

/** The resting / contracting toggle. `data-state` and `data-testid="hero"` sit on the wrapper (HeroButton takes no extra props). */
export function LiveHero({ lastStartAt, active, now, glow, onPress }: LiveHeroProps) {
  if (active) {
    const elapsed = Math.max(0, now - active.startAt);
    return (
      <div className={styles.hero} data-state="contracting" data-testid="hero">
        <HeroButton
          tone="peach"
          shape="circle"
          glow={glow}
          onPress={onPress}
          ariaLabel={`End contraction. ${formatSpoken(elapsed)} so far`}
        >
          <span className={styles.heroLabel}>Contraction</span>
          <span className={styles.heroTimer}>{formatTimer(elapsed)}</span>
          <span className={styles.heroLabel}>Tap when it eases</span>
        </HeroButton>
      </div>
    );
  }
  const since = lastStartAt === null ? null : Math.max(0, now - lastStartAt);
  return (
    <div className={styles.hero} data-state="resting" data-testid="hero">
      <HeroButton
        tone="lavender"
        shape="rounded"
        onPress={onPress}
        ariaLabel={
          since === null
            ? 'Start contraction. No contractions yet'
            : `Start contraction. ${formatSpoken(since)} since the last one started`
        }
      >
        <span className={styles.heroLabel}>Tap when it starts</span>
        {since === null ? (
          <span className={styles.heroEmpty}>No contractions yet</span>
        ) : (
          <>
            <span className={styles.heroTimer}>{formatTimer(since)}</span>
            <span className={styles.heroCaption}>since the last one started</span>
          </>
        )}
      </HeroButton>
    </div>
  );
}
