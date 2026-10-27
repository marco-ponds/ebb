import { useCallback, useEffect, useInsertionEffect, useState, type ReactNode } from 'react';
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

/** Matches --dur-crossfade in tokens.css. */
export const GLOW_FADE_MS = 220;

/**
 * Mounted only while glowing, so it snapshots the timing and a change applies from the next contraction
 * or when Live remounts. When the contraction ends it stays up for one crossfade, fading out.
 */
function Glow({ timing, leaving, onGone }: { timing: { inSeconds: number; outSeconds: number }; leaving: boolean; onGone: () => void }) {
  const hidden = useDocumentHidden();
  const [{ inSeconds, outSeconds }] = useState(timing);
  const name = `breathe-${inSeconds}-${outSeconds}`;
  // Insertion effects run before layout, so the rule exists before the animation first resolves.
  useInsertionEffect(() => {
    ensureBreatheKeyframes(inSeconds, outSeconds);
  }, [inSeconds, outSeconds]);
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(onGone, GLOW_FADE_MS);
    return () => window.clearTimeout(t);
  }, [leaving, onGone]);
  return (
    <span className={styles.glowLayer} data-glow-leaving={leaving ? 'true' : undefined} aria-hidden="true">
      <span
        className={styles.glow}
        data-glow={leaving ? undefined : ''}
        style={{
          animationName: name,
          animationDuration: `${inSeconds + outSeconds}s`,
          animationPlayState: hidden ? 'paused' : 'running',
        }}
      />
    </span>
  );
}

export function HeroButton({ tone, shape, onPress, ariaLabel, glow, glowTiming = DEFAULT_TIMING, dimmed, children }: HeroButtonProps) {
  const reducedMotion = useReducedMotion();
  const wantGlow = Boolean(glow) && !reducedMotion;
  // 'on' while glowing, 'leaving' for one crossfade after, then 'off'. A new contraction remounts the glow.
  const [phase, setPhase] = useState<'off' | 'on' | 'leaving'>(wantGlow ? 'on' : 'off');
  const [generation, setGeneration] = useState(0);
  if (wantGlow && phase !== 'on') {
    setPhase('on');
    if (phase === 'leaving') setGeneration((g) => g + 1);
  } else if (!wantGlow && phase === 'on') {
    setPhase(reducedMotion ? 'off' : 'leaving');
  } else if (reducedMotion && phase === 'leaving') {
    setPhase('off');
  }
  const gone = useCallback(() => setPhase('off'), []);

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
      {phase !== 'off' ? <Glow key={generation} timing={glowTiming} leaving={phase === 'leaving'} onGone={gone} /> : null}
      <span className={styles.face}>{children}</span>
    </button>
  );
}
