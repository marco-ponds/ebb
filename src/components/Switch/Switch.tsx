import { useId } from 'react';
import styles from './Switch.module.css';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  tone: 'mint' | 'butter';
}

export function Switch({ checked, onChange, label, description, tone }: SwitchProps) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-l`}
      aria-describedby={description ? `${id}-d` : undefined}
      className={styles.row}
      data-tone={tone}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.text}>
        <span id={`${id}-l`} className={styles.label}>
          {label}
        </span>
        {description ? (
          <span id={`${id}-d`} className={styles.description}>
            {description}
          </span>
        ) : null}
      </span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
    </button>
  );
}
