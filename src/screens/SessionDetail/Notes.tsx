import { useEffect, useId, useRef, useState } from 'react';
import { showToast } from '../../components';
import { setSessionNotes } from '../../db/sessions';
import styles from './SessionDetail.module.css';

export const NOTES_IDLE_MS = 500;

/** SD-08: a free textarea that autosaves 500 ms after the last keystroke (and when leaving the screen). */
export function Notes({ sessionId, initial }: { sessionId: string; initial: string }) {
  const id = useId();
  const [text, setText] = useState(initial);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = () => {
    clearTimeout(timer.current);
    const value = pending.current;
    pending.current = null;
    if (value !== null) {
      setSessionNotes(sessionId, value).catch(() => showToast({ message: "Couldn't save your notes. Please try again." }));
    }
  };

  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps -- flush on leaving; it only reads refs

  return (
    <div>
      <label htmlFor={id} className={styles.notesLabel}>
        Notes
      </label>
      <textarea
        id={id}
        className={styles.notes}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          pending.current = e.target.value;
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, NOTES_IDLE_MS);
        }}
      />
    </div>
  );
}
