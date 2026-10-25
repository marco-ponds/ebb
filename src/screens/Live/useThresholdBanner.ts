import { useCallback, useEffect, useRef, useState } from 'react';
import { markThresholdMet } from '../../db/sessions';
import type { Contraction, Session, Threshold } from '../../db/types';
import { evaluateBanner } from './liveLogic';

const EVERY_MS = 60_000;

/**
 * Evaluates the user's thresholds whenever the contractions or thresholds change (a contraction ending and an edit
 * both change them) and every 60 s. Dismissals live in memory and last until the rule stops holding.
 */
export function useThresholdBanner(session: Session, contractions: Contraction[], thresholds: Threshold[]) {
  const [shown, setShown] = useState<Threshold | null>(null);
  const dismissed = useRef<Set<string>>(new Set());
  const marked = useRef<string | null>(null);
  const { id: sessionId, thresholdMetAt } = session;

  const evaluate = useCallback(() => {
    const now = Date.now();
    const result = evaluateBanner(thresholds, contractions, now, dismissed.current);
    dismissed.current = result.dismissed;
    setShown(result.shown);
    if (result.held.length > 0 && thresholdMetAt === null && marked.current !== sessionId) {
      marked.current = sessionId;
      void markThresholdMet(sessionId, now);
    }
  }, [thresholds, contractions, sessionId, thresholdMetAt]);

  useEffect(() => {
    evaluate();
    const timer = setInterval(evaluate, EVERY_MS);
    return () => clearInterval(timer);
  }, [evaluate]);

  const dismiss = useCallback(() => {
    if (!shown) return;
    dismissed.current = new Set(dismissed.current).add(shown.id);
    evaluate();
  }, [shown, evaluate]);

  return { shown, dismiss };
}
