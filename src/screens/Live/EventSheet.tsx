import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Sheet, TimeField } from '../../components';
import { addEvent } from '../../db/events';
import type { EbbEvent, EventType, WatersDetail } from '../../db/types';
import { EVENT_LABELS, GENTLE_PROMPT, WATERS_OPTIONS, eventConfirmation, needsGentlePrompt } from '../../domain/events';
import styles from './Live.module.css';

const TYPES: EventType[] = ['waters', 'bleeding', 'reduced-movement', 'called-midwife', 'went-to-hospital', 'note'];
const TYPE_OPTIONS = TYPES.map((t) => ({ value: t, label: EVENT_LABELS[t] }));

interface ChoiceGroupProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}

/** A radiogroup of chips: one tab stop, arrows move and select. */
function ChoiceGroup<T extends string>({ label, options, value, onChange }: ChoiceGroupProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const stop = Math.max(0, options.findIndex((o) => o.value === value));
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const n = options.length;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n : -1;
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(options[next].value);
  };
  return (
    <div role="radiogroup" aria-label={label} className={styles.choices}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === stop ? 0 : -1}
          className={styles.choice}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function EventForm({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [reference] = useState(() => Date.now());
  const [type, setType] = useState<EventType | null>(null);
  const [details, setDetails] = useState<WatersDetail | null>(null);
  const [at, setAt] = useState(reference);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<EbbEvent | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  // The form unmounts on save, taking focus with it: put it on Done so Esc and Tab keep working inside the sheet.
  useEffect(() => {
    if (saved) confirmRef.current?.querySelector('button')?.focus();
  }, [saved]);

  if (saved) {
    return (
      <div ref={confirmRef} className={styles.sheetBody}>
        <p className={styles.confirmation}>{eventConfirmation(saved)}</p>
        {needsGentlePrompt(saved.type, saved.details) ? (
          <div role="status" className={styles.gentle}>
            {GENTLE_PROMPT}
          </div>
        ) : null}
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }

  const save = () => {
    if (!type || saving) return;
    setSaving(true);
    void addEvent(sessionId, {
      type,
      at,
      details: type === 'waters' ? details : null,
      note: note.trim() || null,
    }).then(setSaved);
  };

  return (
    <form
      className={styles.sheetBody}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <ChoiceGroup label="Type" options={TYPE_OPTIONS} value={type} onChange={setType} />
      {type === 'waters' ? <ChoiceGroup label="Colour" options={WATERS_OPTIONS} value={details} onChange={setDetails} /> : null}
      <TimeField label="Time" value={at} reference={reference} onChange={setAt} />
      <label className={styles.noteField}>
        <span className={styles.noteLabel}>Note (optional)</span>
        <input type="text" className={styles.noteInput} value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
      </label>
      <Button type="submit" variant="primary" disabled={!type || saving}>
        Save
      </Button>
    </form>
  );
}

export function EventSheet({ open, onClose, sessionId }: { open: boolean; onClose: () => void; sessionId: string }) {
  return (
    <Sheet open={open} onClose={onClose} title="Add an event">
      <EventForm sessionId={sessionId} onClose={onClose} />
    </Sheet>
  );
}
