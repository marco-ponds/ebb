export const MAX_SELECTED = 3;
export const MIN_SELECTED = 2;
export const LIMIT_HINT = 'Up to three at a time';

export interface SelectionResult {
  selected: string[];
  /** True when the tap was refused because three sessions are already picked. */
  blocked: boolean;
}

/** Toggle `id` in the selection, keeping pick order; a fourth pick is refused. */
export function toggleSelection(selected: string[], id: string): SelectionResult {
  if (selected.includes(id)) return { selected: selected.filter((s) => s !== id), blocked: false };
  if (selected.length >= MAX_SELECTED) return { selected, blocked: true };
  return { selected: [...selected, id], blocked: false };
}

export const canCompare = (count: number): boolean => count >= MIN_SELECTED && count <= MAX_SELECTED;
