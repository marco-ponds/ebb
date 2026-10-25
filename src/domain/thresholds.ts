import type { Contraction, Threshold } from '../db/types';
import { allStarts, countedContractions, deriveRows } from './metrics';

const MIN = 60_000;
const HOUR = 60 * MIN;
const TOLERANCE_MS = 5000;

export function thresholdName(t: Threshold): string {
  const label = t.label?.trim();
  if (label) return label;
  return t.kind === 'n-in-m' ? `${t.n} in ${t.minutes} min` : `${t.apartMin}-${t.lastingMin}-${t.hours}`;
}

const WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];
const word = (n: number) => WORDS[n] ?? String(n);
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

export function thresholdDescription(t: Threshold): string {
  if (t.kind === 'n-in-m') {
    const first = word(t.n);
    const lead = first.charAt(0).toUpperCase() + first.slice(1);
    return `${lead} ${t.n === 1 ? 'contraction' : 'contractions'} within ${word(t.minutes)} ${t.minutes === 1 ? 'minute' : 'minutes'}`;
  }
  return `${t.apartMin} min apart, ${t.lastingMin} min long, for ${plural(t.hours, 'hour')}`;
}

export function evaluateThreshold(t: Threshold, cs: Contraction[], now: number): boolean {
  if (t.kind === 'n-in-m') {
    const from = now - t.minutes * MIN;
    return allStarts(cs).filter((s) => s >= from && s <= now).length >= t.n;
  }
  const from = now - t.hours * HOUR;
  const rows = deriveRows(countedContractions(cs)).filter((r) => r.c.startAt >= from && r.c.startAt <= now);
  const needed = Math.max((t.hours * 60) / t.apartMin - 1, 1);
  if (rows.length < needed) return false;
  // The first row's interval reaches back before the window, so only later rows are checked.
  return rows.every(
    (r, i) =>
      !r.isGap &&
      r.duration >= t.lastingMin * MIN - TOLERANCE_MS &&
      (i === 0 || (r.interval as number) <= t.apartMin * MIN + TOLERANCE_MS),
  );
}

/** First enabled threshold, in list order, that is currently met. */
export function firstMet(thresholds: Threshold[], cs: Contraction[], now: number): Threshold | null {
  return thresholds.find((t) => t.enabled && evaluateThreshold(t, cs, now)) ?? null;
}

export function bannerText(t: Threshold): string {
  return `Matches the threshold you set — ${thresholdName(t)}`;
}

export type CustomInput =
  | { kind: 'n-in-m'; n: number; minutes: number }
  | { kind: 'ald'; apartMin: number; lastingMin: number; hours: number };
export type CustomErrors = Partial<Record<'n' | 'minutes' | 'apartMin' | 'lastingMin' | 'hours', string>>;

const inRange = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;

export function validateCustom(input: CustomInput): CustomErrors {
  const errors: CustomErrors = {};
  const range = (field: keyof CustomErrors, v: number, lo: number, hi: number) => {
    if (!inRange(v, lo, hi)) errors[field] = `Use a number from ${lo} to ${hi}`;
  };
  if (input.kind === 'n-in-m') {
    if (!inRange(input.n, 1, 20) || !Number.isInteger(input.n)) errors.n = 'Use a whole number from 1 to 20';
    range('minutes', input.minutes, 1, 120);
  } else {
    range('apartMin', input.apartMin, 1, 30);
    range('lastingMin', input.lastingMin, 0.5, 5);
    range('hours', input.hours, 0.5, 6);
  }
  return errors;
}
