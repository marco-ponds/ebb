/**
 * The three slots LiveScreen fills: the strength picker (rating layout), the action row (Undo / Started by mistake /
 * Event / Share) and the end-session control (hold to end). Each receives the live context. LiveScreen hides the end
 * slot while contracting; the action row shows in both states; while `useRatingActive` is true the stat cards, averages,
 * pattern line, mini timeline and end slot are hidden.
 */
import { useEffect } from 'react';
import { HoldToConfirm, StrengthPicker, showToast } from '../../components';
import { rateContraction } from '../../db/contractions';
import type { Contraction, EbbEvent, Session, Settings } from '../../db/types';
import { formatDuration } from '../../domain/format';
import { ActionRow } from './ActionRow';
import { DIDNT_SAVE, setRatingFor, useRatingFor } from './rating';

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
  return ctx.contractions.find((c) => c.id === id && c.endAt !== null) ?? null;
}

/** True while the strength picker is open (screenshot 03 layout). A stop in this view opens it; a new contraction closes it. */
export function useRatingActive(ctx: LiveSlotContext): boolean {
  const id = useRatingFor();
  const activeId = ctx.activeContraction?.id ?? null;
  useEffect(() => {
    if (activeId !== null) setRatingFor(null);
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
        rateContraction(target.id, value).catch(() => showToast({ message: DIDNT_SAVE }));
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
