import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import styles from './StrengthPicker.module.css';

export interface StrengthPickerProps {
  scale: 'words' | 'numeric' | 'both';
  title?: string;
  durationLabel: string;
  onChoose: (value: number) => void;
  onSkip: () => void;
  onAutoClose: () => void;
  autoCloseMs?: number;
}

const WORDS: Array<{ label: string; value: number; dot: number }> = [
  { label: 'Mild', value: 2, dot: 14 },
  { label: 'Medium', value: 4, dot: 22 },
  { label: 'Strong', value: 6, dot: 30 },
  { label: 'Very strong', value: 8, dot: 38 },
  { label: 'Intense', value: 10, dot: 46 },
];
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const TICK_MS = 250;

export function StrengthPicker({
  scale,
  title = 'How strong was that one?',
  durationLabel,
  onChoose,
  onSkip,
  onAutoClose,
  autoCloseMs = 30000,
}: StrengthPickerProps) {
  const titleId = useId();
  const [remaining, setRemaining] = useState(autoCloseMs);
  const pausedRef = useRef(false);
  const autoCloseRef = useRef(onAutoClose);
  useEffect(() => {
    autoCloseRef.current = onAutoClose;
  });

  useEffect(() => {
    let left = autoCloseMs;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      if (!pausedRef.current) left -= now - last;
      last = now;
      setRemaining(Math.max(0, left));
      if (left <= 0) {
        clearInterval(id);
        autoCloseRef.current();
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [autoCloseMs]);

  const onFocus = () => {
    pausedRef.current = true;
  };
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) pausedRef.current = false;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    const target = e.target as HTMLElement;
    const row = target.closest('[data-row]');
    if (!row || target.getAttribute('role') !== 'radio') return;
    const radios = Array.from(row.querySelectorAll<HTMLElement>('[role="radio"]'));
    const next = radios[(radios.indexOf(target) + dir + radios.length) % radios.length];
    e.preventDefault();
    next?.focus();
  };

  const percent = Math.round((remaining / autoCloseMs) * 100);

  return (
    <section className={styles.card} aria-labelledby={titleId} onFocus={onFocus} onBlur={onBlur}>
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <span className={styles.duration}>{durationLabel}</span>
      </div>

      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- radios inside are focusable; arrows move focus */}
      <div role="radiogroup" aria-labelledby={titleId} className={styles.groups} onKeyDown={onKeyDown}>
        {scale !== 'numeric' ? (
          <div className={styles.words} data-row="words">
            {WORDS.map((w) => (
              <button
                key={w.value}
                type="button"
                role="radio"
                aria-checked="false"
                className={styles.word}
                onClick={() => onChoose(w.value)}
              >
                <span className={styles.dot} style={{ width: w.dot, height: w.dot }} aria-hidden="true" />
                <span className={styles.wordLabel}>{w.label}</span>
              </button>
            ))}
          </div>
        ) : null}
        {scale !== 'words' ? (
          <div className={styles.numbers} data-row="numbers">
            {NUMBERS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked="false"
                className={styles.number}
                onClick={() => onChoose(n)}
              >
                {n}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.footer}>
        <div className={styles.timing}>
          <div
            role="progressbar"
            aria-label="Time left before this closes"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className={styles.track}
          >
            <div className={styles.bar} style={{ width: `${percent}%` }} />
          </div>
          <p className={styles.caption}>Closes by itself — you can rate it later</p>
        </div>
        <button type="button" className={styles.skip} onClick={onSkip}>
          Skip
        </button>
      </div>
    </section>
  );
}
