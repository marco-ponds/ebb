import { Card } from '../components';
import styles from './StorageNotice.module.css';

export const BOOT_FAILED = "Ebb couldn't open its storage. Close and reopen the app.";

/** Shown instead of an endless skeleton when the store could not start. Quiet: no colour change, no icon. */
export function BootFailed() {
  return (
    <main className={styles.page}>
      <Card className={styles.notice} role="status">
        {BOOT_FAILED}
      </Card>
    </main>
  );
}
