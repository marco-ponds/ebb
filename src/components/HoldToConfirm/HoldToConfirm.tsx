import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useReducedMotion } from '../../lib/useReducedMotion';
import styles from './HoldToConfirm.module.css';

export interface HoldToConfirmProps {
  label: string;
  durationMs?: number;
  onConfirm: () => void;
}

const STEP_MS = 500;
const INSET = 2; // half the 4 px ring stroke
const RADIUS = 20; // matches --radius-button
const isHoldKey = (key: string) => key === ' ' || key === 'Enter';

export function HoldToConfirm({ label, durationMs = 1500, onConfirm }: HoldToConfirmProps) {
  const reducedMotion = useReducedMotion();
  const [holding, setHolding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState({ w: 300, h: 48 });
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

  // The ring is drawn in real pixels so its corners follow the button's rounded border.
  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      ref={buttonRef}
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
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
        >
          <rect
            x={INSET}
            y={INSET}
            width={Math.max(0, size.w - 2 * INSET)}
            height={Math.max(0, size.h - 2 * INSET)}
            rx={RADIUS - INSET}
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
