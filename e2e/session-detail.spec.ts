import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { buildSeries, makeContraction, makeEvent, makeSession, onboard, readDb, seedDb, waitForDb } from './helpers/db';
import type { Contraction, EbbEvent, Session } from '../src/db/types';

const MIN = 60_000;
const at = (day: number, h: number, m: number) => new Date(2026, 9, day, h, m).getTime();
const NOW = at(25, 23, 59);

interface Seed {
  session: Session;
  contractions: Contraction[];
  events?: EbbEvent[];
  now?: number;
}

async function open(page: Page, s: Seed): Promise<void> {
  await page.clock.install({ time: s.now ?? NOW });
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  await seedDb(page, { sessions: [s.session], contractions: s.contractions, events: s.events ?? [] });
  await page.goto(`/#/session/${s.session.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/** Tonight: 22 contractions every 6m20s from 21:40, four of them not rated. */
function tonight() {
  const session = makeSession({ startedAt: at(25, 21, 40), endedAt: null });
  const contractions = buildSeries({ sessionId: session.id, startAt: session.startedAt, count: 22, intervalMs: 380_000, durationMs: 48_000, intensity: 6 });
  contractions.slice(0, 4).forEach((c) => (c.intensity = null));
  const events = [
    makeEvent({ sessionId: session.id, type: 'note', at: at(25, 22, 20), note: 'had a bath' }),
    makeEvent({ sessionId: session.id, type: 'waters', at: at(25, 23, 30), details: 'clear' }),
    makeEvent({ sessionId: session.id, type: 'called-midwife', at: at(25, 23, 36) }),
  ];
  return { session, contractions, events };
}

const rows = (page: Page) => page.locator('table tbody tr');
const firstChart = (page: Page) => page.locator('main svg[role="img"]').first();

test.describe('summary, pattern and charts', () => {
  test.beforeEach(async ({ page }) => open(page, tonight()));

  test('SD-02 summary cards average the last hour while active', async ({ page }) => {
    const inHour = tonight().contractions.filter((c) => c.startAt >= NOW - 60 * MIN).length;
    const stats = page.getByRole('region', { name: 'Summary' });
    await expect(stats).toContainText('Contractions');
    await expect(stats).toContainText(/22\s*Contractions|Contractions\s*22/);
    await expect(stats).toContainText(`${inHour} in the last hour`);
    await expect(stats).toContainText('6m 20s');
    await expect(stats).toContainText('48s');
    await expect(stats).toContainText('6/10');
    await expect(stats.getByText('avg, last hour')).toHaveCount(3);
  });

  test('SD-03 pattern card: label, meter, range and progression rows', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Regular' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Regular: 3 of 3' })).toBeVisible();
    await expect(page.getByText('Every 6 min over the last hour')).toBeVisible();
    for (const label of ['Time apart', 'Length', 'Strength']) await expect(page.locator('dt', { hasText: label })).toBeVisible();
  });

  test('SD-05 five charts with sentence summaries and the right subtitles', async ({ page }) => {
    await expect(page.locator('main svg[role="img"][aria-label]')).toHaveCount(5);
    await expect(page.getByText('width = length · height = strength')).toBeVisible();
    await expect(page.getByText('minutes · dots each, line = average')).toBeVisible();
    await expect(page.getByText('out of 10 · 4 not rated')).toBeVisible();
    await expect(page.getByText('how midwives ask')).toBeVisible();
    await expect(page.getByText('N · note: had a bath')).toBeVisible();
    await expect(page.getByText('W · waters, clear')).toBeVisible();
    await expect(page.getByText('M · called midwife')).toBeVisible();
    await expect(firstChart(page)).toHaveAttribute('aria-label', /Timeline of 22 contractions/);
    await expect(page.locator('[data-line="lasting"]')).toHaveCount(1);
    await expect(page.locator('[data-hollow="true"]')).toHaveCount(4);
  });

  test('tapping a bar shows exact times and an Edit link that opens the edit sheet', async ({ page }) => {
    const bar = page.locator('[data-bar-id]').nth(10);
    await bar.dispatchEvent('click');
    const tip = page.getByRole('tooltip');
    await expect(tip).toContainText(/\d\d:\d\d–\d\d:\d\d/);
    await expect(tip).toContainText('Lasting 48s');
    await expect(tip).toContainText('Interval 6m 20s');
    await expect(tip).toContainText('Rest 5m 32s');
    await tip.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit contraction' })).toBeVisible();
  });

  test('SD-04 the range control changes the axis of every chart; Whole session is the default', async ({ page }) => {
    const whole = page.getByRole('radio', { name: 'Whole session' });
    await expect(whole).toHaveAttribute('aria-checked', 'true');
    const labels = () => firstChart(page).locator('[data-axis]').allTextContents();
    expect(await labels()).toContain('22:00');
    await page.getByRole('radio', { name: 'Last hour' }).click();
    await expect(page.getByRole('radio', { name: 'Last hour' })).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await labels()).includes('22:00')).toBe(false);
    expect(await labels()).toContain('23:30');
    // A trend chart follows the same domain.
    const trend = page.locator('main svg[role="img"]').nth(1);
    expect(await trend.locator('[data-axis]').allTextContents()).toContain('23:30');
    await page.getByRole('radio', { name: 'Last 3 h' }).click();
    await expect.poll(async () => (await labels()).includes('22:00')).toBe(true);
  });
});

test.describe('log (SD-06)', () => {
  test.beforeEach(async ({ page }) => open(page, tonight()));

  test('shows the latest 8 rows newest first, a real table, and Show all', async ({ page }) => {
    await expect(page.getByRole('columnheader')).toHaveText(['Start', 'Lasting', 'Apart', 'Str.', 'Actions']);
    await expect(rows(page)).toHaveCount(8);
    await expect(rows(page).first()).toContainText('23:53');
    await expect(page.locator('table tbody tr', { hasText: 'Called midwife' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Show all 25 entries' }).click();
    await expect(rows(page)).toHaveCount(25);
    await expect(page.getByRole('button', { name: /Show all/ })).toHaveCount(0);
  });

  test('swipe left reveals Delete; Deleted · Undo restores the row', async ({ page }) => {
    const target = rows(page).nth(1);
    const before = (await target.textContent()) ?? "";
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    await page.mouse.move(box.x + box.width - 80, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 160, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await target.getByRole('button', { name: 'Delete' }).click();
    await expect(rows(page)).toHaveCount(8);
    await expect(rows(page).nth(1)).not.toHaveText(before);
    const toast = page.getByRole('status');
    await expect(toast).toContainText('Deleted · Undo');
    expect((await readDb(page)).contractions.filter((c) => c.deletedAt !== null)).toHaveLength(1);
    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect(rows(page).nth(1)).toHaveText(before);
    expect((await readDb(page)).contractions.filter((c) => c.deletedAt !== null)).toHaveLength(0);
  });
});

test.describe('notes (SD-08)', () => {
  test('autosave after 500 ms idle and persists after reload', async ({ page }) => {
    const t = tonight();
    await open(page, t);
    const box = page.getByLabel('Notes');
    await box.fill('Midwife said to call back when 3 in 10 for an hour.');
    await page.clock.runFor(300);
    expect((await readDb(page)).sessions[0].notes).toBe('');
    await page.clock.runFor(300);
    await expect.poll(async () => (await readDb(page)).sessions[0].notes).toBe('Midwife said to call back when 3 in 10 for an hour.');
    await page.reload();
    await expect(page.getByLabel('Notes')).toHaveValue('Midwife said to call back when 3 in 10 for an hour.');
  });
});

test.describe('edge rows', () => {
  test('very short shows the tag and is left out of the averages', async ({ page }) => {
    const session = makeSession({ startedAt: at(25, 21, 40), endedAt: at(25, 23, 0) });
    const cs = buildSeries({ sessionId: session.id, startAt: session.startedAt + 5 * MIN, count: 6, intervalMs: 5 * MIN, durationMs: 60_000, intensity: 6 });
    const short = makeContraction({ sessionId: session.id, startAt: at(25, 22, 50), endAt: at(25, 22, 50) + 2000 });
    await open(page, { session, contractions: [...cs, short] });
    await expect(page.locator('table tbody tr', { hasText: 'very short' })).toHaveCount(1);
    const stats = page.getByRole('region', { name: 'Summary' });
    await expect(stats).toContainText('7'); // counted in the total
    await expect(stats).toContainText('1m'); // lasting average ignores the 2 s one
    await expect(stats.getByText('avg, whole session')).toHaveCount(3);
  });

  test('clock changed shows the time changed tag', async ({ page }) => {
    const session = makeSession({ startedAt: at(25, 21, 40), endedAt: at(25, 23, 0) });
    const cs = buildSeries({ sessionId: session.id, startAt: session.startedAt + 5 * MIN, count: 5, intervalMs: 5 * MIN, durationMs: 60_000, intensity: 5 });
    cs[3].timeChanged = true;
    await open(page, { session, contractions: cs });
    await expect(page.locator('table tbody tr', { hasText: 'time changed' })).toHaveCount(1);
  });

  test('only 1 to 3 contractions: dashes, empty pattern and no trend lines', async ({ page }) => {
    const session = makeSession({ startedAt: at(25, 21, 40), endedAt: at(25, 23, 0) });
    const cs = buildSeries({ sessionId: session.id, startAt: session.startedAt + 5 * MIN, count: 3, intervalMs: 5 * MIN, durationMs: 60_000, intensity: 5 });
    await open(page, { session, contractions: cs });
    await expect(page.getByText('Not enough yet to describe a pattern')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Summary' })).toContainText('—');
    await expect(page.locator('[data-line]')).toHaveCount(0);
    await expect(page.locator('[data-bar-id]')).toHaveCount(3);
  });

  test('past midnight the axis labels the date', async ({ page }) => {
    const session = makeSession({ startedAt: at(24, 23, 0), endedAt: at(25, 1, 30) });
    const cs = buildSeries({ sessionId: session.id, startAt: session.startedAt + 5 * MIN, count: 8, intervalMs: 15 * MIN, durationMs: 60_000, intensity: 5 });
    await open(page, { session, contractions: cs });
    await expect(firstChart(page).locator('[data-axis-date]').first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Saturday night');
  });

  test('a 24 h session with 320 contractions virtualises the expanded log', async ({ page }) => {
    const session = makeSession({ startedAt: at(24, 21, 0), endedAt: at(25, 21, 0) });
    const cs = buildSeries({ sessionId: session.id, startAt: session.startedAt + 60_000, count: 320, intervalMs: 270_000, durationMs: 50_000, intensity: 5 });
    await open(page, { session, contractions: cs, now: at(25, 21, 30) });
    await page.getByRole('button', { name: 'Show all 320 entries' }).click();
    await expect(rows(page).first()).toBeAttached();
    expect(await rows(page).count()).toBeLessThan(80);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(async () => page.locator('table tbody tr td').filter({ hasText: /^\d\d:\d\d$/ }).count()).toBeGreaterThan(0);
    expect(await rows(page).count()).toBeLessThan(80);
  });

  test('an unknown id says the session is not here any more', async ({ page }) => {
    await page.goto('/');
    await waitForDb(page);
    await onboard(page);
    await page.goto('/#/session/does-not-exist');
    await expect(page.getByText("This session isn't here any more")).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/history');
  });
});
