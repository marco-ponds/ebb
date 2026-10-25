import { expect, test } from './fixtures';
import { onboard, readDb, waitForDb } from './helpers/db';

test('J1: first contraction, from Start to an unrated, auto-closed strength card', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __vib: unknown[] }).__vib = [];
    navigator.vibrate = (p) => {
      (window as unknown as { __vib: unknown[] }).__vib.push(p);
      return true;
    };
  });
  await page.clock.install({ time: new Date(2026, 9, 20, 21, 40) });
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);

  // Onboarded with no sessions: Start.
  await expect(page.getByRole('heading', { level: 1, name: "Whenever you're ready." })).toBeVisible();
  await page.getByRole('button', { name: /Start timing/ }).click();
  await expect(page).toHaveURL(/#\/live$/);

  const hero = page.getByTestId('hero');
  const button = hero.getByRole('button');
  await expect(hero).toHaveAttribute('data-state', 'resting');
  await expect(button).toHaveAttribute('data-tone', 'lavender');
  await expect(button).toContainText('No contractions yet');
  await expect(button).toContainText('Tap when it starts');

  await button.click();
  await expect(hero).toHaveAttribute('data-state', 'contracting');
  await expect(button).toHaveAttribute('data-tone', 'peach');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __vib: unknown[] }).__vib)).toContainEqual(15);
  await expect(button).toContainText('0:00');
  await page.clock.runFor(3000);
  await expect(button).toContainText('0:03');

  await button.click();
  await expect(hero).toHaveAttribute('data-state', 'resting');
  await expect(button).toHaveAttribute('data-tone', 'lavender');
  const picker = page.getByRole('radiogroup', { name: 'How strong was that one?' });
  await expect(picker).toBeVisible();

  await page.clock.fastForward(30_000);
  await expect(picker).toHaveCount(0);
  const rows = (await readDb(page)).contractions;
  expect(rows).toHaveLength(1);
  expect(rows[0].endAt).not.toBeNull();
  expect(rows[0].intensity).toBeNull();
});
