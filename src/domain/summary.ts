import type { Contraction, EbbEvent } from '../db/types';
import { eventSentence } from './events';
import { formatSummaryMinutes, formatSummarySeconds } from './format';
import { summarizeWindow } from './metrics';

const HOUR = 3_600_000;

export interface SummaryInput {
  contractions: Contraction[];
  events: EbbEvent[];
  now: number;
  scope: 'last-hour' | 'whole';
  sessionStart: number;
  sessionEnd: number | null;
}

/** The shareable text summary (SH-01). */
export function summaryText(input: SummaryInput): string {
  const { scope, now } = input;
  const from = scope === 'last-hour' ? now - HOUR : input.sessionStart;
  const to = scope === 'last-hour' ? now : (input.sessionEnd ?? now);
  const s = summarizeWindow(input.contractions, from, to);

  let text = `${scope === 'last-hour' ? 'Last hour' : 'Whole session'}: ${s.count} ${s.count === 1 ? 'contraction' : 'contractions'}`;
  if (s.avgInterval !== null) text += `, every ${formatSummaryMinutes(s.avgInterval)}`;
  if (s.avgDuration !== null) text += `, lasting about ${formatSummarySeconds(s.avgDuration)}`;
  if (s.avgIntensity !== null) text += `, strength about ${Math.round(s.avgIntensity)}/10`;
  text += '.';

  const sentences = input.events
    .filter((e) => e.deletedAt == null)
    .sort((a, b) => a.at - b.at)
    .map(eventSentence);
  return [text, ...sentences].join(' ');
}
