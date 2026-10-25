import { useState } from 'react';
import { StorageNotice } from '../../app/StorageNotice';
import { Wordmark } from '../../app/Wordmark';
import { useInstallHint } from '../../app/installPrompt';
import { navigate } from '../../app/router';
import { Button, SafetyLine } from '../../components';
import { updateSettings } from '../../db/settings';
import styles from './Welcome.module.css';

export function WelcomeScreen() {
  const hint = useInstallHint();
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
        {hint.kind === 'ios' ? <p className={styles.hint}>Tap Share, then Add to Home Screen.</p> : null}
        {hint.kind === 'prompt' ? (
          <Button variant="secondary" onClick={() => void hint.prompt?.()}>
            Install
          </Button>
        ) : null}
        <Button variant="primary" className={styles.cta} onClick={() => void getStarted()}>
          Get started
        </Button>
        <SafetyLine />
      </div>
    </main>
  );
}
