import { useMemo } from 'react';
import { Link } from '../../app/router';
import { Timeline } from '../../charts';
import type { TimelineMarker } from '../../charts';
import type { Contraction, EbbEvent, Session } from '../../db/types';
import { EVENT_LABELS, THRESHOLD_LETTER, TIMELINE_LETTERS } from '../../domain/events';
import { formatClock } from '../../domain/format';
import { allStarts, type LiveMetrics } from '../../domain/metrics';
import { eventShort } from './liveLogic';
import styles from './Live.module.css';

const HOUR = 3_600_000;

export interface MiniTimelineProps {
  session: Session;
  contractions: Contraction[];
  events: EbbEvent[];
  metrics: LiveMetrics;
  now: number;
}

export function MiniTimeline({ session, contractions, events, metrics, now }: MiniTimelineProps) {
  const from = now - HOUR;
  const domain = useMemo<[number, number]>(() => [from, now], [from, now]);
  const items = useMemo(() => metrics.lastHour.map((p) => ({ ...p })), [metrics.lastHour]);
  const inWindow = useMemo(() => events.filter((e) => e.at >= from && e.at <= now), [events, from, now]);
  const markers = useMemo<TimelineMarker[]>(() => {
    const list: TimelineMarker[] = inWindow.map((e) => ({
      id: e.id,
      at: e.at,
      letter: TIMELINE_LETTERS[e.type],
      label: EVENT_LABELS[e.type],
      kind: 'event',
    }));
    const met = session.thresholdMetAt;
    if (met !== null && met >= from && met <= now) {
      list.push({ id: 'threshold-met', at: met, letter: THRESHOLD_LETTER, label: 'Threshold met', kind: 'threshold' });
    }
    return list;
  }, [inWindow, session.thresholdMetAt, from, now]);

  const count = allStarts(contractions).filter((s) => s >= from && s <= now).length;
  const latest = inWindow[inWindow.length - 1];
  const right = `${count} ${count === 1 ? 'contraction' : 'contractions'}${
    latest ? ` · ${eventShort(latest.type)} ${formatClock(latest.at)}` : ''
  }`;

  return (
    <section className={styles.timeline} aria-label="Last hour">
      <Link to={`#/session/${session.id}`} className={styles.timelineCaption}>
        <span>Last hour</span>
        <span>{right}</span>
      </Link>
      <div className={styles.timelineChart}>
        <Timeline
          variant="mini"
          items={items}
          markers={markers}
          gaps={[]}
          domain={domain}
          now={now}
          summary={`Last hour: ${right}`}
        />
      </div>
    </section>
  );
}
