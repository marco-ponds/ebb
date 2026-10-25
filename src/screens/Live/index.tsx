import { useMemo, useState } from 'react';
import { useWakeLockState } from '../../app/wakeLock';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useNow } from '../../lib/useNow';
import { useAppStore } from '../../state/store';
import { useContractions, useEvents, useSettings, useStorageStatus } from '../../state/hooks';
import type { Contraction, EbbEvent, Session } from '../../db/types';
import { countedContractions, computeLiveMetrics, ENOUGH } from '../../domain/metrics';
import { EndSessionSheet } from './EndSessionSheet';
import { AveragesCard, PatternLine, StatCards } from './Insights';
import { LiveHeader } from './LiveHeader';
import { LiveHero } from './LiveHero';
import { LiveLayout } from './LiveLayout';
import { pausedMs, staleMinutes } from './liveLogic';
import { MenuSheet } from './MenuSheet';
import { MiniTimeline } from './MiniTimeline';
import { Button } from '../../components';
import { Notice, PausedCard, StaleCard, StorageNotices } from './Notices';
import { ActionRowSlot, EndSlot, RatingSlot, useRatingActive, type LiveSlotContext } from './slots';
import { ThresholdBanner } from './ThresholdBanner';
import { useContractionToggle } from './useContractionToggle';
import { useThresholdBanner } from './useThresholdBanner';
import styles from './Live.module.css';

export { EndSessionSheet } from './EndSessionSheet';
export type { EndSessionSheetProps } from './EndSessionSheet';
export { LiveLayout } from './LiveLayout';
export type { LiveLayoutSlots } from './LiveLayout';
export type { LiveSlotContext } from './slots';

const NONE_C: Contraction[] = [];
const NONE_E: EbbEvent[] = [];
const METRICS_EVERY_MS = 15_000;

export function LiveScreen() {
  const ready = useAppStore((s) => s.ready);
  const session = useAppStore((s) => s.activeSession);
  // Route guards (landing rules) decide where to go without a session; until then there is only a heading for assistive tech.
  if (!ready || !session) {
    return (
      <main>
        <h1 className={styles.srOnly}>Live</h1>
      </main>
    );
  }
  return <LiveSession key={session.id} session={session} />;
}

function LiveSession({ session }: { session: Session }) {
  const now = useNow();
  const settings = useSettings();
  const storage = useStorageStatus();
  const reducedMotion = useReducedMotion();
  const contractions = useContractions(session.id) ?? NONE_C;
  const events = useEvents(session.id) ?? NONE_E;
  const active = useAppStore((s) => s.activeContraction);
  const wakeLock = useWakeLockState();
  const { toggle, announcement, problem, clearProblem } = useContractionToggle(session.id, active, settings.haptics);
  const banner = useThresholdBanner(session, contractions, settings.thresholds);

  const [menuOpen, setMenuOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [keptTiming, setKeptTiming] = useState<string | null>(null);
  const [pausedHiddenFor, setPausedHiddenFor] = useState<number | null>(null);

  // Rolling stats recompute on every tap (new array) and every 15 s. `at` never trails the newest contraction.
  const newest = contractions.reduce((max, c) => Math.max(max, c.startAt, c.endAt ?? 0), 0);
  const slice = Math.floor(now / METRICS_EVERY_MS);
  const metricsAt = Math.max(slice * METRICS_EVERY_MS, newest + 1);
  const metrics = useMemo(() => computeLiveMetrics(contractions, metricsAt), [contractions, metricsAt]);
  const enough = useMemo(() => countedContractions(contractions).length >= ENOUGH, [contractions]);

  const contracting = active !== null;
  const lastStartAt = contractions.length ? Math.max(...contractions.map((c) => c.startAt)) : null;

  const ctx: LiveSlotContext = {
    session,
    contractions,
    events,
    activeContraction: active,
    settings,
    now,
    openEndSession: () => setEndOpen(true),
  };
  const rating = useRatingActive(ctx);
  const showInsights = !contracting && !rating;

  const stale = staleMinutes(active, now);
  const paused = pausedMs(contractions, active, now);
  const showPaused = paused !== null && pausedHiddenFor !== lastStartAt;
  const glow = settings.breathingGlow && !reducedMotion;

  return (
    <LiveLayout
      contracting={contracting}
      header={
        <LiveHeader
          session={session}
          now={now}
          wakeLock={wakeLock}
          storageStatus={storage.status}
          dimmed={contracting}
          onMenu={() => setMenuOpen(true)}
        />
      }
      banner={banner.shown ? <ThresholdBanner threshold={banner.shown} onDismiss={banner.dismiss} /> : null}
      notices={
        <>
          {problem ? (
            <Notice
              actions={
                <Button variant="secondary" onClick={clearProblem}>
                  OK
                </Button>
              }
            >
              {problem}
            </Notice>
          ) : null}
          <StorageNotices status={storage.status} conflictCount={storage.conflictCount} />
          {active && stale !== null && keptTiming !== active.id ? (
            <StaleCard active={active} minutes={stale} now={now} onKeepTiming={() => setKeptTiming(active.id)} />
          ) : null}
          {showPaused ? (
            <PausedCard sinceMs={paused} onKeepGoing={() => setPausedHiddenFor(lastStartAt)} onEnd={() => setEndOpen(true)} />
          ) : null}
        </>
      }
      rating={<RatingSlot {...ctx} />}
      stats={rating ? null : <StatCards metrics={metrics} dimmed={contracting} />}
      averages={showInsights ? <AveragesCard metrics={metrics} enough={enough} /> : null}
      pattern={showInsights ? <PatternLine metrics={metrics} enough={enough} /> : null}
      hero={<LiveHero lastStartAt={lastStartAt} active={active} now={now} glow={contracting && glow} onPress={toggle} />}
      caption={
        contracting && glow ? <p className={styles.breathe}>Breathe with the glow — in as it grows, out as it fades</p> : null
      }
      timeline={
        showInsights ? (
          <MiniTimeline session={session} contractions={contractions} events={events} metrics={metrics} now={now} />
        ) : null
      }
      actionRow={<ActionRowSlot {...ctx} />}
      endSlot={showInsights ? <EndSlot {...ctx} /> : null}
      overlay={
        <>
          <div className={styles.srOnly} aria-live="polite" data-testid="announcer">
            {announcement}
          </div>
          <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
          <EndSessionSheet
            open={endOpen}
            onClose={() => setEndOpen(false)}
            sessionId={session.id}
            count={contractions.length}
            lengthMs={now - session.startedAt}
          />
        </>
      }
    />
  );
}
