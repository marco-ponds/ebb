import { useState, type KeyboardEvent, type ReactNode, type RefObject, type SVGProps } from 'react';
import { ChartTooltip } from './ChartTooltip';
import styles from './Chart.module.css';

export interface ChartTarget {
  id: string;
  x: number;
  /** built only for the active target, so large charts stay cheap to render */
  describe: () => { title: string; lines: string[] };
  /** id passed to onSelect when Edit or Enter is used; omit for read-only targets */
  selectId?: string;
}

export interface ChartContext {
  activeId: string | null;
  activate: (id: string) => void;
}

interface ChartProps {
  wrapRef: RefObject<HTMLDivElement>;
  width: number;
  height: number;
  summary: string;
  targets: ChartTarget[];
  onSelect?: (id: string) => void;
  svgProps?: SVGProps<SVGSVGElement>;
  legend?: ReactNode;
  children: (ctx: ChartContext) => ReactNode;
}

/** Shared frame: role="img" SVG, one keyboard tab stop with arrow navigation, and the tooltip. */
export function Chart({ wrapRef, width, height, summary, targets, onSelect, svgProps, legend, children }: ChartProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = targets.find((t) => t.id === activeId) ?? null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setActiveId(null);
      return;
    }
    if (e.key === 'Enter' && active?.selectId !== undefined && onSelect) {
      e.preventDefault();
      onSelect(active.selectId);
      return;
    }
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir || targets.length === 0) return;
    e.preventDefault();
    const at = active ? targets.indexOf(active) : dir > 0 ? -1 : targets.length;
    const next = Math.min(targets.length - 1, Math.max(0, at + dir));
    setActiveId(targets[next].id);
  };

  const selectId = active?.selectId;
  const text = active?.describe();
  return (
    <div ref={wrapRef} className={styles.wrap}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- one tab stop with arrow-key browsing */}
      <div
        className={styles.region}
        role="group"
        aria-label="Browse the chart with the left and right arrow keys; Enter edits the selected item"
        tabIndex={targets.length > 0 ? 0 : undefined}
        onKeyDown={onKeyDown}
      >
        <svg
          {...svgProps}
          className={styles.svg}
          role="img"
          aria-label={summary}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveId(null);
          }}
        >
          {children({ activeId, activate: setActiveId })}
        </svg>
      </div>
      {active ? (
        <div className={styles.tooltipSlot} style={{ left: Math.min(Math.max(active.x, 70), Math.max(70, width - 70)) }}>
          <ChartTooltip
            title={text!.title}
            lines={text!.lines}
            onEdit={onSelect && selectId !== undefined ? () => onSelect(selectId) : undefined}
          />
        </div>
      ) : null}
      {legend}
    </div>
  );
}
