import { expect, test } from './fixtures';
import { buildSeries, makeSession, onboard, seedDb, waitForDb } from './helpers/db';

const MIN = 60_000;
const NOW = new Date(2026, 9, 20, 23, 40).getTime();

declare global {
  interface Window {
    __wl: { requests: number; held: number };
  }
}

test('the screen lock stays held while other screens are open mid-session', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { requests: 0, held: 0 };
    window.__wl = state;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          state.requests += 1;
          state.held += 1;
          const s = new EventTarget() as EventTarget & { released: boolean; release: () => Promise<void> };
          s.released = false;
          s.release = async () => {
            if (!s.released) {
              s.released = true;
              state.held -= 1;
              s.dispatchEvent(new Event('release'));
            }
          };
          return s;
        },
      },
    });
  });
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  const session = makeSession({ name: 'Test labour', startedAt: NOW - 90 * MIN });
  await seedDb(page, {
    sessions: [session],
    contractions: buildSeries({ sessionId: session.id, startAt: NOW - 40 * MIN, count: 6, intervalMs: 5 * MIN, durationMs: 55_000, intensity: 5 }),
  });
  await page.evaluate(() => {
    window.location.hash = '#/live';
  });
  await expect.poll(() => page.evaluate(() => window.__wl.held)).toBe(1);

  for (const hash of [`#/session/${session.id}`, '#/history', '#/settings']) {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => window.__wl.held)).toBe(1);
  }
});
