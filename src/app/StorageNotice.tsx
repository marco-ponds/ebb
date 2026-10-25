import { Card } from '../components';
import { useStorageStatus } from '../state/hooks';
import styles from './StorageNotice.module.css';

export const STORAGE_NOTICE = "This browser won't keep your data. Open Ebb from your home screen instead.";

/** Quiet card shown on Welcome and Start when the browser gave us only in-memory storage. */
export function StorageNotice() {
  const { status } = useStorageStatus();
  if (status !== 'memory') return null;
  return (
    <Card className={styles.notice} role="status">
      {STORAGE_NOTICE}
    </Card>
  );
}
