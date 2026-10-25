import { useState } from 'react';
import { Button, Sheet, TimeField } from '../../components';
import { deleteEvent, updateEvent } from '../../db/events';
import type { EbbEvent, EventType, WatersDetail } from '../../db/types';
import { EVENT_LABELS, WATERS_OPTIONS } from '../../domain/events';
import { deletedToast, savedToast } from './EditContractionSheet';
import styles from './SessionDetail.module.css';

const TYPES = Object.keys(EVENT_LABELS) as EventType[];

function Form({ event: e, onClose }: { event: EbbEvent; onClose: () => void }) {
  const [type, setType] = useState<EventType>(e.type);
  const [details, setDetails] = useState<WatersDetail | null>(e.details);
  const [at, setAt] = useState(e.at);
  const [note, setNote] = useState(e.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await updateEvent(e.id, {
        type,
        at,
        details: type === 'waters' ? details : null,
        note: note.trim() === '' ? null : note.trim(),
      });
      savedToast();
      onClose();
    } catch {
      setBusy(false);
      setError("Couldn't save. Please try again.");
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteEvent(e.id);
      deletedToast();
      onClose();
    } catch {
      setBusy(false);
      setError("Couldn't delete. Please try again.");
    }
  };

  return (
    <div className={styles.form}>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="event-type">
          Type
        </label>
        <select id="event-type" className={styles.textInput} value={type} onChange={(ev) => setType(ev.target.value as EventType)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {EVENT_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      {type === 'waters' ? (
        <div className={styles.fieldGroup} role="radiogroup" aria-label="Details">
          <span className={styles.fieldLabel} aria-hidden="true">
            Details
          </span>
          <div className={styles.chips}>
            {WATERS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={details === o.value}
                className={styles.chip}
                onClick={() => setDetails(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <TimeField label="Time" value={at} reference={e.at} onChange={setAt} />
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="event-note">
          Note
        </label>
        <input id="event-note" className={styles.textInput} value={note} maxLength={200} onChange={(ev) => setNote(ev.target.value)} />
      </div>
      <p className={styles.hint} role="alert" hidden={!error}>
        {error}
      </p>
      <div className={styles.formActions}>
        <Button variant="primary" onClick={save} disabled={busy}>
          Save
        </Button>
        <Button variant="destructive-text" onClick={remove} disabled={busy}>
          Delete
        </Button>
      </div>
    </div>
  );
}

export function EditEventSheet({ event, onClose }: { event: EbbEvent | undefined; onClose: () => void }) {
  return (
    <Sheet open={event !== undefined} onClose={onClose} title="Edit event">
      {event ? <Form key={event.id} event={event} onClose={onClose} /> : null}
    </Sheet>
  );
}
