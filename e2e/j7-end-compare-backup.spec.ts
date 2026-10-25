import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { buildSeries, makeSession, onboard, readDb, seedDb, waitForDb } from './helpers/db';

const MIN = 60_000;
const at = (day: number, h: number, m: number) => new Date(2026, 9, day, h, m).getTime();
const NOW = at(25, 23, 0);

// Unnamed, so Live calls the active session "Tonight"; once ended it takes its default name, "Sunday night".
const tonight = makeSession({ startedAt: at(25, 21, 40), endedAt: null });
const tuesday = makeSession({ startedAt: at(20, 19, 5), endedAt: at(20, 23, 40) });

const endControl = (page: Page) => page.getByRole('button', { name: 'Press and hold to end session' });

async function hold(page: Page, ms: number): Promise<void> {
  const control = endControl(page);
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  if (!box) throw new Error('the end control has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test('J7: end the session, compare it with an older one, back everything up', async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  await seedDb(page, {
    sessions: [tonight, tuesday],
    contractions: [
      ...buildSeries({ sessionId: tonight.id, startAt: tonight.startedAt + 5 * MIN, count: 14, intervalMs: 6 * MIN, durationMs: 50_000, intensity: 6 }),
      ...buildSeries({ sessionId: tuesday.id, startAt: tuesday.startedAt + 5 * MIN, count: 20, intervalMs: 9 * MIN, durationMs: 45_000, intensity: 4 }),
    ],
  });
  await page.goto('/#/live');
  await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible();

  // 1. Letting go at 1.0 s cancels: no sheet, the session is still open.
  await hold(page, 1000);
  await page.waitForTimeout(800);
  await expect(page.getByRole('dialog', { name: 'End this session?' })).toHaveCount(0);
  expect((await readDb(page)).sessions.find((s) => s.id === tonight.id)?.endedAt).toBeNull();

  // 2. Holding for 1.5 s opens the sheet, with the summary.
  await hold(page, 1900);
  const sheet = page.getByRole('dialog', { name: 'End this session?' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('14 contractions over');
  await expect(sheet.getByRole('button', { name: 'Keep going' })).toBeVisible();

  // 3. End session: endedAt is set and the app returns to Start.
  await sheet.getByRole('button', { name: 'End session' }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/');
  await expect(page.getByRole('heading', { level: 1, name: "Whenever you're ready." })).toBeVisible();
  const ended = (await readDb(page)).sessions.find((s) => s.id === tonight.id);
  expect(ended?.endedAt).not.toBeNull();

  // 4. History -> Select -> both sessions -> Compare.
  await page.getByRole('link', { name: 'All sessions' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sessions' })).toBeVisible();
  await page.getByRole('button', { name: 'Select' }).click();
  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(2);
  await boxes.nth(0).click();
  await boxes.nth(1).click();
  await page.getByRole('button', { name: 'Compare' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Compare' })).toBeVisible();
  const legend = page.getByRole('list', { name: 'Sessions' });
  await expect(legend.getByRole('listitem')).toHaveCount(2);
  await expect(legend.getByRole('listitem').nth(0)).toContainText('Sunday night');
  await expect(legend.getByRole('listitem').nth(1)).toContainText('Tuesday evening');
  await expect(legend.getByRole('listitem').nth(0)).toBeVisible();
  await expect(legend.getByRole('listitem').nth(1)).toBeVisible();

  // 5. Settings -> Back up everything downloads ebb-backup-2026-10-25.json.
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up everything' }).click();
  expect((await download).suggestedFilename()).toBe('ebb-backup-2026-10-25.json');

  // 6. Back to Start: the backup button reads "today".
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back up · today' })).toBeVisible();
});
