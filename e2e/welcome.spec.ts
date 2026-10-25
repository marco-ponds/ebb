import { test, expect } from './fixtures';
import { readDb, waitForDb } from './helpers/db';

const SAFETY = "This app records contractions. It doesn't give medical advice — if you're worried, contact your midwife or maternity unit.";

test('first launch shows Welcome with the safety line, then Get started leads to Start', async ({ page }) => {
  await page.goto('/');
  await waitForDb(page);
  await expect(page.getByRole('heading', { level: 1, name: 'ebb' })).toBeVisible();
  await expect(page.getByText('Time contractions with one tap. Everything stays on this phone.')).toBeVisible();
  await expect(page.getByText(SAFETY)).toBeVisible();

  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { level: 1, name: "Whenever you're ready." })).toBeVisible();
  await expect.poll(async () => (await readDb(page)).settings?.onboardedAt).not.toBeNull();

  await page.reload();
  await waitForDb(page);
  await expect(page.getByRole('heading', { level: 1, name: "Whenever you're ready." })).toBeVisible();
});

test('the install hint follows the platform', async ({ page }) => {
  await page.goto('/');
  await waitForDb(page);
  const ios = page.getByText('Tap Share, then Add to Home Screen.');
  if (test.info().project.name === 'iphone-13') await expect(ios).toBeVisible();
  else await expect(ios).toHaveCount(0);
});

test.describe('storage unavailable', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      indexedDB.open = () => {
        throw new DOMException('Storage is not available', 'SecurityError');
      };
    });
  });

  test('shows the quiet card on Welcome and Start, and timing still starts', async ({ page }) => {
    const card = page.getByText("This browser won't keep your data. Open Ebb from your home screen instead.");
    await page.goto('/');
    await waitForDb(page);
    await expect(card).toBeVisible();

    await page.getByRole('button', { name: 'Get started' }).click();
    await expect(page.getByRole('heading', { level: 1, name: "Whenever you're ready." })).toBeVisible();
    await expect(card).toBeVisible();

    await page.getByRole('button', { name: /Start timing/ }).click();
    await expect(page).toHaveURL(/#\/live$/);
  });
});
