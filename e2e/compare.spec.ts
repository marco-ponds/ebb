import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { buildSeries, makeSession, onboard, seedDb, waitForDb } from './helpers/db';

const at = (day: number, h: number, m: number) => new Date(2026, 9, day, h, m).getTime();
const NOW = at(25, 23, 59);

const tonight = makeSession({ startedAt: at(25, 21, 40), endedAt: null });
const tuesday = makeSession({ startedAt: at(20, 19, 5), endedAt: at(20, 23, 40) });
const sunday = makeSession({ startedAt: at(18, 2, 10), endedAt: at(18, 3, 25) });

const contractions = [
  ...buildSeries({ sessionId: tonight.id, startAt: tonight.startedAt, count: 22, intervalMs: 380_000, durationMs: 48_000, intensity: 5 }),
  ...buildSeries({ sessionId: tuesday.id, startAt: tuesday.startedAt, count: 31, intervalMs: 530_000, durationMs: 44_000, intensity: 4 }),
  ...buildSeries({ sessionId: sunday.id, startAt: sunday.startedAt, count: 9, intervalMs: 500_000, durationMs: 35_000, intensity: 3 }),
];

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await waitForDb(page);
  await onboard(page, { intensityScale: 'numeric' });
  await seedDb(page, { sessions: [tonight, tuesday, sunday], contractions });
});

const open = (page: Page, ids: string[]) => page.goto(`/#/compare?ids=${ids.join(',')}`);

test.describe('two sessions', () => {
  test.beforeEach(async ({ page }) => open(page, [tonight.id, tuesday.id]));

  test('shows the title, subtitle and a legend that does not rely on colour', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Compare', level: 1 })).toBeVisible();
    await expect(page.getByText("Lined up from each session's start")).toBeVisible();
    const legend = page.getByRole('list', { name: 'Sessions' });
    await expect(legend.getByRole('listitem')).toHaveCount(2);
    await expect(legend.getByRole('listitem').nth(0)).toContainText('Tonight');
    await expect(legend.getByRole('listitem').nth(0)).toContainText('· Sun 25 Oct');
    await expect(legend.getByRole('listitem').nth(1)).toContainText('Tuesday evening');
    await expect(legend.getByRole('listitem').nth(1)).toContainText('· Tue 20 Oct');

    const primary = legend.locator('[data-series="primary"][aria-hidden="true"]');
    await expect(primary).toHaveCSS('background-color', 'rgb(203, 187, 244)');
    const secondary = legend.locator('[data-series="secondary"][aria-hidden="true"]');
    await expect(secondary).toHaveCSS('border-top-style', 'dashed');
    await expect(secondary).toHaveCSS('border-top-color', 'rgb(180, 202, 240)');
  });

  test('stacks timelines on a shared hour axis sized to the longest session', async ({ page }) => {
    const timelines = page.getByRole('region');
    await expect(timelines).toHaveCount(2);
    // One shared hour axis, under the last timeline, sized to the longest session.
    await expect(timelines.nth(0).locator('[data-axis]')).toHaveCount(0);
    await expect(timelines.nth(1).locator('[data-axis]')).toHaveText(['0 h', '1 h', '2 h', '3 h', '4 h']);
    await expect(timelines.nth(0).locator('rect[data-bar-id]')).toHaveCount(22);
    await expect(timelines.nth(1).locator('rect[data-bar-id]')).toHaveCount(31);
    // Primary is a solid lavender fill; secondary an outline with a dashed stroke.
    await expect(timelines.nth(0).locator('rect[data-bar-id]').first()).toHaveAttribute('fill', 'var(--lavender)');
    const outline = timelines.nth(1).locator('rect[data-bar-id]').first();
    await expect(outline).toHaveAttribute('fill', 'none');
    await expect(outline).toHaveAttribute('stroke', 'var(--sky)');
    await expect(outline).toHaveAttribute('stroke-dasharray', '5 3');
  });

  test('overlays the rolling-average trend lines in matching styles', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Time apart', level: 2 })).toBeVisible();
    await expect(page.getByText('minutes, rolling average')).toBeVisible();
    await expect(page.locator(`path[data-line="${tonight.id}"]`)).toHaveAttribute('stroke', 'var(--lavender)');
    const dashed = page.locator(`path[data-line="${tuesday.id}"]`);
    await expect(dashed).toHaveAttribute('stroke', 'var(--sky)');
    await expect(dashed).toHaveAttribute('stroke-dasharray', '6 4');
  });

  test('trend chart has an hour axis and relative-time tooltips', async ({ page }) => {
    const trend = page.getByRole('img', { name: /^Time apart in minutes/ });
    await expect(trend.locator('[data-axis]')).toHaveText(['0 h', '1 h', '2 h', '3 h', '4 h']);
    await expect(trend.locator('circle[data-point]')).toHaveCount(21 + 30);
    await trend.locator('circle[data-point]').first().dispatchEvent('pointerover');
    const tip = page.getByRole('tooltip');
    await expect(tip).toContainText('in');
    await expect(tip).not.toContainText(/\d\d:\d\d/);
  });

  test('timeline tooltips use time into the session', async ({ page }) => {
    await page.getByRole('region', { name: 'Tonight' }).locator('rect[data-bar-id]').nth(1).dispatchEvent('pointerover');
    const tip = page.getByRole('tooltip');
    await expect(tip).toContainText('6m in');
    await expect(tip).not.toContainText(/\d\d:\d\d/);
  });

  test('tabulates the metrics, one column per session', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader')).toHaveText(['Tonight', 'Tuesday']);
    await expect(table.getByRole('rowheader')).toHaveText(['Length', 'Contractions', 'Time apart', 'Lasting', 'Strength', 'Pattern']);
    const expected: Record<string, [string, string]> = {
      Length: ['2 h 19 m', '4 h 35 m'],
      Contractions: ['22', '31'],
      'Time apart': ['6m 20s', '8m 50s'],
      Lasting: ['48s', '44s'],
      Strength: ['5', '4'],
      Pattern: ['Regular', 'Regular'],
    };
    for (const [label, values] of Object.entries(expected)) {
      await expect(table.getByRole('row', { name: new RegExp(`^${label}`) }).getByRole('cell')).toHaveText(values);
    }
  });

  test('Back returns to the sessions list', async ({ page }) => {
    await page.getByRole('button', { name: 'Back' }).click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/history');
  });
});

test('a third session gets a dotted muted outline', async ({ page }) => {
  await open(page, [tonight.id, tuesday.id, sunday.id]);
  const dotted = page.getByRole('list', { name: 'Sessions' }).locator('[data-series="tertiary"][aria-hidden="true"]');
  await expect(dotted).toHaveCSS('border-top-style', 'dotted');
  await expect(dotted).toHaveCSS('border-top-color', 'rgb(179, 172, 203)');
  await expect(page.getByRole('table').getByRole('columnheader')).toHaveText(['Tonight', 'Tuesday', 'Sunday']);
  const bar = page.getByRole('region', { name: 'Sunday night' }).locator('rect[data-bar-id]').first();
  await expect(bar).toHaveAttribute('stroke-dasharray', '1.5 3.5');
});

test.describe('too few valid sessions', () => {
  for (const [name, ids] of [
    ['unknown ids', ['nope', 'also-nope']],
    ['one valid id', ['nope']],
  ] as const) {
    test(`${name} show the prompt and a link to History`, async ({ page }) => {
      await open(page, name === 'one valid id' ? [tonight.id, ...ids] : [...ids]);
      await expect(page.getByText('Pick two or three sessions to compare')).toBeVisible();
      const link = page.getByRole('link', { name: 'Back to sessions' });
      await expect(link).toHaveAttribute('href', '#/history');
      await link.click();
      await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/history');
    });
  }

  test('no ids at all shows the prompt', async ({ page }) => {
    await page.goto('/#/compare');
    await expect(page.getByText('Pick two or three sessions to compare')).toBeVisible();
  });
});
