import { Bookmark, X } from 'lucide-react';
import type { Threshold } from '../../db/types';
import { bannerText } from '../../domain/thresholds';
import styles from './Live.module.css';

export function ThresholdBanner({ threshold, onDismiss }: { threshold: Threshold; onDismiss: () => void }) {
  return (
    <div className={styles.banner} role="status">
      <Bookmark size={22} strokeWidth={2.2} aria-hidden="true" className={styles.bannerIcon} />
      <p className={styles.bannerText}>{bannerText(threshold)}</p>
      <button type="button" className={styles.bannerClose} aria-label="Dismiss" onClick={onDismiss}>
        <X size={22} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  );
}
