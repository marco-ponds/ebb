import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { makeSession, onboard, readDb, seedDb, waitForDb } from './helpers/db';
import type { Settings } from '../src/db/types';

const MIN = 60_000;
const hero = (page: Page) => page.getByTestId('hero');
const heroButton = (page: Page) => hero(page).getByRole('button');
const pickerGroup = (page: Page) => page.getByRole('radiogroup', { name: 'How strong was that one?' });
const endControl = (page: Page) => page.getByRole('button', { name: 'Press and hold to end session' });

async function openLive(page: Page, settings: Partial<Settings> = {}) {
  await page.goto('/');
  await waitForDb(page);
  await onboard(page, settings);
  const session = makeSession({ name: 'Test labour', startedAt: Date.now() - 2 * 60 * MIN });
  await seedDb(page, { sessions: [session] });
  await page.evaluate(() => {
    window.location.hash = '#/live';
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Test labour' })).toBeVisible();
  return session;
}

/** One start and one stop through the hero, past the 600 ms debounce. */
async function tapOnce(page: Page) {
  await heroButton(page).click();
  await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
  await page.waitForTimeout(700);
  await heroButton(page).click();
  await expect(hero(page)).toHaveAttribute('data-state', 'resting');
}

/** Presses the control with the mouse (scrolled into view first, so the coordinates hit it). */
async function pressDown(page: Page, locator: ReturnType<typeof endControl>) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

async function hold(page: Page, locator: ReturnType<typeof endControl>, ms: number) {
  await pressDown(page, locator);
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test.describe('strength picker', () => {
  for (const [scale, count, firstLabel] of [
    ['words', 5, 'Mild'],
    ['numeric', 10, '1'],
    ['both', 15, 'Mild'],
  ] as const) {
    test(`shows the ${scale} scale and saves the choice`, async ({ page }) => {
      await openLive(page, { intensityScale: scale });
      await tapOnce(page);
      await expect(pickerGroup(page)).toBeVisible();
      await expect(pickerGroup(page).getByRole('radio')).toHaveCount(count);
      await expect(pickerGroup(page).getByRole('radio', { name: firstLabel, exact: true })).toBeVisible();
      await expect(page.getByRole('progressbar', { name: 'Time left before this closes' })).toBeVisible();
      // Rating layout: insights and the end control are hidden.
      await expect(page.getByText('Time apart')).toHaveCount(0);
      await expect(endControl(page)).toHaveCount(0);
      await pickerGroup(page).getByRole('radio').nth(count === 10 ? 4 : 2).click();
      await expect(pickerGroup(page)).toHaveCount(0);
      const rows = (await readDb(page)).contractions;
      expect(rows[0].intensity).toBe(count === 10 ? 5 : 6);
      await expect(page.getByText('Time apart')).toBeVisible();
    });
  }

  test('Skip closes it and leaves the strength unset', async ({ page }) => {
    await openLive(page);
    await tapOnce(page);
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(pickerGroup(page)).toHaveCount(0);
    expect((await readDb(page)).contractions[0].intensity).toBeNull();
  });

  test('closes at once when a new contraction starts', async ({ page }) => {
    await openLive(page);
    await tapOnce(page);
    await expect(pickerGroup(page)).toBeVisible();
    await page.waitForTimeout(700);
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    await expect(pickerGroup(page)).toHaveCount(0);
  });
});

test.describe('Undo', () => {
  test('is disabled with nothing to undo, then enabled after a tap', async ({ page }) => {
    await openLive(page);
    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toHaveAttribute('aria-disabled', 'true');
    await undo.click({ force: true }); // Playwright treats aria-disabled as not actionable
    await expect(page.getByText('Undone')).toHaveCount(0);
    await heroButton(page).click();
    await expect(page.getByRole('button', { name: 'Started by mistake' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  });

  test('an accidental stop is restored by Undo (double-tap edge)', async ({ page }) => {
    await openLive(page);
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    const startAt = (await readDb(page)).contractions[0].startAt;
    await page.waitForTimeout(700);
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'resting');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    const row = (await readDb(page)).contractions[0];
    expect(row.startAt).toBe(startAt);
    expect(row.endAt).toBeNull();
  });
});

test.describe('end the session', () => {
  test('a hold shorter than 1.5 s does nothing', async ({ page }) => {
    await openLive(page);
    await hold(page, endControl(page), 700);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await readDb(page)).sessions[0].endedAt).toBeNull();
  });

  test('1.5 s opens the sheet; Keep going keeps the session, End session ends it', async ({ page }) => {
    await openLive(page);
    await hold(page, endControl(page), 1800);
    const sheet = page.getByRole('dialog', { name: 'End this session?' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Keep going' }).click();
    await expect(sheet).toHaveCount(0);
    expect((await readDb(page)).sessions[0].endedAt).toBeNull();

    await hold(page, endControl(page), 1800);
    await sheet.getByRole('button', { name: 'End session' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect.poll(async () => (await readDb(page)).sessions[0].endedAt).not.toBeNull();
  });

  test('is hidden while a contraction is running', async ({ page }) => {
    await openLive(page);
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    await expect(endControl(page)).toHaveCount(0);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the hold shows a text countdown and the sheet fades instead of sliding', async ({ page }) => {
    await openLive(page);
    await pressDown(page, endControl(page));
    // The accessible name changes with the countdown, so find the control by its holding flag.
    await expect(page.locator('button[data-holding="true"]')).toContainText(/Keep holding · \d\.\d s/);
    await page.waitForTimeout(1700);
    await page.mouse.up();
    const sheet = page.getByRole('dialog', { name: 'End this session?' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('data-motion', 'fade');
  });
});
