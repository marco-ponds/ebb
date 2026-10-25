import { useEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from '../../lib/useReducedMotion';
import styles from './HeroButton.module.css';

export interface HeroButtonProps {
  tone: 'lavender' | 'peach';
  shape: 'rounded' | 'circle';
  onPress: () => void;
  ariaLabel: string;
  glow?: boolean;
  dimmed?: boolean;
  children: ReactNode;
}

function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return hidden;
}

export function HeroButton({ tone, shape, onPress, ariaLabel, glow, dimmed, children }: HeroButtonProps) {
  const reducedMotion = useReducedMotion();
  const hidden = useDocumentHidden();
  const showGlow = Boolean(glow) && !reducedMotion;

  return (
    <button
      type="button"
      className={styles.hero}
      data-tone={tone}
      data-shape={shape}
      data-dimmed={dimmed ? 'true' : 'false'}
      aria-label={ariaLabel}
      onClick={onPress}
    >
      <span className={styles.halo} data-halo="outer" aria-hidden="true" />
      <span className={styles.halo} data-halo="inner" aria-hidden="true" />
      {showGlow ? (
        <span
          className={styles.glow}
          data-glow
          aria-hidden="true"
          style={{ animationPlayState: hidden ? 'paused' : 'running' }}
        />
      ) : null}
      <span className={styles.face}>{children}</span>
    </button>
  );
}
