import { showToast } from '../../components';
import type { Contraction, EbbEvent, IntensityScale, Session } from '../../db/types';
import { toCsv } from '../../domain/csv';
import { saveFile } from '../../lib/share';
import { fileDate } from './model';

export async function exportCsv(session: Session, contractions: Contraction[], events: EbbEvent[]): Promise<void> {
  try {
    const csv = toCsv(contractions, events);
    await saveFile(new Blob([csv], { type: 'text/csv' }), `ebb-session-${fileDate(session.startedAt)}.csv`);
  } catch (e) {
    // Closing the iOS share sheet is not a failure.
    if (e instanceof DOMException && e.name === 'AbortError') return;
    showToast({ message: "Couldn't save the CSV. Please try again." });
  }
}

export interface PdfInput {
  session: Session;
  contractions: Contraction[];
  events: EbbEvent[];
  scale: IntensityScale;
  now: number;
  /** Summary text (SH-01) already worded for the session's scope. */
  summary: string;
  name: string;
}

/** The PDF code (jspdf, svg2pdf.js and the renderer) only loads here, when someone asks for a report. */
export async function exportPdf(input: PdfInput): Promise<void> {
  try {
    const { buildPdf } = await import('./pdf/buildPdf');
    const blob = await buildPdf(input);
    await saveFile(blob, `ebb-session-${fileDate(input.session.startedAt)}.pdf`);
  } catch (e) {
    // The person closing the iOS share sheet is not a failure.
    if (e instanceof DOMException && e.name === 'AbortError') return;
    showToast({ message: "Couldn't make the PDF. Please try again." });
  }
}
