import { Menu, Moon, Sun } from 'lucide-react';
import { IconButton, Pill } from '../../components';
import type { WakeLockState } from '../../app/wakeLock';
import { Link } from '../../app/router';
import type { Session } from '../../db/types';
import { formatSessionLength, formatClock } from '../../domain/format';
import { displayName } from '../../domain/naming';
import type { StorageStatus } from '../../db/queue';
import styles from './Live.module.css';

export interface LiveHeaderProps {
  session: Session;
  now: number;
  wakeLock: WakeLockState;
  storageStatus: StorageStatus;
  dimmed: boolean;
  onMenu: () => void;
}

export function LiveHeader({ session, now, wakeLock, storageStatus, dimmed, onMenu }: LiveHeaderProps) {
  return (
    <header className={styles.header} data-dimmed={dimmed ? 'true' : 'false'}>
      <div className={styles.title}>
        <h1 className={styles.name}>
          <Link to={`#/session/${session.id}`}>{displayName(session, now)}</Link>
        </h1>
        <p className={styles.sub}>
          Started {formatClock(session.startedAt)} · {formatSessionLength(now - session.startedAt)} so far
        </p>
      </div>
      <div className={styles.headerEnd}>
        {storageStatus === 'memory' ? <Pill tone="neutral">Not saved</Pill> : null}
        {wakeLock === 'held' ? (
          <Pill tone="mint" icon={<Sun size={18} strokeWidth={2.2} aria-hidden="true" />}>
            Screen stays on
          </Pill>
        ) : null}
        {wakeLock === 'unavailable' ? (
          <Pill tone="faint" icon={<Moon size={18} strokeWidth={2.2} aria-hidden="true" />}>
            Screen may sleep
          </Pill>
        ) : null}
        <IconButton label="Menu" icon={<Menu size={22} strokeWidth={2.2} aria-hidden="true" />} onClick={onMenu} />
      </div>
    </header>
  );
}
