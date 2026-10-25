import { expect, test } from './fixtures';
import { makeSession, onboard, readDb, seedDb, waitForDb } from './helpers/db';

test('J3: Started by mistake discards, and Undo restores a stopped contraction to in-progress', async ({ page }) => {
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  await seedDb(page, { sessions: [makeSession({ name: 'Test labour', startedAt: Date.now() - 3_600_000 })] });
  await page.evaluate(() => {
    window.location.hash = '#/live';
  });
  const hero = page.getByTestId('hero');
  const button = hero.getByRole('button');

  // 1-2: an accidental start, then Started by mistake.
  await button.click();
  await expect(hero).toHaveAttribute('data-state', 'contracting');
  await expect(button).toHaveAttribute('data-tone', 'peach');
  await page.getByRole('button', { name: 'Started by mistake' }).click();
  await expect(hero).toHaveAttribute('data-state', 'resting');
  await expect(button).toHaveAttribute('data-tone', 'lavender');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await readDb(page)).contractions).toHaveLength(0);

  // 3: stop one they did not mean to, then Undo.
  await page.waitForTimeout(700);
  await button.click();
  await expect(hero).toHaveAttribute('data-state', 'contracting');
  const startAt = (await readDb(page)).contractions[0].startAt;
  await page.waitForTimeout(1000);
  await button.click();
  await expect(hero).toHaveAttribute('data-state', 'resting');
  expect((await readDb(page)).contractions[0].endAt).not.toBeNull();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(hero).toHaveAttribute('data-state', 'contracting');
  await expect(page.getByText('Undone')).toBeVisible();
  const row = (await readDb(page)).contractions[0];
  expect(row.startAt).toBe(startAt);
  expect(row.endAt).toBeNull();
});
