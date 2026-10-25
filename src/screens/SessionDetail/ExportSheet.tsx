import { Button, Sheet } from '../../components';
import styles from './SessionDetail.module.css';

export interface ExportSheetProps {
  open: boolean;
  onClose: () => void;
  onPdf: () => void;
  onCsv: () => void;
  pdfBusy: boolean;
}

/** SD-01: the header's Export button opens PDF report and CSV data. */
export function ExportSheet({ open, onClose, onPdf, onCsv, pdfBusy }: ExportSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Export">
      <div className={styles.exportList}>
        <Button
          variant="secondary"
          disabled={pdfBusy}
          onClick={() => {
            onPdf();
            onClose();
          }}
        >
          PDF report
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            onCsv();
            onClose();
          }}
        >
          CSV data
        </Button>
      </div>
    </Sheet>
  );
}
