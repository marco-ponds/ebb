import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { buildSeries, makeSession, onboard, readDb, seedDb, waitForDb } from './helpers/db';

const MIN = 60_000;
const at = (h: number, m: number, s = 0) => new Date(2026, 9, 25, h, m, s).getTime();
const NOW = at(23, 59, 30);

const session = makeSession({ startedAt: at(22, 45), endedAt: null });
const contractions = buildSeries({ sessionId: session.id, startAt: at(23, 5), count: 10, intervalMs: 5 * MIN, durationMs: MIN });

async function start(page: Page): Promise<void> {
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  await seedDb(page, { sessions: [session], contractions });
}

const rows = (page: Page) => page.locator('table tbody tr');
const hash = (page: Page) => page.evaluate(() => window.location.hash);

test.describe('J6 fixing the record', () => {
  test.beforeEach(async ({ page }) => start(page));

  test('Live header name opens Session detail', async ({ page }) => {
    await page.goto('/#/live');
    await page.getByRole('link', { name: 'Tonight' }).click();
    await expect.poll(() => hash(page)).toBe(`#/session/${session.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tonight');
    await expect(page.getByText('Sun 25 Oct · 22:45 – now')).toBeVisible();
  });

  test('History card opens Session detail', async ({ page }) => {
    await page.goto('/#/history');
    await page.getByRole('link', { name: /Tonight/ }).click();
    await expect.poll(() => hash(page)).toBe(`#/session/${session.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tonight');
  });

  test('editing a contraction updates the log and the stats', async ({ page }) => {
    await page.goto(`/#/session/${session.id}`);
    const stats = page.getByRole('region', { name: 'Summary' });
    await expect(stats).toContainText('5m');
    await expect(stats).toContainText('1m');

    await rows(page).first().getByRole('button', { name: /Edit contraction/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit contraction' });
    await dialog.getByLabel('Start').fill('23:49');
    await dialog.getByLabel('End').fill('23:52');
    await dialog.getByRole('radio', { name: 'Intense' }).click();
    await dialog.getByLabel('Note').fill('sore back');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toContainText('Saved · Undo');
    const first = rows(page).first();
    await expect(first).toContainText('23:49');
    await expect(first).toContainText('180s');
    await expect(first).toContainText('4m');
    await expect(first).toContainText('Intense');
    await expect(stats).toContainText('1m 12s');
    await expect(stats).toContainText('4m 53s');
    await expect(stats).toContainText('10/10');

    const saved = (await readDb(page)).contractions.find((c) => c.note === 'sore back')!;
    expect(saved).toMatchObject({ startAt: at(23, 49), endAt: at(23, 52), intensity: 10, reviewed: true });
  });

  test('an end before the start disables Save with a hint', async ({ page }) => {
    await page.goto(`/#/session/${session.id}`);
    await rows(page).first().getByRole('button', { name: /Edit contraction/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit contraction' });
    await dialog.getByLabel('End').fill('23:40');
    await expect(dialog.getByText('The end needs to be after the start')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('an edit that overlaps another contraction is rejected inline', async ({ page }) => {
    await page.goto(`/#/session/${session.id}`);
    await rows(page).first().getByRole('button', { name: /Edit contraction/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit contraction' });
    await dialog.getByLabel('Start').fill('23:44');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText('Overlaps the one at 23:45')).toBeVisible();
    expect((await readDb(page)).contractions.find((c) => c.startAt === at(23, 50))).toBeDefined();
  });

  test('adding a missed contraction slots into order; an overlapping add is rejected', async ({ page }) => {
    await page.goto(`/#/session/${session.id}`);
    await page.getByRole('button', { name: 'Add a missed contraction' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a missed contraction' });

    await dialog.getByLabel('Start time').fill('23:20');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText('Overlaps the one at 23:20')).toBeVisible();
    expect((await readDb(page)).contractions).toHaveLength(10);

    await dialog.getByLabel('Start time').fill('23:47');
    await dialog.getByLabel('Length minutes').fill('1');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    // 23:50, 23:47, 23:45: the new one sits between its neighbours.
    await expect(rows(page).nth(0)).toContainText('23:50');
    await expect(rows(page).nth(1)).toContainText('23:47');
    await expect(rows(page).nth(2)).toContainText('23:45');
    expect((await readDb(page)).contractions).toHaveLength(11);
  });

  test('renaming the title persists after reload', async ({ page }) => {
    await page.goto(`/#/session/${session.id}`);
    await page.getByRole('button', { name: /Rename/ }).click();
    await page.getByLabel('Session name').fill('Saturday morning');
    await page.getByLabel('Session name').press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Saturday morning');
    await expect.poll(async () => (await readDb(page)).sessions[0].name).toBe('Saturday morning');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Saturday morning');
  });
});
