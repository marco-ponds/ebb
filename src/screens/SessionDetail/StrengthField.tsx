import type { IntensityScale } from '../../db/types';
import { WORD_SCALE } from '../../domain/intensity';
import styles from './SessionDetail.module.css';

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export interface StrengthFieldProps {
  scale: IntensityScale;
  value: number | null;
  onChange: (value: number | null) => void;
}

/** Strength radiogroup in the Settings scale, plus "Not rated". Stored as 1–10 whichever scale is shown. */
export function StrengthField({ scale, value, onChange }: StrengthFieldProps) {
  const chip = (label: string, v: number | null, key: string) => (
    <button key={key} type="button" role="radio" aria-checked={value === v} className={styles.chip} onClick={() => onChange(v)}>
      {label}
    </button>
  );
  return (
    <div className={styles.fieldGroup} role="radiogroup" aria-label="Strength">
      <span className={styles.fieldLabel} aria-hidden="true">
        Strength
      </span>
      <div className={styles.chips}>
        {scale !== 'numeric' ? WORD_SCALE.map((w) => chip(w.word, w.value, `w${w.value}`)) : null}
        {scale !== 'words' ? NUMBERS.map((n) => chip(String(n), n, `n${n}`)) : null}
        {chip('Not rated', null, 'none')}
      </div>
    </div>
  );
}
