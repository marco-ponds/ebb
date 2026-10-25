import { useState, type ChangeEvent } from 'react';
import { navigate } from '../../app/router';
import { Button, Card, Sheet, showToast } from '../../components';
import { deleteAllData, exportBackup, markBackupDone, parseBackup, restoreBackup, type Backup } from '../../db/backup';
import { InvariantError } from '../../db/errors';
import { formatRelativeDays } from '../../domain/format';
import { saveFile } from '../../lib/share';
import { useSettings } from '../../state/hooks';
import { useAppStore } from '../../state/store';
import styles from './Settings.module.css';

const NOT_A_BACKUP = "This file isn't an Ebb backup";
const BUSY_HINT = 'Finish the current session before restoring';

interface Preview {
  backup: Backup;
  counts: { sessions: number; contractions: number; events: number };
}

const readText = (file: File): Promise<string> =>
  typeof file.text === 'function'
    ? file.text()
    : new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsText(file);
      });

function BackUp() {
  const { lastBackupAt } = useSettings();
  const [openedAt] = useState(() => Date.now()); // a backup made now still reads "today"
  const [saving, setSaving] = useState(false);

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
    <>
      <p className={styles.panel}>
        Everything lives only on this phone. Clearing the browser's data removes it, so a backup now and then is worth it.
        Last backup: {formatRelativeDays(lastBackupAt, openedAt)}.
      </p>
      <Button variant="primary" className={styles.wide} disabled={saving} onClick={() => void backUp()}>
        Back up everything
      </Button>
    </>
  );
}

function Restore() {
  const busy = useAppStore((s) => s.activeSession !== null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [replaced, setReplaced] = useState(false);
  const [working, setWorking] = useState(false);

  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = ''; // the same file can be chosen again
    setPreview(null);
    setReplaced(false);
    setMessage(null);
    if (!file) return;
    let text: string;
    try {
      text = await readText(file);
    } catch {
      setMessage(NOT_A_BACKUP);
      return;
    }
    const parsed = parseBackup(text);
    if (parsed.ok) setPreview({ backup: parsed.backup, counts: parsed.counts });
    else setMessage(parsed.error);
  };

  const run = async (mode: 'merge' | 'replace') => {
    if (!preview || working) return;
    setWorking(true);
    try {
      const { added, skipped, snapshotSaved } = await restoreBackup(preview.backup, mode);
      setMessage(`Added ${added}, skipped ${skipped}`);
      setReplaced(mode === 'replace' && snapshotSaved);
    } catch (e) {
      setMessage(e instanceof InvariantError ? BUSY_HINT : "Couldn't restore just now. Nothing was changed.");
    } finally {
      setPreview(null);
      setWorking(false);
    }
  };

  return (
    <>
      <label className={styles.restore} aria-disabled={busy}>
        <input
          className={styles.fileInput}
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(e) => void choose(e)}
        />
        Restore from a backup
      </label>
      {busy ? <p className={styles.note}>{BUSY_HINT}</p> : null}
      {preview ? (
        <div className={styles.preview}>
          <p className={styles.previewCounts}>
            {preview.counts.sessions} sessions, {preview.counts.contractions} contractions, {preview.counts.events} events
          </p>
          <div className={styles.previewActions}>
            <Button variant="primary" disabled={working || busy} onClick={() => void run('merge')}>
              Merge
            </Button>
            <Button variant="secondary" disabled={working || busy} onClick={() => void run('replace')}>
              Replace
            </Button>
            <Button variant="ghost" disabled={working} onClick={() => setPreview(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      <div role="status">
        {message ? <p className={styles.note}>{message}</p> : null}
        {replaced ? <p className={styles.note}>A copy of your current data was saved first</p> : null}
      </div>
    </>
  );
}

function DeleteAll() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState(false);

  const close = () => {
    setOpen(false);
    setTyped('');
    setProblem(false);
  };

  const confirm = async () => {
    if (typed !== 'delete' || working) return;
    setWorking(true);
    setProblem(false);
    try {
      await deleteAllData();
      close();
      navigate('#/');
    } catch {
      setProblem(true);
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <Button variant="destructive-text" className={styles.wide} onClick={() => setOpen(true)}>
        Delete all data…
      </Button>
      <Sheet open={open} onClose={close} title="Delete all data">
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <p className={styles.sheetText}>
            This removes every session, contraction and setting from this phone. It can't be undone, so a backup first is worth it.
          </p>
          <label className={styles.field}>
            Type "delete" to confirm
            <input
              className={styles.input}
              type="text"
              value={typed}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
          {problem ? <p className={styles.hint}>Couldn't delete just now. Nothing was changed.</p> : null}
          <Button variant="secondary" type="submit" disabled={typed !== 'delete' || working}>
            Delete everything
          </Button>
        </form>
      </Sheet>
    </>
  );
}

export function DataSection() {
  return (
    <section aria-labelledby="settings-data">
      <h2 id="settings-data" className={styles.sectionTitle}>
        Your data
      </h2>
      <Card>
        <div className={styles.stack}>
          <BackUp />
          <Restore />
          <DeleteAll />
        </div>
      </Card>
    </section>
  );
}
