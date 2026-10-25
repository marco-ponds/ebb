/**
 * Performance budgets, measured in the browser. Chromium only: WebKit has no CDP touch input and a different paint
 * timeline, and these numbers are meant to be comparable run to run. The thresholds are the spec's, unrelaxed.
 */
import type { CDPSession, Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { buildSeries, makeSession, onboard, seedDb, waitForDb } from '../helpers/db';

test.skip(({ browserName }) => browserName !== 'chromium', 'performance budgets are measured on Chromium only');

const MIN = 60_000;
const HOUR = 60 * MIN;
const hero = (page: Page) => page.getByTestId('hero');
const heroButton = (page: Page) => hero(page).getByRole('button');

/** Measured numbers go into the test's annotations (visible in the HTML/JSON report), not into the console. */
const note = (text: string) => test.info().annotations.push({ type: 'perf', description: text });

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const percentile = (xs: number[], p: number) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
};

async function openLive(page: Page, minutesIn = 120): Promise<void> {
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  await seedDb(page, { sessions: [makeSession({ name: 'Test labour', startedAt: Date.now() - minutesIn * MIN })] });
  await page.goto('/#/live');
  await expect(hero(page)).toHaveAttribute('data-state', 'resting');
}

test.describe('taps and commits', () => {
  test('tap to visual change takes under 100 ms (median of 10), and DB commits stay under 50 ms at p95', async ({ page }) => {
    await openLive(page);
    await page.evaluate(() => {
      const w = window as unknown as { __up: number[]; __changed: number[] };
      w.__up = [];
      w.__changed = [];
      document.addEventListener('pointerup', () => w.__up.push(performance.now()), true);
      new MutationObserver(() => w.__changed.push(performance.now())).observe(document.querySelector('[data-testid="hero"]') as HTMLElement, {
        attributes: true,
        attributeFilter: ['data-state'],
      });
    });
    // 24 taps: 12 contractions, rated and skipped past the 600 ms debounce.
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(650);
      await heroButton(page).click();
      await expect(hero(page)).toHaveAttribute('data-state', i % 2 === 0 ? 'contracting' : 'resting');
    }

    const deltas = await page.evaluate(() => {
      const w = window as unknown as { __up: number[]; __changed: number[] };
      return w.__changed.slice(0, 10).map((t, i) => t - w.__up[i]);
    });
    expect(deltas).toHaveLength(10);
    const med = median(deltas);
    note(`tap to visual change, median of 10 = ${med.toFixed(1)} ms (max ${Math.max(...deltas).toFixed(1)} ms)`);
    expect(med).toBeGreaterThanOrEqual(0);
    expect(med).toBeLessThan(100);

    const commits = await page.evaluate(() => performance.getEntriesByName('ebb:db-commit', 'measure').map((m) => m.duration));
    // Every tap is one committed write (the session seed was written before the app measured anything it owns).
    expect(commits.length).toBeGreaterThanOrEqual(24);
    const p95 = percentile(commits, 0.95);
    note(`DB commit p95 over ${commits.length} writes = ${p95.toFixed(1)} ms (median ${median(commits).toFixed(1)} ms)`);
    expect(p95).toBeLessThan(50);
  });
});

test.describe('cached reopen', () => {
  test('first contentful paint under 500 ms and the hero enabled under 1 s (median of 3 reopens)', async ({ page, context }) => {
    // The first visit installs the service worker; one more load gets it in control, so later opens are cache hits.
    await openLive(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await waitForDb(page);
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await page.close();

    const fcps: number[] = [];
    const interactive: number[] = [];
    for (let i = 0; i < 3; i++) {
      const reopened = await context.newPage();
      await reopened.addInitScript(() => {
        const w = window as unknown as { __interactiveAt?: number };
        const mo = new MutationObserver(() => {
          const b = document.querySelector<HTMLButtonElement>('[data-testid="hero"] button');
          if (b && !b.disabled && w.__interactiveAt === undefined) {
            w.__interactiveAt = performance.now();
            mo.disconnect();
          }
        });
        mo.observe(document, { childList: true, subtree: true, attributes: true });
      });
      await reopened.goto('/#/live');
      await waitForDb(reopened);
      await expect(hero(reopened)).toBeVisible();
      const timing = await reopened.evaluate(
        () =>
          new Promise<{ fcp: number; interactive: number }>((resolve) => {
            const w = window as unknown as { __interactiveAt?: number };
            const read = () => {
              const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
              if (fcp !== undefined && w.__interactiveAt !== undefined) resolve({ fcp, interactive: w.__interactiveAt });
              else setTimeout(read, 50);
            };
            new PerformanceObserver(read).observe({ type: 'paint', buffered: true });
            read();
          }),
      );
      fcps.push(timing.fcp);
      interactive.push(timing.interactive);
      await reopened.close();
    }
    note(`cached reopen FCP ${fcps.map((x) => x.toFixed(0)).join('/')} ms, interactive ${interactive.map((x) => x.toFixed(0)).join('/')} ms`);
    expect(median(fcps)).toBeLessThan(500);
    expect(median(interactive)).toBeLessThan(1000);
  });
});

test.describe('a 24 h session with 320 contractions', () => {
  const started = Date.now() - 25 * HOUR;
  const session = makeSession({ name: 'Long one', startedAt: started, endedAt: started + 24 * HOUR });
  const rows = buildSeries({ sessionId: session.id, startAt: started + 5 * MIN, count: 320, intervalMs: 4.5 * MIN, durationMs: 55_000, intensity: 6 });

  async function openDetail(page: Page): Promise<void> {
    await page.goto('/');
    await waitForDb(page);
    await onboard(page);
    await seedDb(page, { sessions: [session], contractions: rows });
    await page.goto(`/#/session/${session.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Long one');
    await expect(page.locator('svg[role="img"]').first()).toBeVisible();
  }

  async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number; id: number }>) {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : points });
  }

  test('a scripted 2 s pan on the timeline keeps the median frame interval at 17 ms or less', async ({ page, context }) => {
    await openDetail(page);
    const timeline = page.locator('svg[role="img"]').first();
    await timeline.scrollIntoViewIfNeeded();
    const box = await timeline.boundingBox();
    if (!box) throw new Error('no timeline box');
    const cdp = await context.newCDPSession(page);
    const bars = () => timeline.locator('rect[data-bar-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-bar-id')));
    const wholeDay = await bars();
    const cx = box.x + box.width / 2;
    const cy = box.y + Math.min(box.height / 2, 60);

    // Pinch out to zoom in (24 h down to a few hours), so there is room to pan.
    await touch(cdp, 'touchStart', [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }]);
    for (let i = 1; i <= 10; i++) {
      const d = 30 + i * 12;
      await touch(cdp, 'touchMove', [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }]);
      await page.waitForTimeout(20);
    }
    await touch(cdp, 'touchEnd', []);
    // Past the 300 ms double-tap window, or the next touch would reset the zoom.
    await page.waitForTimeout(700);
    const zoomed = await bars();
    expect(zoomed.length, 'the pinch zoomed the timeline in').toBeLessThan(wholeDay.length);

    // One finger drags right to left across 2 s.
    const area = await timeline.boundingBox(); // the page can have scrolled since the pinch
    if (!area) throw new Error('no timeline box');
    const span = area.width * 0.6;
    const steps = 60;
    const startX = cx + span / 2;
    // The pinch can leave a tooltip over the chart. A tap on a blank part of the chart closes it; the drag then starts there too.
    const blankY = () =>
      page.evaluate(
        ([x, top, height]) => {
          const svg = document.querySelectorAll('svg[role="img"]')[0];
          for (let y = top + 8; y < top + height; y += 4) if (document.elementFromPoint(x, y) === svg) return y;
          throw new Error('no blank spot on the timeline at this x');
        },
        [startX, area.y, area.height],
      );
    await page.mouse.click(startX, await blankY());
    await page.waitForTimeout(700);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    const panY = await blankY();
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __sampling: boolean };
      w.__frames = [];
      w.__sampling = true;
      const loop = (t: number) => {
        w.__frames.push(t);
        if (w.__sampling) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });

    await touch(cdp, 'touchStart', [{ x: startX, y: panY, id: 1 }]);
    const began = Date.now();
    for (let i = 1; i <= steps; i++) {
      const phase = i / steps;
      const x = startX - span * phase;
      await touch(cdp, 'touchMove', [{ x, y: panY, id: 1 }]);
      const due = began + (2000 * i) / steps;
      await page.waitForTimeout(Math.max(0, due - Date.now()));
    }
    await touch(cdp, 'touchEnd', []);
    const elapsed = Date.now() - began;
    await page.waitForTimeout(100);
    expect(await bars(), 'the pan moved the visible window').not.toEqual(zoomed);

    const frames = await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __sampling: boolean };
      w.__sampling = false;
      return w.__frames;
    });
    const intervals = frames.slice(1).map((t, i) => t - frames[i]);
    const med = median(intervals);
    note(`2 s pan (${elapsed} ms, ${frames.length} frames) median frame interval ${med.toFixed(2)} ms, p95 ${percentile(intervals, 0.95).toFixed(2)} ms`);
    expect(elapsed).toBeGreaterThanOrEqual(1900);
    expect(frames.length).toBeGreaterThan(60);
    expect(med).toBeLessThanOrEqual(17);
  });

  test('the expanded log is virtualised: hundreds of entries, a few dozen rows in the DOM', async ({ page }) => {
    await openDetail(page);
    await page.getByRole('button', { name: /Show all 320 entries/ }).click();
    const rowsInDom = page.locator('table tbody tr:not([aria-hidden="true"])');
    await expect(rowsInDom.first()).toBeVisible();
    const initial = await rowsInDom.count();
    note(`expanded log renders ${initial} of 320 rows`);
    expect(initial).toBeGreaterThan(5);
    expect(initial).toBeLessThan(60);

    // Scrolling to the end swaps the rows, it does not add them.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => rowsInDom.count()).toBeLessThan(60);
    const last = await rowsInDom.last().innerText();
    expect(last).toMatch(/\d\d:\d\d/);
    const oldest = new Date(rows[0].startAt);
    const hhmm = `${String(oldest.getHours()).padStart(2, '0')}:${String(oldest.getMinutes()).padStart(2, '0')}`;
    await expect(page.locator('table tbody')).toContainText(hhmm);
  });
});
