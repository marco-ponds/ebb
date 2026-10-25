import type { Contraction, EbbEvent } from '../db/types';
import { toLocalIso } from './format';

const HEADER = 'type,start,end,duration_s,interval_s,intensity,note';

function field(value: string | number | null): string {
  if (value === null) return '';
  // Free text that starts like a formula would run in Excel/Sheets: a leading ' keeps it text (OWASP CSV injection).
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

interface Entry {
  at: number;
  order: number;
  cells: Array<string | number | null>;
}

/** CSV export (SH-03): RFC 4180, CRLF line endings, local ISO times with offset. */
export function toCsv(contractions: Contraction[], events: EbbEvent[]): string {
  const live = contractions.filter((x) => x.deletedAt == null).sort((a, b) => a.startAt - b.startAt);
  const entries: Entry[] = live.map((x, i) => ({
    at: x.startAt,
    order: 0,
    cells: [
      'contraction',
      toLocalIso(x.startAt),
      x.endAt === null ? null : toLocalIso(x.endAt),
      x.endAt === null ? null : Math.round((x.endAt - x.startAt) / 1000),
      i === 0 ? null : Math.round((x.startAt - live[i - 1].startAt) / 1000),
      x.intensity,
      x.note,
    ],
  }));
  for (const e of events) {
    if (e.deletedAt != null) continue;
    const note = [e.details, e.note].filter((v): v is string => !!v).join('; ');
    entries.push({ at: e.at, order: 1, cells: [e.type, toLocalIso(e.at), null, null, null, null, note || null] });
  }
  entries.sort((a, b) => a.at - b.at || a.order - b.order);
  return [HEADER, ...entries.map((e) => e.cells.map(field).join(','))].join('\r\n');
}
