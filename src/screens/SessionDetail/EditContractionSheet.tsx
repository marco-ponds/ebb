import { useState } from 'react';
import { Button, Sheet, TimeField, showToast } from '../../components';
import { deleteContraction, updateContraction, type ContractionPatch } from '../../db/contractions';
import { OverlapError } from '../../db/errors';
import type { Contraction, IntensityScale } from '../../db/types';
import { formatClock } from '../../domain/format';
import { undoWithFeedback } from '../../lib/undoFeedback';
import { findOverlap } from '../../domain/metrics';
import { timingById, timingLines } from './model';
import { StrengthField } from './StrengthField';
import styles from './SessionDetail.module.css';

export const END_BEFORE_START = 'The end needs to be after the start';
export const overlapMessage = (other: { startAt: number }) => `Overlaps the one at ${formatClock(other.startAt)}`;

export function savedToast() {
  showToast({ message: 'Saved · ', actionLabel: 'Undo', onAction: () => void undoWithFeedback() });
}
export function deletedToast() {
  showToast({ message: 'Deleted · ', actionLabel: 'Undo', onAction: () => void undoWithFeedback() });
}

interface Props {
  contraction: Contraction | undefined;
  all: Contraction[];
  scale: IntensityScale;
  onClose: () => void;
}

function Form({ contraction: c, all, scale, onClose }: Omit<Props, 'contraction'> & { contraction: Contraction }) {
  const [start, setStart] = useState(c.startAt);
  const [end, setEnd] = useState(c.endAt);
  const [intensity, setIntensity] = useState(c.intensity);
  const [note, setNote] = useState(c.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const badRange = end !== null && end <= start;
  const hint = badRange ? END_BEFORE_START : error;
  const [intervalLine, restLine] = timingLines(timingById(all).get(c.id));

  const save = async () => {
    if (badRange || busy) return;
    if (end !== null) {
      const other = findOverlap(all, { startAt: start, endAt: end }, c.id);
      if (other) {
        setError(overlapMessage(other));
        return;
      }
    }
    const patch: ContractionPatch = {};
    if (start !== c.startAt) patch.startAt = start;
    if (end !== null && end !== c.endAt) patch.endAt = end;
    if (intensity !== c.intensity) patch.intensity = intensity;
    const nextNote = note.trim() === '' ? null : note.trim();
    if (nextNote !== c.note) patch.note = nextNote;
    setBusy(true);
    try {
      await updateContraction(c.id, patch);
      savedToast();
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof OverlapError ? overlapMessage(e.other) : e instanceof RangeError ? END_BEFORE_START : "Couldn't save. Please try again.");
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteContraction(c.id);
      deletedToast();
      onClose();
    } catch {
      setBusy(false);
      setError("Couldn't delete. Please try again.");
    }
  };

  return (
    <div className={styles.form}>
      <TimeField
        label="Start"
        value={start}
        reference={c.startAt}
        onChange={(v) => {
          setStart(v);
          setError(null);
        }}
      />
      {end !== null ? (
        <TimeField
          label="End"
          value={end}
          reference={c.startAt}
          onChange={(v) => {
            setEnd(v);
            setError(null);
          }}
        />
      ) : null}
      <p className={styles.hint} data-testid="timing">
        {intervalLine} · {restLine}
      </p>
      <StrengthField scale={scale} value={intensity} onChange={setIntensity} />
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="contraction-note">
          Note
        </label>
        <input id="contraction-note" className={styles.textInput} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </div>
      <p className={styles.hint} role="alert" hidden={!hint}>
        {hint}
      </p>
      <div className={styles.formActions}>
        <Button variant="primary" onClick={save} disabled={badRange || busy}>
          Save
        </Button>
        <Button variant="destructive-text" onClick={remove} disabled={busy}>
          Delete
        </Button>
      </div>
    </div>
  );
}

export function EditContractionSheet({ contraction, ...rest }: Props) {
  return (
    <Sheet open={contraction !== undefined} onClose={rest.onClose} title="Edit contraction">
      {contraction ? <Form key={contraction.id} contraction={contraction} {...rest} /> : null}
    </Sheet>
  );
}
