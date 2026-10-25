import { test, expect } from './fixtures';
import { buildSeries, clearDb, makeSession, readDb, seedDb, waitForDb } from './helpers/db';

test('first paint uses the Dusk background', async ({ page }) => {
  await page.goto('/');
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  expect(bg).toBe('rgb(27, 25, 41)');
});

test('manifest link resolves with the required fields', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await request.get(new URL(href!, page.url()).toString());
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({
    name: 'Ebb — Contraction Timer',
    short_name: 'Ebb',
    display: 'standalone',
    orientation: 'any',
    background_color: '#1B1929',
    theme_color: '#1B1929',
  });
  const sizes = m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? ':' + i.purpose : ''}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512:maskable']));
});

test('service worker registers and the shell renders offline', async ({ page, context }) => {
  await page.goto('/');
  await waitForDb(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // The first load is not controlled (clientsClaim is off), so reload once while online.
  await page.reload();
  await waitForDb(page);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await waitForDb(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await context.setOffline(false);
});

test('seed, read and clear helpers round-trip through the app database', async ({ page }) => {
  await page.goto('/');
  await waitForDb(page);
  const session = makeSession({});
  const contractions = buildSeries({ sessionId: session.id, startAt: 1_700_000_000_000, count: 3, intervalMs: 300_000, durationMs: 60_000 });
  await seedDb(page, { sessions: [session], contractions });
  const dump = await readDb(page);
  expect(dump.sessions).toEqual([session]);
  expect(dump.contractions).toHaveLength(3);
  await clearDb(page);
  expect((await readDb(page)).contractions).toEqual([]);
});

test.describe('prefers-contrast: more keeps --text-muted legible on every palette', () => {
  const muted = (page: import('@playwright/test').Page) =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim().toLowerCase());
  const cases = [
    { theme: 'night', colorScheme: 'dark', expected: '#d6d0e8' },
    { theme: 'night', colorScheme: 'light', expected: '#d6d0e8' },
    { theme: 'day', colorScheme: 'dark', expected: '#3a3450' },
    { theme: 'system', colorScheme: 'dark', expected: '#d6d0e8' },
    { theme: 'system', colorScheme: 'light', expected: '#3a3450' },
  ] as const;
  for (const c of cases) {
    test(`${c.theme} theme, ${c.colorScheme} OS`, async ({ page }) => {
      await page.emulateMedia({ contrast: 'more', colorScheme: c.colorScheme });
      await page.goto('/');
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), c.theme);
      expect(await muted(page)).toBe(c.expected);
    });
  }
});
