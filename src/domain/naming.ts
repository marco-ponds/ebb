import type { Session } from '../db/types';

export type PartOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function partOfDay(epoch: number): PartOfDay {
  const h = new Date(epoch).getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

/** "{Weekday} {part}" from the start time, so a session past midnight keeps its start day. */
export function defaultSessionName(startedAt: number): string {
  return `${WEEKDAYS[new Date(startedAt).getDay()]} ${partOfDay(startedAt)}`;
}

/** The saved name; else, while active, a relative name ("Tonight"); else the default name. */
export function displayName(session: Pick<Session, 'name' | 'startedAt' | 'endedAt'>, now: number): string {
  const name = session.name?.trim();
  if (name) return name;
  if (session.endedAt === null) {
    const part = partOfDay(now);
    return part === 'morning' ? 'This morning' : part === 'afternoon' ? 'This afternoon' : 'Tonight';
  }
  return defaultSessionName(session.startedAt);
}
