import { copyText } from '../../lib/share';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import { showToast } from '../Toast';
import styles from './SummarySheet.module.css';

export interface SummarySheetProps {
  open: boolean;
  onClose: () => void;
  text: string;
}

export function SummarySheet({ open, onClose, text }: SummarySheetProps) {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    if (await copyText(text)) showToast({ message: 'Copied', durationMs: 3000 });
  };

  const share = async () => {
    try {
      await navigator.share({ text });
    } catch {
      // The person dismissed the share sheet; nothing to do.
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Share summary">
      <p className={styles.text}>{text}</p>
      <div className={styles.actions}>
        <Button variant="primary" onClick={copy}>
          Copy
        </Button>
        {canShare ? (
          <Button variant="secondary" onClick={share}>
            Share…
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
