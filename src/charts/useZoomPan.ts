import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

type Domain = [number, number];

export interface UseZoomPanOptions {
  fullDomain: Domain;
  domain: Domain;
  onChange: (domain: Domain) => void;
  /** Called on every move frame instead of onChange; onChange then fires once when the gesture ends. */
  onPreview?: (domain: Domain) => void;
}

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 24;
const MIN_SPAN_MS = 60_000;

function clampDomain([a]: Domain, [fa, fb]: Domain, span: number): Domain {
  const max = fb - fa;
  const s = Math.min(Math.max(span, Math.min(MIN_SPAN_MS, max / 10)), max);
  const start = Math.min(Math.max(a, fa), fb - s);
  return [start, start + s];
}

interface Gesture {
  startDomain: Domain;
  startX: number;
  startDist: number;
  startMid: number;
}

/** Pinch zooms the time axis, one pointer pans, double-tap resets. Pointer events only. */
export function useZoomPan({ fullDomain, domain, onChange, onPreview }: UseZoomPanOptions) {
  const latest = useRef({ fullDomain, domain, onChange, onPreview });
  useEffect(() => {
    latest.current = { fullDomain, domain, onChange, onPreview };
  });

  const pointers = useRef(new Map<number, number>());
  const gesture = useRef<Gesture | null>(null);
  const pending = useRef<Domain | null>(null);
  const raf = useRef(0);
  const lastTap = useRef<{ at: number; x: number } | null>(null);
  const moved = useRef(false);

  const flush = useCallback(() => {
    raf.current = 0;
    const next = pending.current;
    if (!next) return;
    const { onChange: change, onPreview: preview } = latest.current;
    if (preview) preview(next);
    else {
      pending.current = null;
      change(next);
    }
  }, []);

  const schedule = useCallback(
    (next: Domain) => {
      pending.current = next;
      if (!raf.current) raf.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    [],
  );

  const begin = (rect: DOMRect) => {
    const xs = [...pointers.current.values()];
    gesture.current = {
      startDomain: pending.current ?? latest.current.domain,
      startX: xs[0] - rect.left,
      startDist: xs.length > 1 ? Math.abs(xs[1] - xs[0]) : 0,
      startMid: xs.length > 1 ? (xs[0] + xs[1]) / 2 - rect.left : xs[0] - rect.left,
    };
  };

  const onPointerDown = (e: ReactPointerEvent<Element>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (pointers.current.size === 0) {
      const now = Date.now();
      const prev = lastTap.current;
      if (prev && now - prev.at < DOUBLE_TAP_MS && Math.abs(e.clientX - prev.x) < DOUBLE_TAP_PX) {
        lastTap.current = null;
        latest.current.onChange(latest.current.fullDomain);
        return;
      }
      moved.current = false;
    }
    pointers.current.set(e.pointerId, e.clientX);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pending.current = null;
    begin(rect);
  };

  const onPointerMove = (e: ReactPointerEvent<Element>) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, e.clientX);
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width || 1;
    const { startDomain, startX, startDist, startMid } = gesture.current;
    const startSpan = startDomain[1] - startDomain[0];
    const xs = [...pointers.current.values()];
    let next: Domain;
    if (xs.length >= 2 && startDist > 0) {
      const dist = Math.abs(xs[1] - xs[0]) || 1;
      const span = startSpan * (startDist / dist);
      const f = startMid / width;
      const anchor = startDomain[0] + f * startSpan;
      const mid = (xs[0] + xs[1]) / 2 - rect.left;
      const fNow = mid / width;
      next = clampDomain([anchor - fNow * span, anchor - fNow * span + span], latest.current.fullDomain, span);
    } else {
      const dx = xs[0] - rect.left - startX;
      if (Math.abs(dx) > 2) moved.current = true;
      const shift = -(dx / width) * startSpan;
      next = clampDomain([startDomain[0] + shift, startDomain[1] + shift], latest.current.fullDomain, startSpan);
    }
    schedule(next);
  };

  const end = (e: ReactPointerEvent<Element>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (wasSingle && !moved.current) lastTap.current = { at: Date.now(), x: e.clientX };
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
    const final = pending.current;
    if (final) {
      pending.current = null;
      latest.current.onChange(final);
    }
    if (pointers.current.size > 0) begin(e.currentTarget.getBoundingClientRect());
    else gesture.current = null;
  };

  return {
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      style: { touchAction: 'none' as const },
    },
  };
}
