import { useMemo, useState, type ReactNode } from 'react';
import { FrequencyBars, Timeline, TrendChart, useZoomPan } from '../../charts';
import { Card, Segmented } from '../../components';
import type { ChartModel } from './chartData';
import { RANGE_OPTIONS, rangeDomain, type RangeKey } from './model';
import styles from './SessionDetail.module.css';

const STRENGTH_TICKS = [2, 6, 10];
const BUCKET_MS = 10 * 60_000;

function ChartCard({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <Card className={styles.chartCard}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{title}</h2>
        <span className={styles.cardSub}>{sub}</span>
      </div>
      {children}
    </Card>
  );
}

export interface ChartsSectionProps {
  model: ChartModel;
  startedAt: number;
  end: number;
  active: boolean;
  onEdit: (contractionId: string) => void;
}

/** SD-04 / SD-05: the range control, then five charts sharing one x-domain with pinch, pan and double-tap reset. */
export function ChartsSection({ model, startedAt, end, active, onEdit }: ChartsSectionProps) {
  const [range, setRange] = useState<RangeKey>('session');
  const [zoom, setZoom] = useState<[number, number] | null>(null);

  const base = useMemo(() => rangeDomain(range, startedAt, end), [range, startedAt, end]);
  const domain = zoom ?? base;
  const bind = useZoomPan({
    fullDomain: base,
    domain,
    onChange: (d) => setZoom(d[0] === base[0] && d[1] === base[1] ? null : d),
  }).bind;
  const onDomainChange = (d: [number, number]) => setZoom(d[0] === base[0] && d[1] === base[1] ? null : d);

  const buckets = useMemo(
    () => model.buckets.filter((b) => b.start + BUCKET_MS > domain[0] && b.start < domain[1]),
    [model.buckets, domain],
  );

  return (
    <>
      <div className={styles.rangeWrap}>
        <Segmented
          label="Chart range"
          options={RANGE_OPTIONS}
          value={range}
          onChange={(v) => {
            setRange(v as RangeKey);
            setZoom(null);
          }}
        />
      </div>

      <ChartCard title="Timeline" sub="width = length · height = strength">
        <Timeline
          variant="full"
          items={model.items}
          markers={model.markers}
          gaps={model.gaps}
          domain={domain}
          fullDomain={base}
          onDomainChange={onDomainChange}
          now={active ? end : undefined}
          summary={model.summaries.timeline}
          onSelect={onEdit}
        />
      </ChartCard>

      <ChartCard title="Time apart" sub="minutes · dots each, line = average">
        <TrendChart series={model.apart} domain={domain} yUnit="min" summary={model.summaries.apart} svgProps={bind} onSelect={onEdit} />
      </ChartCard>

      <ChartCard title="Lasting" sub="seconds">
        <TrendChart series={model.lasting} domain={domain} yUnit="s" summary={model.summaries.lasting} svgProps={bind} onSelect={onEdit} />
      </ChartCard>

      <ChartCard title="Strength" sub={`out of 10 · ${model.unrated} not rated`}>
        <TrendChart
          series={model.strength}
          domain={domain}
          yUnit="/10"
          yTicks={STRENGTH_TICKS}
          summary={model.summaries.strength}
          svgProps={bind}
          onSelect={onEdit}
        />
      </ChartCard>

      <ChartCard title="Per 10 minutes" sub="how midwives ask">
        <FrequencyBars buckets={buckets} domain={domain} summary={model.summaries.per10} />
      </ChartCard>
    </>
  );
}
