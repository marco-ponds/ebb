/**
 * On-device PDF report (SH-02): A4 portrait, light theme. This module and the jspdf / svg2pdf.js
 * libraries are only ever loaded through a dynamic import when someone taps "PDF report".
 *
 * The page's own chart components are rendered offscreen with a light palette. Colours here are
 * literals because the PDF is always light, whatever theme the app is showing.
 */
import { createElement, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { FrequencyBars, Timeline, TrendChart } from '../../../charts';
import { formatClock, formatDateShort, formatDuration, formatIntensity, formatSessionLength, formatTimeRange } from '../../../domain/format';
import { buildChartModel } from '../chartData';
import type { PdfInput } from '../exporting';
import { buildLog, eventTitle } from '../model';

const LIGHT: Record<string, string> = {
  '--bg': '#ffffff',
  '--surface': '#ffffff',
  '--surface-2': '#eee8f7',
  '--hairline': '#d9d1e8',
  '--text': '#2a2442',
  '--text-muted': '#4f4868',
  '--text-faint': '#625b7d',
  '--ink': '#2a2442',
  '--lavender': '#a894e6',
  '--peach': '#f0a98c',
  '--mint': '#7fcab3',
  '--butter': '#e3c765',
  '--sky': '#8fb0e8',
  '--rose': '#e58aa1',
};

const SAFETY = "This app records contractions. It doesn't give medical advice — if you're worried, contact your midwife or maternity unit.";
const PAGE = { w: 210, h: 297 };
const M = 15;
const CW = PAGE.w - 2 * M;
const RENDER_W = 600;
const MM_PER_PX = CW / RENDER_W;
const FOOTER_H = 12;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 20)));

/** svg2pdf can't resolve var(--x) or CSS classes, so write every resolved fill and stroke onto the elements. */
function inlineStyles(svg: SVGSVGElement): void {
  const all: Element[] = [svg, ...Array.from(svg.querySelectorAll('*'))];
  for (const el of all) {
    const cs = getComputedStyle(el);
    for (const prop of ['fill', 'stroke'] as const) {
      if (el.hasAttribute(prop)) el.setAttribute(prop, cs.getPropertyValue(prop) || 'none');
    }
    if (el.tagName.toLowerCase() === 'text') {
      el.setAttribute('font-family', 'helvetica');
      el.setAttribute('font-weight', Number(cs.fontWeight) >= 700 ? 'bold' : 'normal');
    }
    el.removeAttribute('class');
    el.removeAttribute('style');
  }
}

interface Rendered {
  svg: SVGSVGElement;
  height: number;
}

class Offscreen {
  private host = document.createElement('div');
  private roots: Root[] = [];

  constructor() {
    this.host.setAttribute('aria-hidden', 'true');
    Object.assign(this.host.style, { position: 'fixed', left: '-10000px', top: '0', width: `${RENDER_W}px`, pointerEvents: 'none' });
    for (const [k, v] of Object.entries(LIGHT)) this.host.style.setProperty(k, v);
    document.body.appendChild(this.host);
  }

  async render(element: ReactElement): Promise<Rendered> {
    const slot = document.createElement('div');
    slot.style.width = `${RENDER_W}px`;
    this.host.appendChild(slot);
    const root = createRoot(slot);
    this.roots.push(root);
    flushSync(() => root.render(element));
    await nextFrame();
    const svg = slot.querySelector<SVGSVGElement>('svg[role="img"]');
    if (!svg) throw new Error('Chart did not render');
    inlineStyles(svg);
    return { svg, height: Number(svg.getAttribute('height')) || svg.getBoundingClientRect().height };
  }

  dispose(): void {
    for (const r of this.roots) r.unmount();
    this.host.remove();
  }
}

export async function buildPdf(input: PdfInput): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const { session, contractions, events, scale, now, summary, name } = input;
  const end = Math.max(session.endedAt ?? now, now);
  const model = buildChartModel(session, contractions, events, end);
  const domain: [number, number] = [session.startedAt, Math.max(end, session.startedAt + 10 * 60_000)];

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let y = M;
  const ensure = (h: number) => {
    if (y + h > PAGE.h - M - FOOTER_H) {
      doc.addPage();
      y = M;
    }
  };
  const text = (value: string, x: number, size: number, bold: boolean, rgb: [number, number, number]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...rgb);
    doc.text(value, x, y);
  };
  const INK: [number, number, number] = [42, 36, 66];
  const MUTED: [number, number, number] = [79, 72, 104];

  // Header and summary.
  text(name, M, 20, true, INK);
  y += 7;
  text(
    `${formatDateShort(session.startedAt)} · ${formatTimeRange(session.startedAt, session.endedAt)} · ${formatSessionLength(end - session.startedAt)}`,
    M,
    10,
    false,
    MUTED,
  );
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  const lines = doc.splitTextToSize(summary, CW) as string[];
  doc.text(lines, M, y);
  y += lines.length * 5 + 4;

  const off = new Offscreen();
  try {
    const place = async (title: string, sub: string, element: ReactElement, after?: () => void) => {
      const { svg, height } = await off.render(element);
      const h = height * MM_PER_PX;
      ensure(h + 12);
      text(title, M, 12, true, INK);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(sub, PAGE.w - M, y, { align: 'right' });
      y += 3;
      await svg2pdf(svg, doc, { x: M, y, width: CW, height: h });
      y += h + 2;
      after?.();
      y += 4;
    };

    await place(
      'Timeline',
      'width = length · height = strength',
      createElement(Timeline, {
        variant: 'full',
        items: model.items,
        markers: model.markers,
        gaps: model.gaps,
        domain,
        summary: model.summaries.timeline,
      }),
      () => {
        for (const m of model.markers) {
          ensure(5);
          y += 4;
          text(`${m.letter} · ${m.label}`, M, 9, false, MUTED);
        }
        if (model.markers.length) y += 4;
      },
    );
    const trend = (series: typeof model.apart, yUnit: string, summaryText: string, ticks?: number[]) =>
      createElement(TrendChart, { series, domain, yUnit, yTicks: ticks, summary: summaryText });
    await place('Time apart', 'minutes · dots each, line = average', trend(model.apart, 'min', model.summaries.apart));
    await place('Lasting', 'seconds', trend(model.lasting, 's', model.summaries.lasting));
    await place('Strength', `out of 10 · ${model.unrated} not rated`, trend(model.strength, '/10', model.summaries.strength, [2, 6, 10]));
    await place('Per 10 minutes', 'how midwives ask', createElement(FrequencyBars, { buckets: model.buckets, domain, summary: model.summaries.per10 }));

    // The full table.
    const COLS = { start: M, lasting: M + 42, apart: M + 64, strength: M + 88, note: M + 125 };
    const header = () => {
      ensure(14);
      text('Everything logged', M, 12, true, INK);
      y += 6;
      for (const [label, x] of [
        ['Start', COLS.start],
        ['Lasting', COLS.lasting],
        ['Apart', COLS.apart],
        ['Strength', COLS.strength],
        ['Note', COLS.note],
      ] as const) {
        text(label, x, 9, true, MUTED);
      }
      y += 2;
      doc.setDrawColor(217, 209, 232);
      doc.setLineWidth(0.2);
      doc.line(M, y, PAGE.w - M, y);
      y += 5;
    };
    header();
    const LINE_H = 4;
    /** Wraps to the width that is left on the page from `x`, so no note is cut off or runs off the edge. */
    const wrap = (value: string, x: number): string[] => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      return doc.splitTextToSize(value, PAGE.w - M - x) as string[];
    };
    for (const row of buildLog(contractions, events).reverse()) {
      const noteX = row.kind === 'event' ? COLS.lasting : COLS.note;
      const noteText =
        row.kind === 'event'
          ? `${eventTitle(row.e)}${row.e.note ? `: ${row.e.note}` : ''}`
          : [row.flag, row.c.note].filter(Boolean).join(' · ');
      const noteLines = noteText ? wrap(noteText, noteX) : [];
      const rowH = Math.max(1, noteLines.length) * LINE_H + 2;
      if (y + rowH > PAGE.h - M - FOOTER_H) {
        doc.addPage();
        y = M;
        header();
      }
      const when = `${formatDateShort(row.at)} ${formatClock(row.at)}`;
      text(when, COLS.start, 9, false, INK);
      if (row.kind === 'contraction') {
        text(row.duration === null ? '…' : `${Math.round(row.duration / 1000)}s`, COLS.lasting, 9, false, INK);
        text(row.apart === null ? '—' : formatDuration(row.apart), COLS.apart, 9, false, INK);
        text(formatIntensity(row.c.intensity, scale), COLS.strength, 9, false, INK);
      }
      if (noteLines.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...MUTED);
        doc.text(noteLines, noteX, y, { lineHeightFactor: LINE_H / (9 * 0.3528) });
      }
      y += rowH;
    }
  } finally {
    off.dispose();
  }

  // Safety line on every page.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const foot = doc.splitTextToSize(SAFETY, CW) as string[];
    doc.text(foot, M, PAGE.h - M - 2);
  }
  return doc.output('blob');
}
