import type { EbbEvent, EventType, WatersDetail } from '../db/types';
import { formatClock } from './format';

export const EVENT_LABELS: Record<EventType, string> = {
  waters: 'Waters broke',
  bleeding: 'Bleeding',
  'reduced-movement': 'Reduced baby movement',
  'called-midwife': 'Called midwife',
  'went-to-hospital': 'Went to hospital',
  note: 'Note',
};

export const WATERS_OPTIONS: { value: WatersDetail; label: string }[] = [
  { value: 'clear', label: 'Clear' },
  { value: 'pink', label: 'Pink' },
  { value: 'green-brown', label: 'Green or brown' },
  { value: 'unsure', label: 'Not sure' },
];

const WATERS_LOWER: Record<WatersDetail, string> = {
  clear: 'clear',
  pink: 'pink',
  'green-brown': 'green or brown',
  unsure: 'not sure',
};

/** Waters detail for use inside a sentence. */
export const watersLower = (d: WatersDetail): string => WATERS_LOWER[d];

export const TIMELINE_LETTERS: Record<EventType, string> = {
  waters: 'W',
  bleeding: 'B',
  'reduced-movement': 'R',
  'called-midwife': 'M',
  'went-to-hospital': 'H',
  note: 'N',
};
/** Timeline marker for "Threshold met". */
export const THRESHOLD_LETTER = 'T';

export const GENTLE_PROMPT = "If you haven't already, contact your midwife or maternity unit.";

export function needsGentlePrompt(type: EventType, details: WatersDetail | null): boolean {
  return type === 'bleeding' || type === 'reduced-movement' || (type === 'waters' && details === 'green-brown');
}

type EventLike = Pick<EbbEvent, 'at' | 'type' | 'details' | 'note'>;

/** "Saved · Waters broke, green or brown, 23:30". */
export function eventConfirmation(e: EventLike): string {
  const detail = e.details ? `, ${WATERS_LOWER[e.details]}` : '';
  return `Saved · ${EVENT_LABELS[e.type]}${detail}, ${formatClock(e.at)}`;
}

/** "Waters broke 23:30, clear." / "Note 23:10: had a bath." */
export function eventSentence(e: EventLike): string {
  const detail = e.details ? `, ${WATERS_LOWER[e.details]}` : '';
  const note = e.note?.trim();
  const text = `${EVENT_LABELS[e.type]} ${formatClock(e.at)}${detail}${note ? `: ${note}` : ''}`;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
