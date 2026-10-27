import { useLayoutEffect, useRef } from 'react';
import styles from './StatCard.module.css';

export interface StatCardProps {
  label: string;
  value: string;
  caption?: string;
  dimmed?: boolean;
}

const MIN_FONT_PX = 32;

/** Shrinks the font from --fs-stat down to 32 px until the value fits on one line. */
function fit(el: HTMLElement) {
  el.style.fontSize = '';
  const base = parseFloat(getComputedStyle(el).fontSize) || 38;
  let size = base;
  while (size > MIN_FONT_PX && el.scrollWidth > el.clientWidth) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
}

export function StatCard({ label, value, caption, dimmed }: StatCardProps) {
  const valueRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = valueRef.current;
    if (!el) return;
    fit(el);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fit(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);

  return (
    <div className={styles.card} data-dimmed={dimmed ? 'true' : 'false'}>
      <div className={styles.label}>{label}</div>
      <div ref={valueRef} className={styles.value} style={{ whiteSpace: 'nowrap' }}>
        {value}
      </div>
      {caption ? <div className={styles.caption}>{caption}</div> : null}
    </div>
  );
}
