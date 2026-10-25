import type { IntensityScale } from '../db/types';
import { toWord } from './intensity';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad2 = (n: number) => String(n).padStart(2, '0');
const wholeSeconds = (ms: number) => Math.max(0, Math.round(ms / 1000));

/** "58s", "4m 10s", "5m 05s", "4m", "1 h 15 m", "2 h". */
export function formatDuration(ms: number): string {
  const total = wholeSeconds(ms);
  if (total < 60) return `${total}s`;
  if (total < 3600) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return s === 0 ? `${m}m` : `${m}m ${pad2(s)}s`;
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

/** Button timer: "0:48", "3:42", "1:02:05". Seconds are floored so it never runs ahead. */
export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/** 24-hour local time, "23:44". */
export function formatClock(epoch: number): string {
  const d = new Date(epoch);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "Sun 25 Oct". */
export function formatDateShort(epoch: number): string {
  const d = new Date(epoch);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatTimeRange(start: number, end: number | null): string {
  return end === null ? `${formatClock(start)} – now` : `${formatClock(start)}–${formatClock(end)}`;
}

/** "40 m", "2 h 19 m", "2 h". */
export function formatSessionLength(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** For screen readers: "3 minutes 42 seconds", "1 hour 2 minutes". */
export function formatSpoken(ms: number): string {
  const total = wholeSeconds(ms);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m === 0 ? unit(h, 'hour') : `${unit(h, 'hour')} ${unit(m, 'minute')}`;
  if (m > 0) return s === 0 ? unit(m, 'minute') : `${unit(m, 'minute')} ${unit(s, 'second')}`;
  return unit(s, 'second');
}

/** "today" | "yesterday" | "5 days ago" | "never", by local calendar day. */
export function formatRelativeDays(then: number | null, now: number): string {
  if (then === null) return 'never';
  const midnight = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((midnight(now) - midnight(then)) / 86_400_000);
  if (days <= 0) return 'today';
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** "4.5 min", "5 min". */
export function formatSummaryMinutes(ms: number): string {
  return `${Number((ms / 60_000).toFixed(1))} min`;
}

/** "55 s". */
export function formatSummarySeconds(ms: number): string {
  return `${wholeSeconds(ms)} s`;
}

export function formatIntensity(value: number | null, scale: IntensityScale): string {
  if (value === null) return '—';
  if (scale === 'words') return toWord(value);
  if (scale === 'numeric') return String(value);
  return `${toWord(value)} · ${value}`;
}

/** "every 4–6 min" or "every 5 min". */
export function formatRegularityRange([lo, hi]: [number, number]): string {
  return lo === hi ? `every ${lo} min` : `every ${lo}–${hi} min`;
}

/** ISO 8601 local time with offset, e.g. 2026-10-25T23:31:05+00:00. */
export function toLocalIso(epoch: number): string {
  const d = new Date(epoch);
  const offset = -d.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return `${date}T${time}${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}
