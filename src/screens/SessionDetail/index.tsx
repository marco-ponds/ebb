import { useEffect, useMemo, useState } from 'react';
import { goBack } from '../../app/router';
import { Button, Skeleton, SummarySheet } from '../../components';
import type { Contraction, EbbEvent, Session } from '../../db/types';
import { deleteContraction } from '../../db/contractions';
import { deleteEvent } from '../../db/events';
import { countedContractions, computeSessionMetrics } from '../../domain/metrics';
import { summaryText } from '../../domain/summary';
import { displayName } from '../../domain/naming';
import { useContractions, useEvents, useSession, useSettings } from '../../state/hooks';
import { Actions } from './Actions';
import { AddMissedSheet } from './AddMissedSheet';
import { buildChartModel } from './chartData';
import { ChartsSection } from './ChartsSection';
import { DetailHeader } from './DetailHeader';
import { deletedToast, EditContractionSheet } from './EditContractionSheet';
import { EditEventSheet } from './EditEventSheet';
import { exportCsv, exportPdf } from './exporting';
import { ExportSheet } from './ExportSheet';
import { LogTable } from './LogTable';
import { ENOUGH, buildLog, detailStats, type LogRow } from './model';
import { Notes } from './Notes';
import { PatternCard } from './PatternCard';
import { SummaryCards } from './SummaryCards';
import { Plus } from 'lucide-react';
import styles from './SessionDetail.module.css';

const HOUR = 3_600_000;
const SLICE_MS = 15_000;

/** Wall-clock time, refreshed every 15 s while `on`, so charts and averages don't relayout every second. */
function useSlicedNow(on: boolean): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const i = setInterval(() => setT(Date.now()), SLICE_MS);
    return () => clearInterval(i);
  }, [on]);
  return t;
}

function NotFound() {
  return (
    <main className={styles.screen}>
      <div className={styles.notFound}>
        <h1 className={styles.notFoundText}>This session isn't here any more</h1>
        <Button variant="secondary" onClick={() => goBack('#/history')}>
          Back
        </Button>
      </div>
    </main>
  );
}

export function SessionDetailScreen({ id }: { id: string }) {
  const session = useSession(id);
  const contractions = useContractions(id);
  const events = useEvents(id);
  if (session === undefined || contractions === undefined || events === undefined) return <Skeleton />;
  if (session === null) return <NotFound />;
  return <Detail key={session.id} session={session} contractions={contractions} events={events} />;
}

type Target = { kind: 'contraction' | 'event'; id: string } | null;

function Detail({ session, contractions, events }: { session: Session; contractions: Contraction[]; events: EbbEvent[] }) {
  const settings = useSettings();
  const active = session.endedAt === null;
  const tick = useSlicedNow(active);
  const [target, setTarget] = useState<Target>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const end = useMemo(() => {
    let newest = session.startedAt;
    for (const c of contractions) newest = Math.max(newest, c.startAt, c.endAt ?? 0);
    for (const e of events) newest = Math.max(newest, e.at);
    return Math.max(session.endedAt ?? tick, newest);
  }, [session.startedAt, session.endedAt, tick, contractions, events]);

  const stats = useMemo(() => detailStats(contractions, end, active, session.startedAt), [contractions, end, active, session.startedAt]);
  // An ended session is described at its last contraction, so "the last hour" means the hour before it stopped.
  const patternTo = useMemo(
    () => (active ? end : contractions.reduce((max, c) => Math.max(max, c.endAt ?? c.startAt), session.startedAt)),
    [active, end, contractions, session.startedAt],
  );
  const pattern = useMemo(
    () => computeSessionMetrics(contractions, events, { from: active ? end - HOUR : session.startedAt, to: patternTo }),
    [contractions, events, active, end, patternTo, session.startedAt],
  );
  const patternEnough = useMemo(
    () => countedContractions(contractions).filter((p) => p.startAt >= (active ? end - HOUR : session.startedAt)).length >= ENOUGH,
    [contractions, active, end, session.startedAt],
  );
  const model = useMemo(() => buildChartModel(session, contractions, events, end), [session, contractions, events, end]);
  const log = useMemo(() => buildLog(contractions, events), [contractions, events]);

  const summary = useMemo(
    () =>
      summaryText({
        contractions,
        events,
        now: end,
        scope: active ? 'last-hour' : 'whole',
        sessionStart: session.startedAt,
        sessionEnd: session.endedAt,
      }),
    [contractions, events, end, active, session.startedAt, session.endedAt],
  );

  const makePdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      await exportPdf({
        session,
        contractions,
        events,
        scale: settings.intensityScale,
        now: end,
        summary,
        name: displayName(session, end),
      });
    } finally {
      setPdfBusy(false);
    }
  };
  const makeCsv = () => void exportCsv(session, contractions, events);

  const editRow = (row: LogRow) => setTarget({ kind: row.kind, id: row.id });
  const deleteRow = (row: LogRow) => {
    void (row.kind === 'event' ? deleteEvent(row.id) : deleteContraction(row.id)).then(deletedToast);
  };

  return (
    <main className={styles.screen}>
      <DetailHeader session={session} onExport={() => setExportOpen(true)} />
      <SummaryCards stats={stats} active={active} />
      <PatternCard regularity={pattern.regularity} progression={pattern.progression} active={active} enough={patternEnough} />
      <ChartsSection
        model={model}
        startedAt={session.startedAt}
        end={end}
        active={active}
        onEdit={(cid) => setTarget({ kind: 'contraction', id: cid })}
      />
      <LogTable rows={log} scale={settings.intensityScale} onEdit={editRow} onDelete={deleteRow} />
      <button type="button" className={styles.addMissed} onClick={() => setAddOpen(true)}>
        <Plus size={22} strokeWidth={2.4} aria-hidden="true" />
        Add a missed contraction
      </button>
      <Notes sessionId={session.id} initial={session.notes} />
      <Actions onShare={() => setShareOpen(true)} onPdf={makePdf} onCsv={makeCsv} pdfBusy={pdfBusy} />

      <EditContractionSheet
        contraction={target?.kind === 'contraction' ? contractions.find((c) => c.id === target.id) : undefined}
        all={contractions}
        scale={settings.intensityScale}
        onClose={() => setTarget(null)}
      />
      <EditEventSheet event={target?.kind === 'event' ? events.find((e) => e.id === target.id) : undefined} onClose={() => setTarget(null)} />
      <AddMissedSheet open={addOpen} onClose={() => setAddOpen(false)} sessionId={session.id} all={contractions} end={end} />
      <ExportSheet open={exportOpen} onClose={() => setExportOpen(false)} onPdf={makePdf} onCsv={makeCsv} pdfBusy={pdfBusy} />
      <SummarySheet open={shareOpen} onClose={() => setShareOpen(false)} text={summary} />
    </main>
  );
}
