import { expect, test } from '../fixtures';
import { waitForDb } from '../helpers/db';

test('airplane mode: a new page opens offline from the service worker and J1 runs to the strength picker, with no foreign requests', async ({
  page,
  context,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
  const foreign: string[] = [];
  context.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (new URL(url).origin !== origin) foreign.push(url);
  });

  // Online: load, let the worker install and precache, then reload so the page is controlled.
  await page.goto('/');
  await waitForDb(page);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) throw new Error('the service worker did not activate');
  });
  await page.reload();
  await waitForDb(page);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { message: 'the service worker controls the page' })
    .toBe(true);
  // The precache holds the app shell.
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    let count = 0;
    for (const n of names) count += (await (await caches.open(n)).keys()).length;
    return count;
  });
  expect(cached).toBeGreaterThan(5);

  // Airplane mode: close the page, open a fresh one.
  await context.setOffline(true);
  await page.close();
  const offline = await context.newPage();
  await offline.goto('/');
  await waitForDb(offline);

  // Proof that the network really is gone: something that was never cached cannot be fetched.
  expect(await offline.evaluate(() => fetch('/never-cached.txt').then(() => 'online', () => 'offline'))).toBe('offline');

  // Lands on Welcome (first launch), and J1 runs entirely offline.
  await expect(offline.getByRole('heading', { level: 1, name: 'ebb' })).toBeVisible();
  await offline.getByRole('button', { name: 'Get started' }).click();
  await expect(offline.getByRole('heading', { level: 1, name: "Whenever you're ready." })).toBeVisible();
  await offline.getByRole('button', { name: /Start timing/ }).click();
  await expect(offline).toHaveURL(/#\/live$/);

  const hero = offline.getByTestId('hero');
  await offline.getByTestId('hero').getByRole('button').click();
  await expect(hero).toHaveAttribute('data-state', 'contracting');
  await offline.waitForTimeout(800);
  await offline.getByTestId('hero').getByRole('button').click();
  await expect(hero).toHaveAttribute('data-state', 'resting');
  await expect(offline.getByRole('radiogroup', { name: 'How strong was that one?' })).toBeVisible();

  // A reload while offline also comes back (the worker answers every same-origin request).
  await offline.reload();
  await waitForDb(offline);
  await expect(offline.getByTestId('hero')).toBeVisible();

  expect(foreign, 'requests to a foreign origin').toEqual([]);
  await context.setOffline(false);
});
