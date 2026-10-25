/**
 * A waiting service worker must never activate or reload the page during a session. To get a real waiting worker, the
 * app is served through a tiny same-machine proxy that can hand out a changed /sw.js (one extra comment), which the
 * browser treats as a new version: it installs, then waits, because the app never calls skipWaiting by itself.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Page } from '@playwright/test';
import { expect, test as base } from '../fixtures';
import { makeSession, onboard, seedDb, waitForDb } from '../helpers/db';

interface Proxy {
  url: string;
  /** Serve the changed worker from now on. */
  publishUpdate: () => void;
}

const test = base.extend<{ baseURL: string }, { swProxy: Proxy }>({
  swProxy: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, provide, workerInfo) => {
      const upstream = new URL(String(workerInfo.project.use.baseURL ?? 'http://localhost:4173'));
      let updated = false;
      const server = http.createServer((req, res) => {
        // No conditional requests and no compression, so the worker script can be rewritten byte for byte.
        const headers = { ...req.headers, host: upstream.host, 'accept-encoding': 'identity' };
        delete headers['if-none-match'];
        delete headers['if-modified-since'];
        const up = http.request(
          { host: upstream.hostname, port: upstream.port, path: req.url, method: req.method, headers },
          (ur) => {
            const isWorker = (req.url ?? '').split('?')[0] === '/sw.js';
            if (!isWorker || !updated) {
              res.writeHead(ur.statusCode ?? 502, ur.headers);
              ur.pipe(res);
              return;
            }
            const chunks: Buffer[] = [];
            ur.on('data', (c: Buffer) => chunks.push(c));
            ur.on('end', () => {
              const body = Buffer.concat([...chunks, Buffer.from('\n// ebb test: a newer version\n')]);
              const headers = { ...ur.headers, 'content-length': String(body.length) };
              delete headers.etag;
              res.writeHead(ur.statusCode ?? 200, headers);
              res.end(body);
            });
          },
        );
        up.on('error', () => {
          res.writeHead(502);
          res.end();
        });
        req.pipe(up);
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;
      await provide({ url: `http://localhost:${port}`, publishUpdate: () => void (updated = true) });
      await new Promise((resolve) => server.close(resolve));
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ swProxy }, provide) => {
    await provide(swProxy.url);
  },
});

const UPDATE_READY = 'Update ready — restart the app to use it';
const MIN = 60_000;

/** Registers the worker, waits until it is active, and counts controller changes and reloads from here on. */
async function installWorker(page: Page): Promise<void> {
  await page.goto('/');
  await waitForDb(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

async function instrument(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __marker: number; __controllerChanges: number };
    w.__marker = 1;
    w.__controllerChanges = 0;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      w.__controllerChanges++;
    });
  });
}

const state = (page: Page) =>
  page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const w = window as unknown as { __marker?: number; __controllerChanges?: number };
    return {
      marker: w.__marker ?? null,
      controllerChanges: w.__controllerChanges ?? null,
      waiting: reg?.waiting?.state ?? null,
      active: reg?.active?.state ?? null,
    };
  });

test('a waiting worker during an active session is not activated and does not reload; Settings says it is ready', async ({ page, swProxy }) => {
  await installWorker(page);
  await onboard(page);
  await seedDb(page, { sessions: [makeSession({ name: 'Test labour', startedAt: Date.now() - 30 * MIN })] });
  await page.evaluate(() => {
    window.location.hash = '#/live';
  });
  await expect(page.getByTestId('hero')).toBeVisible();
  // Reload once so the page is controlled by the first worker; from here a second worker can only wait.
  await page.reload();
  await waitForDb(page);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await expect(page.getByTestId('hero')).toBeVisible();
  await instrument(page);

  swProxy.publishUpdate();
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.update();
  });
  await expect.poll(async () => (await state(page)).waiting, { message: 'a new worker is waiting' }).toBe('installed');

  // Give any (wrong) activation or reload time to show itself.
  await page.waitForTimeout(2500);
  expect(await state(page)).toEqual({ marker: 1, controllerChanges: 0, waiting: 'installed', active: 'activated' });
  await expect(page.getByTestId('hero')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#/live');

  // Settings, reached without a reload, says so.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByText(UPDATE_READY)).toBeVisible();
  expect(await state(page)).toMatchObject({ marker: 1, controllerChanges: 0, waiting: 'installed' });
});

test('with no session open, a cold start applies the waiting worker', async ({ page, swProxy }) => {
  await installWorker(page);
  await onboard(page);
  await page.reload();
  await waitForDb(page);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  swProxy.publishUpdate();
  // The next launch finds the changed worker while the app is still starting, and with no session it takes over:
  // activating it reloads the page, so a second load follows the one we asked for.
  let loads = 0;
  page.on('load', () => loads++);
  await page.reload();
  await expect.poll(() => loads, { timeout: 15_000, message: 'the page restarted onto the new worker' }).toBeGreaterThanOrEqual(2);
  await waitForDb(page);
  await expect.poll(async () => (await state(page)).waiting).toBeNull();
});
