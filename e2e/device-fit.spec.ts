import { expect, test } from './fixtures';
import { onboard, waitForDb } from './helpers/db';

const SAFETY = "This app records contractions. It doesn't give medical advice — if you're worried, contact your midwife or maternity unit.";

// Phones' large viewport (toolbars hidden) is what 100vh measures; dvh is what is actually visible.
for (const size of [
  { name: '390 x 844', width: 390, height: 844 },
  { name: 'short phone 375 x 667', width: 375, height: 667 },
]) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('Welcome keeps Get started and the safety line in view', async ({ page }) => {
      await page.goto('/');
      await waitForDb(page);
      await expect(page.getByRole('button', { name: 'Get started' })).toBeInViewport({ ratio: 1 });
      await expect(page.getByText(SAFETY)).toBeInViewport({ ratio: 1 });
    });

    test('Start keeps the safety line in view with a hero of at least 240 px', async ({ page }) => {
      await page.goto('/');
      await waitForDb(page);
      await onboard(page);
      await page.reload();
      await waitForDb(page);
      const hero = page.getByRole('button', { name: /Start timing/ });
      await expect(hero).toBeVisible();
      await expect(page.getByText(SAFETY)).toBeInViewport({ ratio: 1 });
      expect((await hero.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(240);
      const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test.describe('insecure origin (no crypto.randomUUID)', () => {
  test('tracking still works: Start timing, then a tap, begins a contraction', async ({ page }) => {
    // Plain http on a LAN address is not a secure context, so crypto.randomUUID is undefined there.
    await page.addInitScript(() => {
      Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true });
      delete (crypto as unknown as Record<string, unknown>).randomUUID;
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await waitForDb(page);
    expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
    await onboard(page);
    await page.reload();
    await waitForDb(page);

    await page.getByRole('button', { name: /Start timing/ }).click();
    await expect(page).toHaveURL(/#\/live$/);
    const hero = page.getByTestId('hero');
    await expect(hero).toHaveAttribute('data-state', 'resting');
    await hero.getByRole('button').click();
    await expect(hero).toHaveAttribute('data-state', 'contracting');
    expect(errors).toEqual([]);
  });
});
