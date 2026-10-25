import { navigate } from '../../app/router';
import { Button, Sheet } from '../../components';
import { endSession } from '../../db/sessions';
import { formatSessionLength } from '../../domain/format';
import styles from './Live.module.css';

export interface EndSessionSheetProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  /** Contractions counted in the summary line. */
  count: number;
  /** Session length in ms, for the summary line. */
  lengthMs: number;
}

/**
 * "End this session?" Ending releases the wake lock (the Live screen unmounts, and useWakeLock releases on unmount)
 * and goes to the Start screen.
 */
export function EndSessionSheet({ open, onClose, sessionId, count, lengthMs }: EndSessionSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="End this session?">
      <div className={styles.sheetBody}>
        <p className={styles.noticeText}>
          {count} {count === 1 ? 'contraction' : 'contractions'} over {formatSessionLength(lengthMs)}
        </p>
        <Button
          variant="primary"
          onClick={() => {
            void endSession(sessionId).then(() => navigate('#/'));
          }}
        >
          End session
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Keep going
        </Button>
      </div>
    </Sheet>
  );
}
