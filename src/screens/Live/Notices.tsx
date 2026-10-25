import { useState, type ReactNode } from 'react';
import { Button, Sheet, TimeField } from '../../components';
import { clearConflicts, retryPendingWrites } from '../../db/queue';
import { stopContraction } from '../../db/contractions';
import { setRatingFor } from './rating';
import type { StorageStatus } from '../../db/queue';
import type { Contraction } from '../../db/types';
import { formatDuration } from '../../domain/format';
import styles from './Live.module.css';

/** A quiet card: a sentence and, optionally, its actions. Nothing here is red, flashing or an alert. */
export function Notice({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className={styles.notice}>
      <p className={styles.noticeText}>{children}</p>
      {actions ? <div className={styles.noticeActions}>{actions}</div> : null}
    </div>
  );
}

export function StorageNotices({ status, conflictCount }: { status: StorageStatus; conflictCount: number }) {
  return (
    <>
      {status === 'failing' ? (
        <Notice
          actions={
            <Button variant="secondary" onClick={() => void retryPendingWrites()}>
              Retry
            </Button>
          }
        >
          Couldn't save the last tap — free some space, then tap Retry
        </Notice>
      ) : null}
      {conflictCount > 0 ? (
        <Notice
          actions={
            <Button variant="secondary" onClick={clearConflicts}>
              OK
            </Button>
          }
        >
          A few taps couldn't be saved because this session changed in another window.
        </Notice>
      ) : null}
    </>
  );
}

export interface StaleCardProps {
  active: Contraction;
  minutes: number;
  now: number;
  onKeepTiming: () => void;
}

/** "Still going?" for an in-progress contraction that has run over 5 minutes. */
export function StaleCard({ active, minutes, now, onKeepTiming }: StaleCardProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Notice
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(true)}>
              Ended earlier…
            </Button>
            <Button variant="ghost" onClick={onKeepTiming}>
              Keep timing
            </Button>
          </>
        }
      >
        Still going? This one's been running {minutes} min.
      </Notice>
      <EndedEarlierSheet open={open} onClose={() => setOpen(false)} active={active} now={now} />
    </>
  );
}

function EndedEarlierSheet({ open, onClose, active, now }: { open: boolean; onClose: () => void; active: Contraction; now: number }) {
  // Fixed while the sheet is open, so the allowed range does not creep under the person's finger.
  const [frozen, setFrozen] = useState(now);
  const [end, setEnd] = useState(now);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFrozen(now);
      setEnd(now);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="When did it end?">
      <div className={styles.sheetBody}>
        <TimeField label="Ended at" value={end} reference={frozen} min={active.startAt} max={frozen} onChange={setEnd} />
        <p className={styles.noticeText}>That makes it {formatDuration(Math.max(0, end - active.startAt))} long.</p>
        <Button
          variant="primary"
          onClick={() => {
            void stopContraction(active.id, end).then((c) => {
              setRatingFor(c.id);
              onClose();
            });
          }}
        >
          Save
        </Button>
      </div>
    </Sheet>
  );
}

export interface PausedCardProps {
  sinceMs: number;
  onKeepGoing: () => void;
  onEnd: () => void;
}

/** "Contractions paused?" after 60+ minutes of rest. The session is never ended for the person. */
export function PausedCard({ sinceMs, onKeepGoing, onEnd }: PausedCardProps) {
  return (
    <Notice
      actions={
        <>
          <Button variant="secondary" onClick={onKeepGoing}>
            Keep session going
          </Button>
          <Button variant="ghost" onClick={onEnd}>
            End session…
          </Button>
        </>
      }
    >
      Contractions paused? Last one {formatDuration(sinceMs)} ago.
    </Notice>
  );
}
