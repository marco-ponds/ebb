/**
 * Slots Task 8 fills: the strength picker (rating layout), the action row (Undo / Started by mistake / Event / Share)
 * and the end-session control (hold to end). Each receives the live context. Task 6 renders them but they are empty.
 * Rendering rules live in LiveScreen: the end slot is hidden while contracting; the action row shows in both states;
 * while `useRatingActive` is true the stat cards, averages, pattern line, mini timeline and end slot are hidden.
 */
import type { Contraction, EbbEvent, Session, Settings } from '../../db/types';

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

/** True while the strength picker is open (screenshot 03 layout). */
export const useRatingActive: (ctx: LiveSlotContext) => boolean = () => false;

/** The strength picker card; shown above the hero while rating. */
export const RatingSlot: (props: LiveSlotContext) => null = () => null;

/** Undo / Started by mistake / Event / Share. */
export const ActionRowSlot: (props: LiveSlotContext) => null = () => null;

/** Press-and-hold-to-end control; resting only. */
export const EndSlot: (props: LiveSlotContext) => null = () => null;
