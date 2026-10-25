import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { buildSeries, makeSession, onboard, seedDb, waitForDb } from './helpers/db';

const at = (day: number, h: number, m: number) => new Date(2026, 9, day, h, m).getTime();
const NOW = at(25, 23, 59);

const tonight = makeSession({ startedAt: at(25, 21, 40), endedAt: null });
const tuesday = makeSession({ startedAt: at(20, 19, 5), endedAt: at(20, 23, 40) });
const sunday = makeSession({ startedAt: at(18, 2, 10), endedAt: at(18, 3, 25) });
const thursday = makeSession({ startedAt: at(15, 15, 30), endedAt: at(15, 16, 10) });

const contractions = [
  ...buildSeries({ sessionId: tonight.id, startAt: tonight.startedAt, count: 22, intervalMs: 380_000, durationMs: 48_000 }),
  ...buildSeries({ sessionId: tuesday.id, startAt: tuesday.startedAt, count: 31, intervalMs: 530_000, durationMs: 44_000 }),
  ...buildSeries({ sessionId: sunday.id, startAt: sunday.startedAt, count: 9, intervalMs: 500_000, durationMs: 35_000 }),
  ...buildSeries({ sessionId: thursday.id, startAt: thursday.startedAt, count: 5, intervalMs: 550_000, durationMs: 30_000 }),
];

async function open(page: Page, seed: boolean) {
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  if (seed) await seedDb(page, { sessions: [thursday, sunday, tonight, tuesday], contractions });
  await page.goto('/#/history');
}

const cards = (page: Page) => page.locator('main ul > li');
const hash = (page: Page) => page.evaluate(() => window.location.hash);

test.describe('with sessions', () => {
  test.beforeEach(async ({ page }) => open(page, true));

  test('lists sessions newest first with their stats', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Sessions', level: 1 })).toBeVisible();
    await expect(cards(page)).toHaveCount(4);
    const titles = ['Tonight', 'Tuesday evening', 'Sunday night', 'Thursday afternoon'];
    for (const [i, title] of titles.entries()) await expect(cards(page).nth(i)).toContainText(title);

    const first = cards(page).nth(0);
    await expect(first).toContainText('Sun 25 Oct · 21:40 – now · 2 h 19 m');
    await expect(first).toContainText(/22\s*contr\./);
    await expect(first).toContainText(/6m 20s\s*apart/);
    await expect(first).toContainText(/48s\s*long/);
    await expect(first.locator('svg[role="img"] rect')).toHaveCount(22);

    const second = cards(page).nth(1);
    await expect(second).toContainText('Tue 20 Oct · 19:05–23:40 · 4 h 35 m');
    await expect(second).toContainText(/31\s*contr\./);
    await expect(second).toContainText(/8m 50s\s*apart/);
    await expect(second).toContainText(/44s\s*long/);
    await expect(cards(page).nth(3)).toContainText('Thu 15 Oct · 15:30–16:10 · 40 m');
  });

  test('shows the In progress pill on the active session only', async ({ page }) => {
    await expect(page.getByText('In progress')).toHaveCount(1);
    await expect(cards(page).nth(0)).toContainText('In progress');
  });

  test('tapping a card opens the session', async ({ page }) => {
    await cards(page).nth(1).click();
    await expect.poll(() => hash(page)).toBe(`#/session/${tuesday.id}`);
  });

  test('select mode: compare needs two or three, a fourth is blocked, Done leaves', async ({ page }) => {
    await expect(page.getByText('Pick two or three sessions to compare.')).toBeHidden();
    await page.getByRole('button', { name: 'Select' }).click();
    await expect(page.getByText('Pick two or three sessions to compare.')).toBeVisible();
    const boxes = page.getByRole('checkbox');
    await expect(boxes).toHaveCount(4);
    const compare = page.getByRole('button', { name: 'Compare' });
    await expect(page.getByText('0 selected')).toBeVisible();
    await expect(compare).toBeDisabled();

    await boxes.nth(0).click();
    await expect(boxes.nth(0)).toHaveAttribute('aria-checked', 'true');
    await expect(boxes.nth(0)).toHaveCSS('border-top-color', 'rgb(203, 187, 244)');
    await expect(page.getByText('1 selected')).toBeVisible();
    await expect(compare).toBeDisabled();

    await boxes.nth(1).click();
    await expect(page.getByText('2 selected')).toBeVisible();
    await expect(compare).toBeEnabled();

    await boxes.nth(2).click();
    await expect(page.getByText('3 selected')).toBeVisible();
    await expect(compare).toBeEnabled();

    await boxes.nth(3).click();
    await expect(page.getByText('Up to three at a time')).toBeVisible();
    await expect(page.getByText('3 selected')).toBeVisible();
    await expect(boxes.nth(3)).toHaveAttribute('aria-checked', 'false');

    await boxes.nth(2).click();
    await expect(page.getByText('2 selected')).toBeVisible();
    await expect(page.getByText('Up to three at a time')).toBeHidden();

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Compare' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Select' })).toBeVisible();
  });

  test('Compare opens the comparison with the picked ids in order', async ({ page }) => {
    await page.getByRole('button', { name: 'Select' }).click();
    await page.getByRole('checkbox').nth(1).click();
    await page.getByRole('checkbox').nth(0).click();
    await page.getByRole('button', { name: 'Compare' }).click();
    await expect.poll(() => hash(page)).toBe(`#/compare?ids=${tuesday.id},${tonight.id}`);
  });

  test('Back goes to Live while a session is active', async ({ page }) => {
    await page.getByRole('button', { name: 'Back' }).click();
    await expect.poll(() => hash(page)).toBe('#/live');
  });
});

test.describe('without sessions', () => {
  test.beforeEach(async ({ page }) => open(page, false));

  test('shows the empty state with a Start timing link', async ({ page }) => {
    await expect(page.getByText('Sessions you time will appear here')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select' })).toHaveCount(0);
    const link = page.getByRole('link', { name: 'Start timing' });
    await expect(link).toHaveAttribute('href', '#/');
    await link.click();
    await expect.poll(() => hash(page)).toBe('#/');
  });

  test('Back goes to Start when no session is active', async ({ page }) => {
    await page.getByRole('button', { name: 'Back' }).click();
    await expect.poll(() => hash(page)).toBe('#/');
  });
});
