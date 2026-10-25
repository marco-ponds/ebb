import type { OverlayRecord } from '../db/queue';

/** Applies pending (not yet committed) records on top of rows read from the database: replace by id, add, or remove. */
export function mergeOverlay<T extends { id: string }>(rows: readonly T[], overlay: readonly OverlayRecord[], table: OverlayRecord['table']): T[] {
  const mine = overlay.filter((o) => o.table === table);
  if (mine.length === 0) return [...rows];
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const o of mine) {
    if (o.value === null) byId.delete(o.id);
    else byId.set(o.id, o.value as unknown as T);
  }
  return [...byId.values()];
}
