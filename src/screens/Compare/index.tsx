import { useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link, goBack } from '../../app/router';
import { Timeline, TrendChart } from '../../charts';
import { Card, IconButton } from '../../components';
import { useNow } from '../../lib/useNow';
import { useSessions, useSettings } from '../../state/hooks';
import { MIN_COMPARED, parseIds, shapeCompare } from './shape';
import { useCompareContractions } from './useCompareContractions';
import styles from './Compare.module.css';

const HOUR = 3_600_000;

function Header({ subtitle }: { subtitle?: string }) {
  return (
    <header className={styles.header}>
      <IconButton label="Back" icon={<ChevronLeft size={26} strokeWidth={2.4} />} onClick={() => goBack('#/history')} />
      <div>
        <h1 className={styles.heading}>Compare</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
    </header>
  );
}

export function CompareScreen({ ids }: { ids: string[] }) {
  const sessions = useSessions();
  const settings = useSettings();
  const now = useNow();
  const chosen = useMemo(() => (sessions ? parseIds(ids, sessions) : undefined), [sessions, ids]);
  const chosenIds = useMemo(() => chosen?.map((s) => s.id) ?? [], [chosen]);
  const byId = useCompareContractions(chosenIds);

  const model = useMemo(
    () =>
      chosen && chosen.length >= MIN_COMPARED && byId
        ? shapeCompare(
            chosen.map((session) => ({ session, contractions: byId.get(session.id) ?? [] })),
            now,
            settings.intensityScale,
          )
        : null,
    [chosen, byId, now, settings.intensityScale],
  );

  if (chosen && chosen.length < MIN_COMPARED) {
    return (
      <main className={styles.screen}>
        <Header />
        <div className={styles.empty}>
          <p className={styles.emptyText}>Pick two or three sessions to compare</p>
          <Link to="#/history" className={styles.link}>
            Back to sessions
          </Link>
        </div>
      </main>
    );
  }
  if (!model) {
    return (
      <main className={styles.screen}>
        <Header />
      </main>
    );
  }

  const hours = Math.max(1, Math.ceil(model.domain[1] / HOUR));
  return (
    <main className={styles.screen}>
      <Header subtitle="Lined up from each session's start" />

      <ul className={styles.legend} aria-label="Sessions">
        {model.series.map((s) => (
          <li key={s.id} className={styles.legendRow} data-series={s.key}>
            <span className={styles.swatch} data-series={s.key} aria-hidden="true" />
            <span className={styles.legendName}>{s.name}</span>
            <span className={styles.legendDate}>{`· ${s.dateLabel}`}</span>
          </li>
        ))}
      </ul>

      <Card className={styles.card}>
        <h2 className={styles.cardTitle}>Timelines</h2>
        <div className={styles.timelines} data-hours={hours}>
          {model.series.map((s, i) => (
            <section key={s.id} className={styles.timeline} data-series={s.key} aria-label={s.name}>
              <h3 className={styles.timelineName} data-series={s.key}>
                {s.name}
              </h3>
              <Timeline
                variant="compare"
                series={s.key}
                items={s.items}
                markers={[]}
                gaps={[]}
                showAxis={i === model.series.length - 1}
                domain={model.domain}
                summary={`${s.name}: ${s.metrics.contractions} contractions over ${s.metrics.length}`}
              />
            </section>
          ))}
        </div>
      </Card>

      <Card className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Time apart</h2>
          <p className={styles.cardNote}>minutes, rolling average</p>
        </div>
        <div className={styles.trend}>
          <TrendChart
            series={model.series.map((s) => ({ id: s.id, points: s.points, line: s.line, style: s.style, tone: s.tone }))}
            domain={model.domain}
            relative
            yUnit="min"
            summary={`Time apart in minutes, rolling average of 4, for ${model.series.map((s) => s.name).join(', ')}`}
          />
        </div>
      </Card>

      <Card className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <td />
              {model.series.map((s) => (
                <th key={s.id} scope="col" className={styles.colHead} data-series={s.key}>
                  {s.heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, field]) => (
              <tr key={field}>
                <th scope="row" className={styles.rowHead}>
                  {label}
                </th>
                {model.series.map((s) => (
                  <td key={s.id} className={styles.cell}>
                    {s.metrics[field]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}

const ROWS = [
  ['Length', 'length'],
  ['Contractions', 'contractions'],
  ['Time apart', 'apart'],
  ['Lasting', 'lasting'],
  ['Strength', 'strength'],
  ['Pattern', 'pattern'],
] as const;
