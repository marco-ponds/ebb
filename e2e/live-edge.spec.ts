import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { makeContraction, makeSession, onboard, readDb, seedDb, waitForDb } from './helpers/db';
import type { Contraction, Session, Settings } from '../src/db/types';

const MIN = 60_000;
const hero = (page: Page) => page.getByTestId('hero');
const heroButton = (page: Page) => hero(page).getByRole('button');

interface OpenOptions {
  contractions?: (sessionId: string) => Contraction[];
  settings?: Partial<Settings>;
  clockAt?: number;
}

async function openLive(page: Page, o: OpenOptions = {}): Promise<Session> {
  const now = o.clockAt ?? Date.now();
  if (o.clockAt !== undefined) await page.clock.install({ time: o.clockAt });
  await page.goto('/');
  await waitForDb(page);
  await onboard(page, o.settings);
  const session = makeSession({ name: 'Test labour', startedAt: now - 3 * 60 * MIN });
  await seedDb(page, { sessions: [session], contractions: o.contractions?.(session.id) ?? [] });
  await page.evaluate(() => {
    window.location.hash = '#/live';
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Test labour' })).toBeVisible();
  return session;
}

test.describe('debounce (LT-04)', () => {
  test('a double tap creates one contraction', async ({ page }) => {
    await openLive(page, { clockAt: Date.now() });
    await heroButton(page).click();
    await heroButton(page).click({ force: true });
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    const rows = (await readDb(page)).contractions;
    expect(rows).toHaveLength(1);
    expect(rows[0].endAt).toBeNull();

    // 600 ms later the next tap counts.
    await page.clock.runFor(700);
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'resting');
    expect((await readDb(page)).contractions[0].endAt).not.toBeNull();
  });
});

test.describe('stale contraction', () => {
  test('after 6 minutes the card offers Ended earlier… and Keep timing', async ({ page }) => {
    const t0 = Date.now();
    await openLive(page, {
      clockAt: t0,
      contractions: (sessionId) => [makeContraction({ sessionId, startAt: t0 - MIN, endAt: null })],
    });
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    await expect(page.getByText(/Still going/)).toHaveCount(0);

    await page.clock.fastForward(5 * MIN);
    const card = page.getByText("Still going? This one's been running 6 min.");
    await expect(card).toBeVisible();
    // The button still shows the elapsed time.
    await expect(heroButton(page)).toContainText(/6:0\d/);

    await page.getByRole('button', { name: 'Keep timing' }).click();
    await expect(card).toHaveCount(0);
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
  });

  test('Ended earlier… saves the chosen end time', async ({ page }) => {
    const t0 = Date.now();
    await openLive(page, {
      clockAt: t0,
      contractions: (sessionId) => [makeContraction({ sessionId, startAt: t0 - 23 * MIN, endAt: null })],
    });
    await page.getByRole('button', { name: 'Ended earlier…' }).click();
    const dialog = page.getByRole('dialog', { name: 'When did it end?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'resting');
    const [row] = (await readDb(page)).contractions;
    expect(row.endAt).not.toBeNull();
    expect(row.endAt as number).toBeGreaterThan(row.startAt);
    expect(row.endAt as number).toBeLessThanOrEqual(t0 + 10_000);
  });
});

test.describe('long pause', () => {
  test('at 61 minutes the paused card appears; the session is never ended for you', async ({ page }) => {
    const now = Date.now();
    const session = await openLive(page, {
      contractions: (sessionId) => [makeContraction({ sessionId, startAt: now - 61 * MIN, endAt: now - 60 * MIN })],
    });
    await expect(page.getByText('Contractions paused? Last one 1 h 1 m ago.')).toBeVisible();

    await page.getByRole('button', { name: 'Keep session going' }).click();
    await expect(page.getByText(/Contractions paused/)).toHaveCount(0);
    expect((await readDb(page)).sessions.find((s) => s.id === session.id)?.endedAt).toBeNull();
  });

  test('is absent at 59 minutes', async ({ page }) => {
    const now = Date.now();
    await openLive(page, {
      contractions: (sessionId) => [makeContraction({ sessionId, startAt: now - 59 * MIN, endAt: now - 58 * MIN })],
    });
    await expect(page.getByText('Time apart')).toBeVisible();
    await expect(page.getByText(/Contractions paused/)).toHaveCount(0);
  });

  test('End session… confirms, ends the session and leaves Live', async ({ page }) => {
    const now = Date.now();
    const session = await openLive(page, {
      contractions: (sessionId) => [makeContraction({ sessionId, startAt: now - 70 * MIN, endAt: now - 69 * MIN })],
    });
    await page.getByRole('button', { name: 'End session…' }).click();
    const dialog = page.getByRole('dialog', { name: 'End this session?' });
    await expect(dialog).toContainText('1 contraction over 3 h');
    await dialog.getByRole('button', { name: 'Keep going' }).click();
    await expect(dialog).toHaveCount(0);
    expect((await readDb(page)).sessions.find((s) => s.id === session.id)?.endedAt).toBeNull();

    await page.getByRole('button', { name: 'End session…' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'End session' }).click();
    await expect.poll(async () => (await readDb(page)).sessions.find((s) => s.id === session.id)?.endedAt).not.toBeNull();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/');
  });
});

test.describe('backgrounding ("Phone call")', () => {
  test('the timer is recomputed from the stored start when the app returns', async ({ page }) => {
    const t0 = Date.now();
    await openLive(page, {
      clockAt: t0,
      contractions: (sessionId) => [makeContraction({ sessionId, startAt: t0 - 10_000, endAt: null })],
    });
    await expect(heroButton(page)).toContainText(/0:1\d/);

    const setVisibility = (state: 'hidden' | 'visible') =>
      page.evaluate((s) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: s });
        Object.defineProperty(document, 'hidden', { configurable: true, value: s === 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      }, state);

    await setVisibility('hidden');
    await page.clock.fastForward(3 * MIN);
    await setVisibility('visible');
    await expect(heroButton(page)).toContainText(/3:[1-2]\d/);
    await expect(heroButton(page)).toHaveAccessibleName(/^End contraction\. 3 minutes \d+ seconds so far$/);
  });
});

test.describe('wake lock pill', () => {
  test('reads "Screen may sleep" when the API is missing', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
    });
    await openLive(page);
    await expect(page.getByText('Screen may sleep')).toBeVisible();
    await expect(page.getByText('Screen stays on')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('reads "Screen stays on" while a lock is held', async ({ page }) => {
    await page.addInitScript(() => {
      const sentinel = Object.assign(new EventTarget(), { released: false, release: async () => undefined });
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => sentinel } });
    });
    await openLive(page);
    await expect(page.getByText('Screen stays on')).toBeVisible();
  });

  test('is hidden when Keep screen awake is off', async ({ page }) => {
    await openLive(page, { settings: { keepAwake: false } });
    await expect(page.getByText(/Screen (stays on|may sleep)/)).toHaveCount(0);
  });
});

test.describe('storage failure', () => {
  test('a refused write keeps the tap on screen, shows the quiet card, and Retry saves it', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __failWrites: boolean };
      w.__failWrites = false;
      for (const method of ['put', 'add'] as const) {
        const original = IDBObjectStore.prototype[method];
        IDBObjectStore.prototype[method] = function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
          if (w.__failWrites) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
          return original.apply(this, args);
        } as typeof original;
      }
    });
    await openLive(page);
    await page.evaluate(() => ((window as unknown as { __failWrites: boolean }).__failWrites = true));
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    await expect(page.getByText("Couldn't save the last tap — free some space, then tap Retry")).toBeVisible();
    expect((await readDb(page)).contractions).toHaveLength(0);

    await page.evaluate(() => ((window as unknown as { __failWrites: boolean }).__failWrites = false));
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText(/Couldn't save the last tap/)).toHaveCount(0);
    await expect.poll(async () => (await readDb(page)).contractions.length).toBe(1);
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
  });
});

test.describe('layout', () => {
  test('large text: the stat cards stack and the hero keeps at least 200 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openLive(page);
    const time = await page.getByText('Time apart').locator('..').boundingBox();
    const lasting = await page.getByText('Lasting').locator('..').boundingBox();
    expect(lasting?.y ?? 0).toBeGreaterThan((time?.y ?? 0) + (time?.height ?? 0) - 1);
    const button = await heroButton(page).boundingBox();
    expect(button?.height ?? 0).toBeGreaterThanOrEqual(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('landscape phone: the hero takes the left half, stats and timeline the right', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    const now = Date.now();
    await openLive(page, {
      contractions: (sessionId) => [
        makeContraction({ sessionId, startAt: now - 10 * MIN, endAt: now - 10 * MIN + 50_000 }),
        makeContraction({ sessionId, startAt: now - 5 * MIN, endAt: now - 5 * MIN + 50_000 }),
      ],
    });
    const hb = await heroButton(page).boundingBox();
    const stats = await page.getByText('Time apart').locator('..').boundingBox();
    const chart = await page.getByRole('img', { name: /^Last hour/ }).boundingBox();
    expect((hb?.x ?? 0) + (hb?.width ?? 0)).toBeLessThanOrEqual(844 / 2 + 1);
    expect(stats?.x ?? 0).toBeGreaterThanOrEqual(844 / 2 - 1);
    expect(chart?.x ?? 0).toBeGreaterThanOrEqual(844 / 2 - 1);
  });

  test('reduced motion removes the breathing glow and its caption', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLive(page);
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    await expect(page.locator('[data-glow]')).toHaveCount(0);
    await expect(page.getByText(/Breathe with the glow/)).toHaveCount(0);
  });

  test('the breathing glow and caption show while contracting with the setting on', async ({ page }) => {
    await openLive(page);
    await heroButton(page).click();
    await expect(page.locator('[data-glow]')).toHaveCount(1);
    await expect(page.getByText('Breathe with the glow — in as it grows, out as it fades')).toBeVisible();
  });
});
