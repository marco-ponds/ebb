import { useState } from 'react';
import { StorageNotice } from '../../app/StorageNotice';
import { Wordmark } from '../../app/Wordmark';
import { InstallHint } from '../../app/InstallHint';
import { navigate } from '../../app/router';
import { Button, SafetyLine } from '../../components';
import { updateSettings } from '../../db/settings';
import styles from './Welcome.module.css';

export function WelcomeScreen() {
  const [busy, setBusy] = useState(false);

  const getStarted = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Ask for durable storage, but never wait on it or let its answer block the user.
      void Promise.resolve(navigator.storage?.persist?.()).catch(() => undefined);
      await updateSettings({ onboardedAt: Date.now() });
      navigate('#/', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <h1 className={styles.mark}>
          <Wordmark size="large" />
        </h1>
        <p className={styles.line}>Time contractions with one tap. Everything stays on this phone.</p>
      </div>

      <div className={styles.bottom}>
        <StorageNotice />
        <InstallHint textClassName={styles.hint} />
        <Button variant="primary" className={styles.cta} onClick={() => void getStarted()}>
          Get started
        </Button>
        <SafetyLine />
      </div>
    </main>
  );
}
