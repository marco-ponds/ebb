import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { buildSeries, makeContraction, makeEvent, makeSession, onboard, readDb, seedDb, waitForDb } from './helpers/db';
import { DEFAULT_SETTINGS } from '../src/db/defaults';
import type { Contraction, EbbEvent, Session, Settings } from '../src/db/types';

const MIN = 60_000;
const hero = (page: Page) => page.getByTestId('hero');
const heroButton = (page: Page) => hero(page).getByRole('button');

interface OpenOptions {
  session?: Partial<Session>;
  contractions?: (sessionId: string) => Contraction[];
  events?: (sessionId: string) => EbbEvent[];
  settings?: Partial<Settings>;
  /** Install a fake clock at this time before the app boots. */
  clockAt?: number;
}

/** Onboards, seeds a running session, and opens #/live. Returns the session. */
async function openLive(page: Page, o: OpenOptions = {}): Promise<Session> {
  const now = o.clockAt ?? Date.now();
  if (o.clockAt !== undefined) await page.clock.install({ time: o.clockAt });
  await page.goto('/');
  await waitForDb(page);
  await onboard(page, o.settings);
  const session = makeSession({ name: 'Test labour', startedAt: now - 2 * 60 * MIN, ...o.session });
  await seedDb(page, {
    sessions: [session],
    contractions: o.contractions?.(session.id) ?? [],
    events: o.events?.(session.id) ?? [],
  });
  await page.evaluate(() => {
    window.location.hash = '#/live';
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Test labour' })).toBeVisible();
  return session;
}

const clock = (t: number) => new Date(t);
const hhmm = (t: number) => `${String(clock(t).getHours()).padStart(2, '0')}:${String(clock(t).getMinutes()).padStart(2, '0')}`;

test.describe('tracking loop', () => {
  test('resting -> contracting -> resting, committing every tap to IndexedDB', async ({ page }) => {
    await openLive(page);
    await expect(hero(page)).toHaveAttribute('data-state', 'resting');
    await expect(heroButton(page)).toContainText('Tap when it starts');
    await expect(heroButton(page)).toContainText('No contractions yet');
    await expect(heroButton(page)).toHaveAccessibleName('Start contraction. No contractions yet');
    await expect(page.getByText('Started', { exact: false })).toContainText('so far');

    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    const open = (await readDb(page)).contractions;
    expect(open).toHaveLength(1);
    expect(open[0].endAt).toBeNull();
    await expect(heroButton(page)).toContainText('Contraction');
    await expect(heroButton(page)).toContainText('Tap when it eases');
    await expect(heroButton(page)).toHaveAccessibleName(/^End contraction\. \d+ seconds? so far$/);
    await expect(page.getByTestId('announcer')).toHaveText('Contraction started');

    // LT-03: header and stat cards at 55 %; averages, pattern, mini timeline hidden.
    await expect(page.locator('header')).toHaveCSS('opacity', '0.55');
    await expect(page.getByText('Time apart')).toHaveCSS('opacity', '0.55');
    await expect(page.getByText('Last 30 min')).toHaveCount(0);
    await expect(page.getByText('Last hour')).toHaveCount(0);
    const hero300 = await heroButton(page).boundingBox();
    expect(Math.round(hero300?.width ?? 0)).toBe(300);
    expect(Math.round(hero300?.height ?? 0)).toBe(300);

    await page.waitForTimeout(700);
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'resting');
    const done = (await readDb(page)).contractions;
    expect(done).toHaveLength(1);
    expect(done[0].endAt).not.toBeNull();
    await expect(heroButton(page)).toContainText('since the last one started');
    await expect(page.getByTestId('announcer')).toHaveText(/^Contraction ended, lasted \d+ seconds?$/);
    await expect(page.locator('header')).toHaveCSS('opacity', '1');
  });

  test('LT-01: the hero responds within 100 ms of pointer-up (median of 5)', async ({ page }) => {
    await openLive(page);
    await page.evaluate(() => {
      const w = window as unknown as { __up: number[]; __changed: number[] };
      w.__up = [];
      w.__changed = [];
      document.addEventListener('pointerup', () => w.__up.push(performance.now()), true);
      const target = document.querySelector('[data-testid="hero"]') as HTMLElement;
      new MutationObserver(() => w.__changed.push(performance.now())).observe(target, {
        attributes: true,
        attributeFilter: ['data-state'],
      });
    });
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(700);
      await heroButton(page).click();
      await expect(hero(page)).toHaveAttribute('data-state', i % 2 === 0 ? 'contracting' : 'resting');
    }
    const deltas = await page.evaluate(() => {
      const w = window as unknown as { __up: number[]; __changed: number[] };
      return w.__changed.slice(0, 5).map((t, i) => t - w.__up[i]);
    });
    expect(deltas).toHaveLength(5);
    const median = [...deltas].sort((a, b) => a - b)[2];
    expect(median).toBeGreaterThanOrEqual(0);
    expect(median).toBeLessThan(100);
    expect((await readDb(page)).contractions).toHaveLength(3);
  });

  test('LT-02: the resting timer counts from the last start, and the name says so', async ({ page }) => {
    const now = Date.now();
    await openLive(page, {
      contractions: (sessionId) => [makeContraction({ sessionId, startAt: now - 222_000, endAt: now - 170_000 })],
    });
    await expect(heroButton(page)).toHaveText(/Tap when it starts3:4\dsince the last one started/);
    await expect(heroButton(page)).toHaveAccessibleName(/^Start contraction\. 3 minutes 4\d seconds since the last one started$/);
  });

  test('LT-11: reopening mid-contraction resumes with the true elapsed time', async ({ page }) => {
    const startAt = Date.now() - 83_000;
    await openLive(page, { contractions: (sessionId) => [makeContraction({ sessionId, startAt, endAt: null })] });
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    await page.reload();
    await waitForDb(page);
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    const text = (await heroButton(page).innerText()).match(/(\d+):(\d\d)/);
    const shown = Number(text?.[1]) * 60 + Number(text?.[2]);
    const expected = (Date.now() - startAt) / 1000;
    expect(Math.abs(shown - expected)).toBeLessThanOrEqual(1.5);
    expect(shown).toBeGreaterThanOrEqual(83);
  });

  test('LT-16: buzzes 15 ms on start and [10, 60, 10] on stop when haptics are on', async ({ page }) => {
    await page.addInitScript(() => {
      const calls: unknown[] = [];
      (window as unknown as { __vibes: unknown[] }).__vibes = calls;
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (p: unknown) => (calls.push(p), true) });
    });
    await openLive(page);
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    await page.waitForTimeout(700);
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'resting');
    expect(await page.evaluate(() => (window as unknown as { __vibes: unknown[] }).__vibes)).toEqual([15, [10, 60, 10]]);
  });

  test('LT-16: stays silent with haptics off', async ({ page }) => {
    await page.addInitScript(() => {
      const calls: unknown[] = [];
      (window as unknown as { __vibes: unknown[] }).__vibes = calls;
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (p: unknown) => (calls.push(p), true) });
    });
    await openLive(page, { settings: { haptics: false } });
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    expect(await page.evaluate(() => (window as unknown as { __vibes: unknown[] }).__vibes)).toEqual([]);
  });
});

test.describe('information display', () => {
  const series = (now: number, o: { count: number; intervalMs: number; durationMs: number }) => (sessionId: string) =>
    buildSeries({
      sessionId,
      startAt: now - 3 * MIN - (o.count - 1) * o.intervalMs - o.durationMs,
      ...o,
    });

  test('LT-05/06/07: a steady series shows stats, averages and a regular pattern', async ({ page }) => {
    const now = Date.now();
    await openLive(page, { contractions: series(now, { count: 12, intervalMs: 260_000, durationMs: 55_000 }) });
    const stats = page.getByText('Time apart').locator('..');
    await expect(stats).toContainText('4m 20s');
    await expect(stats).toContainText('last one');
    await expect(page.getByText('Lasting').locator('..')).toContainText('55s');
    await expect(page.getByText('Last 30 min').locator('..')).toContainText('every 4m 20s · 55s long');
    await expect(page.getByText('Last hour', { exact: true }).first().locator('..')).toContainText('every 4m 20s · 55s long');
    const pattern = page.getByText('Regular · steady');
    await expect(pattern).toBeVisible();
    await expect(pattern.locator('[data-tone="mint"]')).toHaveCount(1);
  });

  const alternating = (now: number, a: number, b: number) => (sessionId: string) => {
    const gaps = Array.from({ length: 11 }, (_, i) => (i % 2 === 0 ? a : b) * MIN);
    let t = now - 4 * MIN - gaps.reduce((sum, g) => sum + g, 0);
    return [0, ...gaps].map((g) => {
      t += g;
      return makeContraction({ sessionId, startAt: t, endAt: t + 50_000 });
    });
  };
  const dots = [
    { name: 'butter for fairly regular', a: 3, b: 5, label: /^Fairly regular/, tone: 'butter' },
    { name: 'faint for irregular', a: 2, b: 8, label: /^Irregular/, tone: 'faint' },
  ];
  for (const d of dots) {
    test(`LT-07: ${d.name}`, async ({ page }) => {
      await openLive(page, { contractions: alternating(Date.now(), d.a, d.b) });
      const line = page.getByText(d.label);
      await expect(line).toBeVisible();
      await expect(line.locator(`[data-tone="${d.tone}"]`)).toHaveCount(1);
    });
  }

  test('1-3 contractions show dashes, "Not enough yet" and no pattern line', async ({ page }) => {
    const now = Date.now();
    await openLive(page, {
      contractions: (sessionId) => [makeContraction({ sessionId, startAt: now - 5 * MIN, endAt: now - 5 * MIN + 55_000 })],
    });
    await expect(page.getByText('Time apart').locator('..')).toContainText('—');
    await expect(page.getByText('Lasting').locator('..')).toContainText('55s');
    await expect(page.getByText('Not enough yet')).toHaveCount(2);
    await expect(page.getByText(/regular/i)).toHaveCount(0);
  });

  test('LT-09: the mini timeline draws hollow unrated bars, an event circle and the now line', async ({ page }) => {
    const now = Date.now();
    const waters = now - 20 * MIN;
    await openLive(page, {
      contractions: (sessionId) => [
        ...buildSeries({ sessionId, startAt: now - 30 * MIN, count: 4, intervalMs: 4 * MIN, durationMs: 50_000 }),
        ...buildSeries({ sessionId, startAt: now - 12 * MIN, count: 2, intervalMs: 4 * MIN, durationMs: 50_000, intensity: 7 }),
      ],
      events: (sessionId) => [makeEvent({ sessionId, at: waters, type: 'waters', details: 'clear' })],
    });
    const chart = page.getByRole('img', { name: /^Last hour: 6 contractions/ });
    await expect(chart).toBeVisible();
    await expect(chart.locator('rect[data-bar-id][data-hollow="true"]')).toHaveCount(4);
    await expect(chart.locator('rect[data-bar-id][data-hollow="false"]')).toHaveCount(2);
    await expect(chart.locator('[data-marker] circle')).toHaveCount(1);
    await expect(chart.locator('line[data-now]')).toHaveCount(1);
    const link = page.getByRole('link', { name: new RegExp(`^Last hour\\s*6 contractions · waters ${hhmm(waters)}$`) });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /^#\/session\//);
  });

  test('the menu sheet reaches All sessions and Settings', async ({ page }) => {
    await openLive(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    const dialog = page.getByRole('dialog', { name: 'Menu' });
    await expect(dialog.getByRole('link', { name: 'All sessions' })).toHaveAttribute('href', '#/history');
    await dialog.getByRole('link', { name: 'Settings' }).click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/settings');
  });

  test('the session name link is at least 48 px tall', async ({ page }) => {
    await openLive(page);
    const box = await page.getByRole('link', { name: 'Test labour' }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  });

  test('the session name links to the session detail', async ({ page }) => {
    const session = await openLive(page);
    await page.getByRole('link', { name: 'Test labour' }).click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(`#/session/${session.id}`);
  });
});

test.describe('threshold banner (LT-15)', () => {
  test('shows when an enabled threshold is met, dismisses, and returns only after the rule breaks and holds again', async ({ page }) => {
    const t0 = Date.now();
    const thresholds = DEFAULT_SETTINGS.thresholds.map((t) => (t.id === 'preset-3-in-10' ? { ...t, enabled: true } : t));
    const session = await openLive(page, {
      clockAt: t0,
      settings: { thresholds },
      contractions: (sessionId) =>
        [8, 5, 2].map((ago) => makeContraction({ sessionId, startAt: t0 - ago * MIN, endAt: t0 - ago * MIN + 40_000 })),
    });
    const banner = page.getByRole('status').filter({ hasText: 'Matches the threshold you set' });
    await expect(banner).toHaveText('Matches the threshold you set — 3 in 10 min');
    await expect.poll(async () => (await readDb(page)).sessions.find((s) => s.id === session.id)?.thresholdMetAt).not.toBeNull();

    await banner.getByRole('button', { name: 'Dismiss' }).click();
    await expect(banner).toHaveCount(0);

    // The rule stops holding (11 minutes pass) and is re-evaluated on the 60 s tick.
    await page.clock.fastForward(11 * MIN);
    await expect(banner).toHaveCount(0);
    for (let i = 0; i < 3; i++) {
      await page.clock.runFor(1000);
      await heroButton(page).click();
      await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
      await page.clock.runFor(1000);
      await heroButton(page).click();
      await expect(hero(page)).toHaveAttribute('data-state', 'resting');
    }
    await expect(banner).toHaveText('Matches the threshold you set — 3 in 10 min');
  });

  test('is absent when no threshold is enabled', async ({ page }) => {
    const now = Date.now();
    await openLive(page, {
      contractions: (sessionId) =>
        [8, 5, 2].map((ago) => makeContraction({ sessionId, startAt: now - ago * MIN, endAt: now - ago * MIN + 40_000 })),
    });
    await expect(page.getByText('Last 30 min')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Matches the threshold' })).toHaveCount(0);
  });
});
