import { Button } from '../../components';
import styles from './SessionDetail.module.css';

export interface ActionsProps {
  onShare: () => void;
  onPdf: () => void;
  onCsv: () => void;
  pdfBusy: boolean;
}

/** SD-09: Share summary (lavender), PDF report and CSV data. */
export function Actions({ onShare, onPdf, onCsv, pdfBusy }: ActionsProps) {
  return (
    <div className={styles.actions}>
      <Button variant="primary" className={styles.shareButton} onClick={onShare}>
        Share summary
      </Button>
      <Button variant="secondary" onClick={onPdf} disabled={pdfBusy} aria-busy={pdfBusy}>
        {pdfBusy ? 'Making PDF…' : 'PDF report'}
      </Button>
      <Button variant="secondary" onClick={onCsv}>
        CSV data
      </Button>
    </div>
  );
}
