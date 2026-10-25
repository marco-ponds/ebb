import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { buildSeries, makeEvent, makeSession, onboard, seedDb, waitForDb } from './helpers/db';

const at = (day: number, h: number, m: number) => new Date(2026, 9, day, h, m).getTime();
const NOW = at(25, 23, 59);

const session = makeSession({ startedAt: at(25, 21, 40), endedAt: at(25, 23, 50) });
const contractions = buildSeries({ sessionId: session.id, startAt: session.startedAt + 5 * 60_000, count: 18, intervalMs: 5 * 60_000, durationMs: 55_000, intensity: 6 });
const events = [
  makeEvent({ sessionId: session.id, type: 'waters', at: at(25, 22, 30), details: 'clear' }),
  makeEvent({ sessionId: session.id, type: 'note', at: at(25, 22, 45), note: 'had a bath, then "tea"' }),
];

async function open(page: Page): Promise<string[]> {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  await seedDb(page, { sessions: [session], contractions, events });
  await page.goto(`/#/session/${session.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  return requested;
}

const main = (page: Page) => page.getByRole('main');

test('CSV data downloads the exact header and one row per contraction and event', async ({ page }) => {
  await open(page);
  const [download] = await Promise.all([page.waitForEvent('download'), main(page).getByRole('button', { name: 'CSV data' }).click()]);
  expect(download.suggestedFilename()).toBe('ebb-session-2026-10-25.csv');
  const text = await readFile((await download.path())!, 'utf8');
  const lines = text.split('\r\n');
  expect(lines[0]).toBe('type,start,end,duration_s,interval_s,intensity,note');
  expect(lines).toHaveLength(1 + 18 + 2);
  expect(lines.filter((l) => l.startsWith('contraction,'))).toHaveLength(18);
  expect(text).toContain('waters,');
  expect(text).toContain('"had a bath, then ""tea"""');
});

test('the Export sheet offers the same CSV', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await expect(dialog.getByRole('button', { name: 'PDF report' })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'CSV data' }).click()]);
  expect(download.suggestedFilename()).toBe('ebb-session-2026-10-25.csv');
});

test('PDF report is generated on device: %PDF, over 10 kB, and the PDF code loads only on click', async ({ page }) => {
  const requested = await open(page);
  const pdfCode = /jspdf|svg2pdf|buildPdf|html2canvas/i;
  expect(requested.filter((p) => pdfCode.test(p))).toEqual([]);

  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), main(page).getByRole('button', { name: 'PDF report' }).click()]);
  expect(download.suggestedFilename()).toBe('ebb-session-2026-10-25.pdf');
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
  expect(bytes.length).toBeGreaterThan(10_000);
  expect(requested.filter((p) => pdfCode.test(p)).length).toBeGreaterThan(0);
});
