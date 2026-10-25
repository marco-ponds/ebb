import styles from './Chart.module.css';

export interface ChartTooltipProps {
  title: string;
  lines: string[];
  onEdit?: () => void;
}

export function ChartTooltip({ title, lines, onEdit }: ChartTooltipProps) {
  return (
    <div role="tooltip" className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{title}</div>
      {lines.map((l, i) => (
        <div key={i} className={styles.tooltipLine}>
          {l}
        </div>
      ))}
      {onEdit ? (
        <button type="button" className={styles.edit} onClick={onEdit}>
          Edit
        </button>
      ) : null}
    </div>
  );
}
