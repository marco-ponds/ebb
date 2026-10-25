import type { ReactNode } from 'react';
import styles from './Pill.module.css';

export interface PillProps {
  tone: 'mint' | 'faint' | 'peach' | 'neutral';
  icon?: ReactNode;
  children: ReactNode;
}

export function Pill({ tone, icon, children }: PillProps) {
  return (
    <span className={styles.pill} data-tone={tone}>
      {icon}
      <span>{children}</span>
    </span>
  );
}
