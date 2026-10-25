import type { KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { Sparkline } from '../../charts';
import { Pill } from '../../components';
import { Link } from '../../app/router';
import { countedContractions } from '../../domain/metrics';
import type { Contraction, Session } from '../../db/types';
import { cardStats } from './stats';
import styles from './History.module.css';

interface Props {
  session: Session;
  contractions: Contraction[];
  now: number;
  selectMode: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
}

export function SessionCard({ session, contractions, now, selectMode, selected, onToggle }: Props) {
  const stats = cardStats(session, contractions, now);
  const body = (
    <>
      {selectMode ? (
        <span className={styles.check} data-checked={selected} aria-hidden="true">
          {selected ? <Check size={18} strokeWidth={3} /> : null}
        </span>
      ) : null}
      <span className={styles.main}>
        <span className={styles.titleRow}>
          <span className={styles.title}>{stats.title}</span>
          {stats.active ? <Pill tone="peach">In progress</Pill> : null}
        </span>
        <span className={styles.when}>{stats.when}</span>
        <span className={styles.spark}>
          <Sparkline
            items={countedContractions(contractions)}
            domain={stats.domain}
            tone={selectMode && !selected ? 'faint' : 'lavender'}
            summary={`Contractions in ${stats.title}`}
          />
        </span>
        <span className={styles.counts}>
          <span>
            <b>{stats.counts.count}</b> contr.
          </span>
          <span>
            <b>{stats.counts.apart}</b> apart
          </span>
          <span>
            <b>{stats.counts.long}</b> long
          </span>
        </span>
      </span>
    </>
  );

  if (!selectMode) {
    return (
      <Link to={`#/session/${encodeURIComponent(session.id)}`} className={styles.card} data-selected="false">
        {body}
      </Link>
    );
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onToggle(session.id);
    }
  };
  return (
    <div
      role="checkbox"
      aria-checked={selected}
      aria-label={`${stats.title}, ${stats.when}`}
      tabIndex={0}
      className={styles.card}
      data-selected={selected}
      onClick={() => onToggle(session.id)}
      onKeyDown={onKeyDown}
    >
      {body}
    </div>
  );
}
