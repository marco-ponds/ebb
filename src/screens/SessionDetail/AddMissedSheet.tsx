import { useState } from 'react';
import { Button, DurationField, Sheet, TimeField } from '../../components';
import { addMissedContraction } from '../../db/contractions';
import { OverlapError } from '../../db/errors';
import type { Contraction } from '../../db/types';
import { findOverlap } from '../../domain/metrics';
import { overlapMessage, savedToast } from './EditContractionSheet';
import styles from './SessionDetail.module.css';

const MIN = 60_000;

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  all: Contraction[];
  /** The right edge of the session, used to suggest a start a few minutes back. */
  end: number;
}

function Form({ sessionId, all, end, onClose }: Omit<Props, 'open'>) {
  const [start, setStart] = useState(() => Math.floor((end - 5 * MIN) / MIN) * MIN);
  const [duration, setDuration] = useState(60_000);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy || duration <= 0) return;
    const other = findOverlap(all, { startAt: start, endAt: start + duration });
    if (other) {
      setError(overlapMessage(other));
      return;
    }
    setBusy(true);
    try {
      await addMissedContraction(sessionId, { startAt: start, durationMs: duration });
      savedToast();
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof OverlapError ? overlapMessage(e.other) : "Couldn't save. Please try again.");
    }
  };

  return (
    <div className={styles.form}>
      <TimeField
        label="Start time"
        value={start}
        reference={end}
        onChange={(v) => {
          setStart(v);
          setError(null);
        }}
      />
      <DurationField
        label="Length"
        valueMs={duration}
        onChange={(v) => {
          setDuration(v);
          setError(null);
        }}
      />
      <p className={styles.hint} role="alert" hidden={!error}>
        {error}
      </p>
      <div className={styles.formActions}>
        <Button variant="primary" onClick={save} disabled={busy || duration <= 0}>
          Save
        </Button>
      </div>
    </div>
  );
}

export function AddMissedSheet({ open, onClose, ...rest }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Add a missed contraction">
      <Form onClose={onClose} {...rest} />
    </Sheet>
  );
}
