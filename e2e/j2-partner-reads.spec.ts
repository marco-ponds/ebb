import { expect, test } from './fixtures';
import { buildSeries, makeSession, onboard, readDb, seedDb, waitForDb } from './helpers/db';

const MIN = 60_000;
const NOW = new Date(2026, 9, 20, 23, 40).getTime();

test('J2: partner reads the numbers, shares the summary and adds a Called midwife marker', async ({ page, context }, testInfo) => {
  const chromium = testInfo.project.name === 'pixel-7';
  if (chromium) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    navigator.share = async () => undefined;
  });
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await waitForDb(page);
  await onboard(page);
  const session = makeSession({ name: 'Test labour', startedAt: NOW - 2 * 60 * MIN });
  await seedDb(page, {
    sessions: [session],
    // 12 contractions 4m 20s apart, 55 s long, strength 6; the last ended 3 minutes ago.
    contractions: buildSeries({
      sessionId: session.id,
      startAt: NOW - 3 * MIN - 11 * 260_000 - 55_000,
      count: 12,
      intervalMs: 260_000,
      durationMs: 55_000,
      intensity: 6,
    }),
  });
  await page.evaluate(() => {
    window.location.hash = '#/live';
  });

  // 1-2: large numbers and the 30-minute average.
  await expect(page.getByText('Time apart').locator('..')).toContainText('4m 20s');
  await expect(page.getByText('Lasting').locator('..')).toContainText('55s');
  await expect(page.getByText('Last 30 min').locator('..')).toContainText('every 4m 20s · 55s long');

  // 3: Share.
  await page.getByRole('button', { name: 'Share' }).click();
  const share = page.getByRole('dialog', { name: 'Share summary' });
  await expect(share.getByText('Last hour: 12 contractions, every 4.3 min, lasting about 55 s, strength about 6/10.')).toBeVisible();
  await expect(share.getByRole('button', { name: 'Share…' })).toBeVisible();
  const copy = share.getByRole('button', { name: 'Copy' });
  await expect(copy).toBeVisible();
  if (chromium) {
    await copy.click();
    await expect(page.getByText('Copied', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'Last hour: 12 contractions, every 4.3 min, lasting about 55 s, strength about 6/10.',
    );
  }
  await page.keyboard.press('Escape');
  await expect(share).toHaveCount(0);

  // 4: Event, Called midwife, a mint marker on the mini timeline.
  await expect(page.locator('[data-marker]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Event' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add an event' });
  await sheet.getByRole('radio', { name: 'Called midwife' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toHaveCount(0);
  const marker = page.locator('[data-marker]');
  await expect(marker).toHaveCount(1);
  await expect(marker.locator('circle')).toHaveAttribute('stroke', 'var(--mint)');
  expect((await readDb(page)).events.map((e) => e.type)).toEqual(['called-midwife']);
});
