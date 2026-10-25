import { test, expect } from './fixtures';
import { makeContraction, makeSession, onboard, seedDb, waitForDb } from './helpers/db';

test('with a seeded active session, opening #/ lands on #/live', async ({ page }) => {
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  await seedDb(page, { sessions: [makeSession({ startedAt: Date.now() - 3_600_000 })] });
  await page.goto('/#/');
  await expect(page).toHaveURL(/#\/live$/);
});

test('with a seeded open contraction, opening #/ lands on #/live', async ({ page }) => {
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  const session = makeSession({ startedAt: Date.now() - 3_600_000 });
  await seedDb(page, {
    sessions: [session],
    contractions: [makeContraction({ sessionId: session.id, startAt: Date.now() - 30_000, endAt: null })],
  });
  await page.goto('/#/');
  await expect(page).toHaveURL(/#\/live$/);
});

test('#/live with no session goes back to Start', async ({ page }) => {
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  await page.goto('/#/live');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { level: 1, name: "Whenever you're ready." })).toBeVisible();
});

test('a malformed hash falls back to Start instead of breaking', async ({ page }) => {
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  await page.goto('/#/session/%E0%A4%A');
  await expect(page.getByRole('heading', { level: 1, name: "Whenever you're ready." })).toBeVisible();
});

// The skeleton is only on screen between SKELETON_AFTER_MS (300 ms) and the database opening, so the
// injected delay must leave a window wide enough for Playwright's first assertion to land under
// parallel-worker load (a 600 ms delay left ~300 ms and made this test fail whenever workers competed).
const OPEN_DELAY_MS = 2000;

test('a slow database read shows the skeleton, and the page is never blank or white', async ({ page }) => {
  await page.addInitScript((delay: number) => {
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof open>) => {
      const handlers: Record<string | symbol, unknown> = {};
      let real: IDBOpenDBRequest | null = null;
      setTimeout(() => {
        real = open(...args);
        for (const [k, v] of Object.entries(handlers)) (real as unknown as Record<string, unknown>)[k] = v;
      }, delay);
      return new Proxy({} as IDBOpenDBRequest, {
        get: (_, k) => (real ? Reflect.get(real, k) : handlers[k]),
        set: (_, k, v) => {
          handlers[k] = v;
          if (real) Reflect.set(real, k, v);
          return true;
        },
      });
    }) as typeof indexedDB.open;
  }, OPEN_DELAY_MS);

  const backgrounds: string[] = [];
  const sample = async () =>
    backgrounds.push(
      await page.evaluate(() => `${getComputedStyle(document.documentElement).backgroundColor}|${getComputedStyle(document.body).backgroundColor}`),
    );

  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForSelector('body');
  await sample();
  await expect(page.locator('[data-skeleton="button"]')).toBeVisible();
  await expect(page.locator('#root')).not.toHaveText(/\S/); // no text, no spinner
  await sample();
  await waitForDb(page);
  await expect(page.locator('[data-skeleton="button"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await sample();

  expect(backgrounds.length).toBe(3);
  for (const bg of backgrounds) expect(bg).toBe('rgb(27, 25, 41)|rgb(27, 25, 41)');
});
