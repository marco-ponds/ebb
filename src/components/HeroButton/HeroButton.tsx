import { useEffect, useInsertionEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { ensureBreatheKeyframes } from './breathe';
import styles from './HeroButton.module.css';

export interface HeroButtonProps {
  tone: 'lavender' | 'peach';
  shape: 'rounded' | 'circle';
  onPress: () => void;
  ariaLabel: string;
  glow?: boolean;
  /** Seconds breathing in and out; read once when the glow mounts. */
  glowTiming?: { inSeconds: number; outSeconds: number };
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

const DEFAULT_TIMING = { inSeconds: 4, outSeconds: 4 };

/** Mounted only while glowing, so it snapshots the timing and a change applies from the next contraction. */
function Glow({ timing }: { timing: { inSeconds: number; outSeconds: number } }) {
  const hidden = useDocumentHidden();
  const [{ inSeconds, outSeconds }] = useState(timing);
  const name = `breathe-${inSeconds}-${outSeconds}`;
  // Insertion effects run before layout, so the rule exists before the animation first resolves.
  useInsertionEffect(() => {
    ensureBreatheKeyframes(inSeconds, outSeconds);
  }, [inSeconds, outSeconds]);
  return (
    <span
      className={styles.glow}
      data-glow
      aria-hidden="true"
      style={{
        animationName: name,
        animationDuration: `${inSeconds + outSeconds}s`,
        animationPlayState: hidden ? 'paused' : 'running',
      }}
    />
  );
}

export function HeroButton({ tone, shape, onPress, ariaLabel, glow, glowTiming = DEFAULT_TIMING, dimmed, children }: HeroButtonProps) {
  const reducedMotion = useReducedMotion();
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
      {showGlow ? <Glow timing={glowTiming} /> : null}
      <span className={styles.face}>{children}</span>
    </button>
  );
}
