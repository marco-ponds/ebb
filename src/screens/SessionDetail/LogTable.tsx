import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Pencil } from 'lucide-react';
import { Button, Card } from '../../components';
import type { IntensityScale } from '../../db/types';
import { formatClock, formatDuration, formatIntensity } from '../../domain/format';
import { eventTitle, type LogRow } from './model';
import styles from './SessionDetail.module.css';

export const COLLAPSED_ROWS = 8;
/** Above this many rows an expanded log is virtualised. */
export const VIRTUALISE_ABOVE = 50;
const ROW_PX = 53;
const SWIPE_PX = 56;

export interface LogTableProps {
  rows: LogRow[];
  scale: IntensityScale;
  onEdit: (row: LogRow) => void;
  onDelete: (row: LogRow) => void;
}

const seconds = (ms: number | null) => (ms === null ? '…' : `${Math.round(ms / 1000)}s`);

function Row({
  row,
  scale,
  swiped,
  onSwipe,
  onEdit,
  onDelete,
  index,
  measure,
}: {
  row: LogRow;
  scale: IntensityScale;
  swiped: boolean;
  onSwipe: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  index?: number;
  measure?: (el: Element | null) => void;
}) {
  const drag = useRef<{ x: number; id: number } | null>(null);

  const down = (e: ReactPointerEvent<HTMLTableRowElement>) => {
    if ((e.target as Element).closest('button')) return;
    drag.current = { x: e.clientX, id: e.pointerId };
  };
  const move = (e: ReactPointerEvent<HTMLTableRowElement>) => {
    const d = drag.current;
    if (d && Math.abs(e.clientX - d.x) > 8) e.currentTarget.setPointerCapture?.(d.id);
  };
  const up = (e: ReactPointerEvent<HTMLTableRowElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (dx <= -SWIPE_PX) onSwipe(true);
    else if (dx >= SWIPE_PX / 2) onSwipe(false);
  };

  const action = swiped ? (
    <button type="button" className={styles.deleteAction} onClick={onDelete}>
      Delete
    </button>
  ) : (
    <button
      type="button"
      className={styles.iconAction}
      aria-label={row.kind === 'event' ? `Edit ${eventTitle(row.e)} at ${formatClock(row.at)}` : `Edit contraction at ${formatClock(row.at)}`}
      onClick={onEdit}
    >
      <Pencil size={18} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );

  return (
    <tr
      ref={measure}
      data-index={index}
      className={styles.logRow}
      data-swiped={swiped ? 'true' : 'false'}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <td className={styles.num}>
        {formatClock(row.at)}
        {row.kind === 'contraction' && row.flag ? <span className={styles.tag}>{row.flag}</span> : null}
      </td>
      {row.kind === 'event' ? (
        <td colSpan={3} className={styles.eventCell}>
          <span className={styles.ring} aria-hidden="true" />
          {eventTitle(row.e)}
        </td>
      ) : (
        <>
          <td className={styles.num}>{seconds(row.duration)}</td>
          <td className={styles.num}>{row.apart === null ? '—' : formatDuration(row.apart)}</td>
          <td>{formatIntensity(row.c.intensity, scale)}</td>
        </>
      )}
      <td className={styles.rowAction}>{action}</td>
    </tr>
  );
}

function VirtualBody(props: Omit<LogTableProps, 'rows'> & { rows: LogRow[]; swipedId: string | null; setSwiped: (id: string | null) => void; scrollMargin: number }) {
  const { rows, scrollMargin } = props;
  const v = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_PX,
    overscan: 6,
    scrollMargin,
  });
  const items = v.getVirtualItems();
  const top = items.length ? items[0].start - v.options.scrollMargin : 0;
  const bottom = items.length ? v.getTotalSize() - (items[items.length - 1].end - v.options.scrollMargin) : 0;
  return (
    <tbody>
      <tr className={styles.spacer} aria-hidden="true">
        <td colSpan={5} style={{ height: top }} />
      </tr>
      {items.map((it) => {
        const row = rows[it.index];
        return (
          <Row
            key={row.id}
            row={row}
            index={it.index}
            measure={v.measureElement}
            scale={props.scale}
            swiped={props.swipedId === row.id}
            onSwipe={(open) => props.setSwiped(open ? row.id : null)}
            onEdit={() => props.onEdit(row)}
            onDelete={() => {
              props.setSwiped(null);
              props.onDelete(row);
            }}
          />
        );
      })}
      <tr className={styles.spacer} aria-hidden="true">
        <td colSpan={5} style={{ height: Math.max(0, bottom) }} />
      </tr>
    </tbody>
  );
}

/** SD-06: contractions and events newest first, latest 8 until expanded, virtualised past 50 rows. */
export function LogTable({ rows, scale, onEdit, onDelete }: LogTableProps) {
  const [expanded, setExpanded] = useState(false);
  const [swipedId, setSwiped] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const virtual = expanded && rows.length > VIRTUALISE_ABOVE;
  const shown = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);

  return (
    <Card>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>Everything logged</h2>
        <span className={styles.cardSub}>newest first</span>
      </div>
      <table ref={tableRef} className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Start</th>
            <th scope="col">Lasting</th>
            <th scope="col">Apart</th>
            <th scope="col">Str.</th>
            <th scope="col">
              <span className={styles.srOnly}>Actions</span>
            </th>
          </tr>
        </thead>
        {virtual ? (
          <VirtualBody rows={rows} scale={scale} onEdit={onEdit} onDelete={onDelete} swipedId={swipedId} setSwiped={setSwiped} scrollMargin={scrollMargin} />
        ) : (
          <tbody>
            {shown.map((row) => (
              <Row
                key={row.id}
                row={row}
                scale={scale}
                swiped={swipedId === row.id}
                onSwipe={(open) => setSwiped(open ? row.id : null)}
                onEdit={() => onEdit(row)}
                onDelete={() => {
                  setSwiped(null);
                  onDelete(row);
                }}
              />
            ))}
          </tbody>
        )}
      </table>
      {!expanded && rows.length > COLLAPSED_ROWS ? (
        <div className={styles.showAll}>
          <Button variant="ghost" onClick={() => {
              setScrollMargin((tableRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY);
              setExpanded(true);
            }}>
            {`Show all ${rows.length} entries`}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
