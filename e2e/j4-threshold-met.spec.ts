import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { makeSession, onboard, readDb, seedDb, waitForDb } from './helpers/db';

const MIN = 60_000;

const hero = (page: Page) => page.getByTestId('hero');

async function contraction(page: Page): Promise<void> {
  await page.clock.fastForward(60_000);
  await hero(page).getByRole('button').click();
  await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
  await page.clock.runFor(1000);
  await hero(page).getByRole('button').click();
  await expect(hero(page)).toHaveAttribute('data-state', 'resting');
}

test('J4: switching on 3 in 10 min in Settings makes the banner appear on Live, and return', async ({ page }) => {
  const t0 = Date.now();
  await page.clock.install({ time: t0 });
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  const session = makeSession({ name: 'Test labour', startedAt: t0 - 30 * MIN });
  await seedDb(page, { sessions: [session] });

  await page.evaluate(() => {
    window.location.hash = '#/settings';
  });
  await page.getByRole('switch', { name: '3 in 10 min' }).click();
  await expect(page.getByRole('switch', { name: '3 in 10 min' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(hero(page)).toBeVisible();
  expect(await page.evaluate(() => window.location.hash)).toBe('#/live');

  const banner = page.getByRole('status').filter({ hasText: 'Matches the threshold you set' });
  await contraction(page);
  await contraction(page);
  await expect(banner).toHaveCount(0);
  await contraction(page);
  await expect(banner).toHaveText('Matches the threshold you set — 3 in 10 min');
  await expect(banner).toHaveAttribute('role', 'status');
  await expect
    .poll(async () => (await readDb(page)).sessions.find((s) => s.id === session.id)?.thresholdMetAt)
    .not.toBeNull();

  await banner.getByRole('button', { name: 'Dismiss' }).click();
  await expect(banner).toHaveCount(0);

  // The rule stops holding (11 minutes pass; the 60 s tick re-evaluates), then holds again.
  await page.clock.fastForward(11 * MIN);
  await expect(banner).toHaveCount(0);
  await contraction(page);
  await contraction(page);
  await contraction(page);
  await expect(banner).toHaveText('Matches the threshold you set — 3 in 10 min');
});
