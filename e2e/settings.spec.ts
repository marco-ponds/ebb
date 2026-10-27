import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { makeContraction, makeSession, onboard, readDb, seedDb, waitForDb } from './helpers/db';

const MIN = 60_000;

async function openSettings(page: Page): Promise<void> {
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  await page.evaluate(() => {
    window.location.hash = '#/settings';
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
}

test('presets are all off by default and each row has a description', async ({ page }) => {
  await openSettings(page);
  for (const name of ['3 in 10 min', '5-1-1', '4-1-1', '3-1-1']) {
    await expect(page.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'false');
  }
  await expect(page.getByText('Three contractions within ten minutes')).toBeVisible();
  await expect(page.getByText('5 min apart, 1 min long, for 1 hour')).toBeVisible();
});

test('custom threshold: invalid input disables Save, then create, edit and delete', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('button', { name: '+ Custom threshold' }).click();
  const dialog = page.getByRole('dialog', { name: 'Custom threshold' });
  await dialog.getByLabel('Contractions').fill('0');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await expect(dialog.getByText('Use a whole number from 1 to 20')).toBeVisible();
  await dialog.getByLabel('Contractions').fill('4');
  await dialog.getByLabel('Minutes').fill('20');
  await dialog.getByLabel('Label (optional)').fill('Unit rule');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('switch', { name: 'Unit rule' })).toHaveAttribute('aria-checked', 'true');
  expect((await readDb(page)).settings?.thresholds.at(-1)).toMatchObject({ kind: 'n-in-m', n: 4, minutes: 20, preset: false });

  await page.getByRole('button', { name: 'Edit Unit rule' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit threshold' });
  await edit.getByLabel('Label (optional)').fill('Unit rule 2');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('switch', { name: 'Unit rule 2' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit Unit rule 2' }).click();
  await page.getByRole('dialog', { name: 'Edit threshold' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('switch', { name: 'Unit rule 2' })).toHaveCount(0);
  expect((await readDb(page)).settings?.thresholds).toHaveLength(4);
});

test('strength scale is stored', async ({ page }) => {
  await openSettings(page);
  const scale = page.getByRole('radiogroup', { name: 'Strength scale' });
  await scale.getByRole('radio', { name: '1–10' }).click();
  await expect.poll(async () => (await readDb(page)).settings?.intensityScale).toBe('numeric');
  await scale.getByRole('radio', { name: 'Both' }).click();
  await expect.poll(async () => (await readDb(page)).settings?.intensityScale).toBe('both');
});

test('Day theme applies at once', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('radiogroup', { name: 'Look' }).getByRole('radio', { name: 'Day' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(247, 244, 251)');
  await expect.poll(async () => (await readDb(page)).settings?.theme).toBe('day');
});

test('toggles persist across a reload', async ({ page }) => {
  await openSettings(page);
  for (const name of ['Keep screen awake', 'Gentle buzz', 'Breathing glow']) {
    await expect(page.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('switch', { name }).click();
  }
  await expect.poll(async () => (await readDb(page)).settings?.breathingGlow).toBe(false);
  await page.reload();
  await waitForDb(page);
  for (const name of ['Keep screen awake', 'Gentle buzz', 'Breathing glow']) {
    await expect(page.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'false');
  }
});

test('breathing glow timing is stored and the page does not scroll sideways at 195 px', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('radiogroup', { name: 'Breathe out' }).getByRole('radio', { name: '3 s' }).click();
  await page.getByRole('radiogroup', { name: 'Breathe in' }).getByRole('radio', { name: '7 s' }).click();
  await expect.poll(async () => (await readDb(page)).settings).toMatchObject({ breatheInSeconds: 7, breatheOutSeconds: 3 });
  await page.setViewportSize({ width: 195, height: 422 });
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(fits).toBe(true);
});

test('Breathing glow off hides the breathing caption on Live', async ({ page }) => {
  await page.goto('/');
  await waitForDb(page);
  await onboard(page, { breathingGlow: false });
  const session = makeSession({ startedAt: Date.now() - 30 * MIN });
  await seedDb(page, {
    sessions: [session],
    contractions: [makeContraction({ sessionId: session.id, startAt: Date.now() - 5000, endAt: null })],
  });
  await page.evaluate(() => {
    window.location.hash = '#/live';
  });
  await expect(page.getByTestId('hero')).toHaveAttribute('data-state', 'contracting');
  await expect(page.getByText('Breathe with the glow')).toHaveCount(0);
});

test('explains when the browser cannot keep the screen on', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
  });
  await openSettings(page);
  await expect(
    page.getByText("This browser can't keep the screen on. You can raise the auto-lock time in your phone's display settings."),
  ).toBeVisible();
});

test('shows the safety line and the version', async ({ page }) => {
  await openSettings(page);
  await expect(
    page.getByText("This app records contractions. It doesn't give medical advice — if you're worried, contact your midwife or maternity unit."),
  ).toBeVisible();
  await expect(page.getByText(/^Version \d+\.\d+\.\d+/)).toBeVisible();
});

test('Back returns to Start, or to Live during a session', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(/^#\/?$/);
  await seedDb(page, { sessions: [makeSession({ startedAt: Date.now() - 10 * MIN })] });
  await page.evaluate(() => {
    window.location.hash = '#/settings';
  });
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/live');
});
