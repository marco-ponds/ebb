/**
 * The three slots LiveScreen fills: the strength picker (rating layout), the action row (Undo / Started by mistake /
 * Event / Share) and the end-session control (hold to end). Each receives the live context. LiveScreen hides the end
 * slot while contracting; the action row shows in both states; while `useRatingActive` is true the stat cards, averages,
 * pattern line, mini timeline and end slot are hidden.
 */
import { useEffect, useRef } from 'react';
import { HoldToConfirm, StrengthPicker } from '../../components';
import { rateContraction } from '../../db/contractions';
import type { Contraction, EbbEvent, Session, Settings } from '../../db/types';
import { formatDuration } from '../../domain/format';
import { ActionRow } from './ActionRow';
import { ratingOpenedAt, setRatingFor, useRatingFor } from './rating';

/** A contraction that ended longer ago than this when the card opened was never "just now" (e.g. stale state catching up). */
const JUST_ENDED_MS = 10_000;

export interface LiveSlotContext {
  session: Session;
  contractions: Contraction[];
  events: EbbEvent[];
  activeContraction: Contraction | null;
  settings: Settings;
  now: number;
  /** Opens the shared "End this session?" sheet. */
  openEndSession: () => void;
}

/** The finished contraction the card is open for, if it still exists. */
function ratingTarget(ctx: LiveSlotContext, id: string | null): Contraction | null {
  if (id === null || ctx.activeContraction) return null;
  return ctx.contractions.find((c) => c.id === id && c.endAt !== null && c.endAt >= ratingOpenedAt() - JUST_ENDED_MS) ?? null;
}

/** True while the strength picker is open (screenshot 03 layout). Opens when the active contraction ends. */
export function useRatingActive(ctx: LiveSlotContext): boolean {
  const id = useRatingFor();
  const previous = useRef<string | null>(ctx.activeContraction?.id ?? null);
  const activeId = ctx.activeContraction?.id ?? null;
  useEffect(() => {
    if (activeId !== null) setRatingFor(null); // a new contraction closes the card at once
    else if (previous.current !== null) setRatingFor(previous.current); // one just ended (or was discarded: no row, no card)
    previous.current = activeId;
  }, [activeId]);
  useEffect(() => () => setRatingFor(null), []);
  return ratingTarget(ctx, id) !== null;
}

/** The strength picker card; shown above the hero while rating. */
export function RatingSlot(ctx: LiveSlotContext) {
  const target = ratingTarget(ctx, useRatingFor());
  if (!target || target.endAt === null) return null;
  const close = () => setRatingFor(null);
  return (
    <StrengthPicker
      key={target.id}
      scale={ctx.settings.intensityScale}
      durationLabel={formatDuration(target.endAt - target.startAt)}
      onChoose={(value) => {
        close();
        void rateContraction(target.id, value);
      }}
      onSkip={close}
      onAutoClose={close}
    />
  );
}

/** Undo / Started by mistake / Event / Share. */
export function ActionRowSlot(ctx: LiveSlotContext) {
  return <ActionRow {...ctx} />;
}

/** Press-and-hold-to-end control; resting only. */
export function EndSlot(ctx: LiveSlotContext) {
  return <HoldToConfirm label="Press and hold to end session" onConfirm={ctx.openEndSession} />;
}
