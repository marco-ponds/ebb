import { AlignLeft, Play, SlidersHorizontal, ChevronRight, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { StorageNotice } from '../../app/StorageNotice';
import { Wordmark } from '../../app/Wordmark';
import { Link, navigate } from '../../app/router';
import { Card, HeroButton, IconButton, SafetyLine, showToast } from '../../components';
import { Sparkline } from '../../charts/Sparkline';
import { exportBackup, markBackupDone } from '../../db/backup';
import { startSession } from '../../db/sessions';
import { displayName } from '../../domain/naming';
import { formatDateShort, formatRelativeDays, formatSessionLength, formatTimeRange } from '../../domain/format';
import { saveFile } from '../../lib/share';
import { useContractions, useSessions, useSettings } from '../../state/hooks';
import type { Session } from '../../db/types';
import styles from './Start.module.css';

/** Prominent backup nudge: durable storage was refused and there is real history at stake. */
const NUDGE_AFTER_SESSIONS = 3;

function usePersistDenied(): boolean {
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.resolve(navigator.storage?.persisted?.())
      .then((persisted) => live && setDenied(persisted === false))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return denied;
}

function LastSession({ session }: { session: Session }) {
  const contractions = useContractions(session.id);
  const finished = (contractions ?? []).filter((c): c is typeof c & { endAt: number } => c.endAt !== null);
  const endedAt = session.endedAt ?? session.startedAt;
  const details = [
    formatDateShort(session.startedAt),
    formatTimeRange(session.startedAt, endedAt),
    formatSessionLength(endedAt - session.startedAt),
    `${finished.length} ${finished.length === 1 ? 'contraction' : 'contractions'}`,
  ].join(' · ');

  return (
    <Link to={`#/session/${encodeURIComponent(session.id)}`} className={styles.lastLink}>
      <Card className={styles.last}>
        <div className={styles.lastText}>
          <span className={styles.eyebrow}>LAST SESSION</span>
          <span className={styles.lastName}>{displayName(session, endedAt)}</span>
          <span className={styles.lastMeta}>{details}</span>
        </div>
        <ChevronRight className={styles.chevron} aria-hidden="true" />
        <div className={styles.spark}>
          <Sparkline
            items={finished}
            domain={[session.startedAt, endedAt]}
            tone="sky"
            summary={`${finished.length} contractions over ${formatSessionLength(endedAt - session.startedAt)}`}
          />
        </div>
      </Card>
    </Link>
  );
}

export function StartScreen() {
  const sessions = useSessions();
  const { lastBackupAt } = useSettings();
  const persistDenied = usePersistDenied();
  const [openedAt] = useState(() => Date.now()); // a backup made now still reads "today"
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);

  const last = sessions?.find((s) => s.endedAt !== null);
  const hasData = (sessions?.length ?? 0) > 0;
  const prominent = persistDenied && (sessions?.length ?? 0) >= NUDGE_AFTER_SESSIONS;
  const when = formatRelativeDays(lastBackupAt, openedAt);

  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await startSession();
      navigate('#/live');
    } catch {
      showToast({ message: "Couldn't start a session. Please try again." });
    } finally {
      setStarting(false);
    }
  };

  const backUp = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { blob, filename } = await exportBackup(Date.now());
      await saveFile(blob, filename);
      await markBackupDone(Date.now()); // only now: a cancelled or failed save must not read "today"
    } catch (e) {
      // Closing the share sheet is a choice, not a failure.
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        showToast({ message: "Couldn't save the backup. Please try again." });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Wordmark />
        <IconButton label="Settings" icon={<SlidersHorizontal size={24} strokeWidth={2.2} />} onClick={() => navigate('#/settings')} />
      </header>

      <StorageNotice />

      <div className={styles.intro}>
        <h1 className={styles.title}>Whenever you're ready.</h1>
        <p className={styles.sub}>One tap when a contraction starts, one when it eases. That's all.</p>
      </div>

      <div className={styles.hero}>
        <HeroButton tone="lavender" shape="rounded" ariaLabel="Start timing. Begins a new session" onPress={() => void start()}>
          <span className={styles.heroIcon}>
            <Play size={36} fill="currentColor" strokeWidth={2.2} />
          </span>
          <span className={styles.heroLabel}>Start timing</span>
          <span className={styles.heroSub}>Begins a new session</span>
        </HeroButton>
      </div>

      {last ? <LastSession session={last} /> : null}

      <div className={styles.actions}>
        <Link to="#/history" className={styles.action}>
          <AlignLeft size={24} strokeWidth={2.2} aria-hidden="true" />
          All sessions
        </Link>
        <button
          type="button"
          className={styles.action}
          data-prominent={prominent ? 'true' : 'false'}
          data-never={lastBackupAt === null && hasData ? 'true' : 'false'}
          onClick={() => void backUp()}
        >
          <Download size={24} strokeWidth={2.2} aria-hidden="true" />
          Back up · {when}
        </button>
      </div>

      <div className={styles.safety}>
        <SafetyLine />
      </div>
    </main>
  );
}
