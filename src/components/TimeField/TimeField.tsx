import { useId } from 'react';
import styles from './TimeField.module.css';

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

export function formatHHmm(epoch: number): string {
  const d = new Date(epoch);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Resolves "HH:mm" to the local occurrence nearest `reference` (within ±12 h), so midnight works. */
export function resolveTime(hhmm: string, reference: number): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const [h, m] = [Number(match[1]), Number(match[2])];
  const ref = new Date(reference);
  let best = 0;
  let bestDiff = Infinity;
  for (const dayOffset of [-1, 0, 1]) {
    const candidate = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + dayOffset, h, m, 0, 0).getTime();
    const diff = Math.abs(candidate - reference);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return bestDiff <= DAY_MS / 2 ? best : null;
}

export interface TimeFieldProps {
  label: string;
  value: number;
  reference: number;
  onChange: (epoch: number) => void;
  min?: number;
  max?: number;
}

export function TimeField({ label, value, reference, onChange, min, max }: TimeFieldProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        type="time"
        className={styles.input}
        value={formatHHmm(value)}
        onChange={(e) => {
          const epoch = resolveTime(e.target.value, reference);
          if (epoch === null) return;
          let next = epoch;
          if (min !== undefined) next = Math.max(min, next);
          if (max !== undefined) next = Math.min(max, next);
          onChange(next);
        }}
      />
    </div>
  );
}
