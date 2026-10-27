import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { buildSeries, makeEvent, makeSession, onboard, readDb, seedDb, waitForDb } from './helpers/db';
import type { DbDump } from './helpers/db';

const MIN = 60_000;
const NOT_BACKUP = "This file isn't an Ebb backup";

async function openSettings(page: Page, seed: 'history' | 'active' | 'none' = 'history') {
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  const old = makeSession({ name: 'Last night', startedAt: Date.now() - 600 * MIN, endedAt: Date.now() - 540 * MIN });
  const data = {
    sessions: [old],
    contractions: buildSeries({ sessionId: old.id, startAt: old.startedAt + MIN, count: 3, intervalMs: 5 * MIN, durationMs: 50_000 }),
    events: [makeEvent({ sessionId: old.id, at: old.startedAt + 2 * MIN })],
  };
  if (seed === 'active') {
    await seedDb(page, { ...data, sessions: [...data.sessions, makeSession({ startedAt: Date.now() - 10 * MIN })] });
  } else if (seed === 'history') {
    await seedDb(page, data);
  }
  await page.evaluate(() => {
    window.location.hash = '#/settings';
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  return data;
}

const counts = (d: DbDump) => [d.sessions.length, d.contractions.length, d.events.length];

function backupOf(rows: ReturnType<typeof makeSessionRows>, over: Record<string, unknown> = {}) {
  return {
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'ebb', schema: 1, exportedAt: Date.now(), ...rows, ...over })),
  };
}

function makeSessionRows(existing: { sessions: ReturnType<typeof makeSession>[]; contractions: unknown[]; events: unknown[] }) {
  const fresh = makeSession({ name: 'From file', startedAt: Date.now() - 3000 * MIN, endedAt: Date.now() - 2900 * MIN });
  const freshContractions = buildSeries({ sessionId: fresh.id, startAt: fresh.startedAt + MIN, count: 1, intervalMs: MIN, durationMs: 50_000 });
  return {
    sessions: [...existing.sessions, fresh],
    contractions: [...existing.contractions, ...freshContractions],
    events: existing.events,
    settings: {
      thresholds: [],
      intensityScale: 'words',
      theme: 'night',
      keepAwake: true,
      haptics: true,
      breathingGlow: true,
      lastBackupAt: null,
      onboardedAt: null,
    },
  };
}

test('Back up everything downloads a backup file and Start then reads "today"', async ({ page }) => {
  await openSettings(page);
  await expect(page.getByText(/Last backup: never\./)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up everything' }).click();
  const file = await download;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  expect(file.suggestedFilename()).toBe(`ebb-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`);
  const json = JSON.parse(await readFile((await file.path()) as string, 'utf8'));
  expect(json).toMatchObject({ app: 'ebb', schema: 1 });
  expect([json.sessions.length, json.contractions.length, json.events.length]).toEqual([1, 3, 1]);

  await expect(page.getByText(/Last backup: today\./)).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await expect(page.getByRole('button', { name: 'Back up · today' })).toBeVisible();
});

test('Merge of an overlapping file reports what was added and skipped', async ({ page }) => {
  const existing = await openSettings(page);
  await page.getByLabel('Restore from a backup').setInputFiles(backupOf(makeSessionRows(existing)));
  await expect(page.getByText('2 sessions, 4 contractions, 1 events')).toBeVisible();
  await page.getByRole('button', { name: 'Merge' }).click();
  // The new session and its contraction are added; the 5 rows already on the phone are skipped.
  await expect(page.getByText('Added 2, skipped 5')).toBeVisible();
  expect(counts(await readDb(page))).toEqual([2, 4, 1]);
});

test('a corrupt file and a schema 2 file are rejected and change nothing', async ({ page }) => {
  await openSettings(page);
  const before = counts(await readDb(page));
  await page.getByLabel('Restore from a backup').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{nope') });
  await expect(page.getByText(NOT_BACKUP)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Merge' })).toHaveCount(0);

  await page.getByLabel('Restore from a backup').setInputFiles(
    backupOf(makeSessionRows({ sessions: [], contractions: [], events: [] }), { schema: 2 }),
  );
  await expect(page.getByText(NOT_BACKUP)).toBeVisible();
  expect(counts(await readDb(page))).toEqual(before);
});

test('Replace swaps the data and saves a copy of the old data first', async ({ page }) => {
  await openSettings(page);
  const rows = makeSessionRows({ sessions: [], contractions: [], events: [] });
  await page.getByLabel('Restore from a backup').setInputFiles(backupOf(rows));
  await page.getByRole('button', { name: 'Replace' }).click();
  await expect(page.getByText('A copy of your current data was saved first')).toBeVisible();
  expect(counts(await readDb(page))).toEqual([1, 1, 0]);
  // The fixture predates the breathing timings: Replace stores the defaults.
  expect((await readDb(page)).settings).toMatchObject({ breatheInSeconds: 4, breatheOutSeconds: 4 });
  const saved = await page.evaluate(async () => (await (await caches.open('ebb-backups')).keys()).length);
  expect(saved).toBeGreaterThanOrEqual(1);
});

test('Restore is disabled during an active session', async ({ page }) => {
  await openSettings(page, 'active');
  await expect(page.getByLabel('Restore from a backup')).toBeDisabled();
  await expect(page.getByText('Finish the current session before restoring')).toBeVisible();
});

test('Delete all data needs exactly "delete", clears everything and lands on Welcome', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('button', { name: 'Delete all data…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete all data' });
  const confirm = dialog.getByRole('button', { name: 'Delete everything' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Type "delete" to confirm').fill('delet');
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Type "delete" to confirm').fill('delete');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByRole('heading', { level: 1, name: 'ebb' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(/^#\/?$/);
  const db = await readDb(page);
  expect(counts(db)).toEqual([0, 0, 0]);
  expect(db.settings?.onboardedAt ?? null).toBeNull();
});
