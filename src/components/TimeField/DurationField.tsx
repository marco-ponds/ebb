import { useId } from 'react';
import styles from './TimeField.module.css';

export interface DurationFieldProps {
  label: string;
  valueMs: number;
  onChange: (ms: number) => void;
}

const toInt = (raw: string) => {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function DurationField({ label, valueMs, onChange }: DurationFieldProps) {
  const id = useId();
  const minutes = Math.floor(valueMs / 60_000);
  const seconds = Math.floor((valueMs % 60_000) / 1000);

  return (
    <div className={styles.field} role="group" aria-labelledby={`${id}-l`}>
      <span id={`${id}-l`} className={styles.label}>
        {label}
      </span>
      <div className={styles.pair}>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          aria-label={`${label} minutes`}
          className={styles.input}
          value={minutes}
          onChange={(e) => onChange(toInt(e.target.value) * 60_000 + seconds * 1000)}
        />
        <span className={styles.unit} aria-hidden="true">
          min
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          aria-label={`${label} seconds`}
          className={styles.input}
          value={seconds}
          onChange={(e) => onChange(minutes * 60_000 + Math.min(59, toInt(e.target.value)) * 1000)}
        />
        <span className={styles.unit} aria-hidden="true">
          sec
        </span>
      </div>
    </div>
  );
}
