import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useReducedMotion } from '../../lib/useReducedMotion';
import styles from './HoldToConfirm.module.css';

export interface HoldToConfirmProps {
  label: string;
  durationMs?: number;
  onConfirm: () => void;
}

const STEP_MS = 500;
const isHoldKey = (key: string) => key === ' ' || key === 'Enter';

export function HoldToConfirm({ label, durationMs = 1500, onConfirm }: HoldToConfirmProps) {
  const reducedMotion = useReducedMotion();
  const [holding, setHolding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmRef = useRef(onConfirm);
  useEffect(() => {
    confirmRef.current = onConfirm;
  });

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setHolding(false);
    setElapsed(0);
  }, []);

  const start = useCallback(() => {
    if (timerRef.current) return;
    setHolding(true);
    setElapsed(0);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setHolding(false);
      setElapsed(0);
      confirmRef.current();
    }, durationMs);
  }, [durationMs]);

  useEffect(() => cancel, [cancel]);

  // Under reduced motion there is no fill, so the text counts down instead.
  useEffect(() => {
    if (!holding || !reducedMotion) return;
    const began = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - began), 100);
    return () => clearInterval(id);
  }, [holding, reducedMotion]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isHoldKey(e.key)) return;
    e.preventDefault(); // stops the native click, so a short press is not a confirmation
    if (!e.repeat) start();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!isHoldKey(e.key)) return;
    e.preventDefault();
    cancel();
  };
  const onClick = (e: MouseEvent) => {
    // detail 0: assistive-technology activation with no hold
    if (e.detail === 0) onConfirm();
  };

  const remainingMs = Math.max(0, durationMs - Math.floor(elapsed / STEP_MS) * STEP_MS);
  const text = holding && reducedMotion ? `Keep holding · ${(remainingMs / 1000).toFixed(1)} s` : label;

  return (
    <button
      type="button"
      className={styles.button}
      data-holding={holding ? 'true' : 'false'}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={cancel}
      onClick={onClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      {reducedMotion ? null : (
        <svg
          className={styles.ring}
          aria-hidden="true"
          focusable="false"
          data-fill
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <rect
            x="2"
            y="2"
            width="96"
            height="96"
            rx="18"
            vectorEffect="non-scaling-stroke"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset={holding ? 0 : 1}
            style={{ transitionDuration: holding ? `${durationMs}ms` : '120ms' }}
          />
        </svg>
      )}
      <span className={styles.text}>{text}</span>
    </button>
  );
}
