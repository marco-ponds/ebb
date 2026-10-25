import type { ScaleLinear } from 'd3-scale';

const MIN = 60_000;
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440].map((m) => m * MIN);
const pad = (n: number) => String(n).padStart(2, '0');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatClock = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const formatDate = (t: number) => {
  const d = new Date(t);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export const formatLength = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${pad(s % 60)}s`;
};

export const crossesMidnight = ([a, b]: [number, number]) => formatDate(a) !== formatDate(b);

/** Round-numbered tick times (aligned to local time) inside the domain. */
export function timeTicks([a, b]: [number, number], target = 5): number[] {
  const span = b - a;
  const step = STEPS.find((s) => span / s <= target) ?? STEPS[STEPS.length - 1];
  const offset = new Date(a).getTimezoneOffset() * MIN;
  const ticks: number[] = [];
  for (let t = Math.ceil((a - offset) / step) * step + offset; t <= b; t += step) ticks.push(t);
  return ticks;
}

interface TimeAxisProps {
  scale: ScaleLinear<number, number>;
  domain: [number, number];
  y: number;
  width: number;
  /** compare variant: label hours from the start of the domain instead of clock times */
  relative?: boolean;
}

export function TimeAxis({ scale, domain, y, width, relative }: TimeAxisProps) {
  const ticks = relative
    ? Array.from({ length: Math.floor((domain[1] - domain[0]) / (60 * MIN)) + 1 }, (_, i) => domain[0] + i * 60 * MIN)
    : timeTicks(domain);
  const showDate = !relative && crossesMidnight(domain);
  const dateLabels = ticks.map((t, i) => {
    if (!showDate) return '';
    const date = formatDate(t);
    return i === 0 || date !== formatDate(ticks[i - 1]) ? date : '';
  });
  return (
    <g aria-hidden="true">
      <line x1={scale.range()[0]} x2={scale.range()[1]} y1={y} y2={y} stroke="var(--hairline)" strokeWidth={1} />
      {ticks.map((t, i) => {
        const x = scale(t);
        const anchor = x < 24 ? 'start' : x > width - 24 ? 'end' : 'middle';
        const date = dateLabels[i];
        return (
          <g key={t}>
            <line x1={x} x2={x} y1={y} y2={y + 4} stroke="var(--hairline)" strokeWidth={1} />
            <text data-axis x={x} y={y + 16} textAnchor={anchor} fill="var(--text-faint)" fontSize={12} fontWeight={700}>
              {relative ? `${Math.round((t - domain[0]) / (60 * MIN))} h` : formatClock(t)}
            </text>
            {date ? (
              <text data-axis-date x={x} y={y + 30} textAnchor={anchor} fill="var(--text-faint)" fontSize={12} fontWeight={700}>
                {date}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}
