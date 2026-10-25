import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { makeSession, onboard, readDb, seedDb, waitForDb } from './helpers/db';

const GENTLE = "If you haven't already, contact your midwife or maternity unit.";
const NOW = new Date(2026, 9, 20, 21, 15).getTime();

async function openLive(page: Page) {
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  await seedDb(page, { sessions: [makeSession({ name: 'Test labour', startedAt: NOW - 3_600_000 })] });
  await page.evaluate(() => {
    window.location.hash = '#/live';
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Test labour' })).toBeVisible();
}

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Add an event' });

async function openEvent(page: Page, type: string) {
  await page.getByRole('button', { name: 'Event' }).click();
  await sheet(page).getByRole('radio', { name: type }).click();
}

test('J5: Waters broke, green or brown, at a changed time, shows the confirmation and the gentle prompt', async ({ page }) => {
  await openLive(page);
  await openEvent(page, 'Waters broke');
  const dialog = sheet(page);
  await dialog.getByRole('radio', { name: 'Green or brown' }).click();
  const time = dialog.getByLabel('Time');
  await expect(time).toHaveValue('21:15'); // defaults to now
  await time.fill('23:30');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(dialog.getByText('Saved · Waters broke, green or brown, 23:30')).toBeVisible();
  await expect(dialog.getByRole('status')).toHaveText(GENTLE);
  // Focus stays inside the sheet after the swap, and the sheet closes only on Done.
  await expect(dialog.getByRole('button', { name: 'Done' })).toBeFocused();
  await page.waitForTimeout(500);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toHaveCount(0);

  const events = (await readDb(page)).events;
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: 'waters', details: 'green-brown' });
});

for (const type of ['Bleeding', 'Reduced baby movement']) {
  test(`J5: ${type} shows the gentle prompt`, async ({ page }) => {
    await openLive(page);
    await openEvent(page, type);
    const dialog = sheet(page);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText(`Saved · ${type}, 21:15`)).toBeVisible();
    await expect(dialog.getByRole('status')).toHaveText(GENTLE);
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toHaveCount(0);
  });
}

test('J5: clear waters save with no prompt', async ({ page }) => {
  await openLive(page);
  await openEvent(page, 'Waters broke');
  const dialog = sheet(page);
  await dialog.getByRole('radio', { name: 'Clear' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Saved · Waters broke, clear, 21:15')).toBeVisible();
  await expect(page.getByText(GENTLE)).toHaveCount(0);
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toHaveCount(0);
});
