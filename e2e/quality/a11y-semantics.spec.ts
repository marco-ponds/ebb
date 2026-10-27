import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { openApp, tonight, tuesday } from './states';

const hero = (page: Page) => page.getByTestId('hero');
const heroButton = (page: Page) => hero(page).getByRole('button');

test.describe('hero button and live region', () => {
  test('the hero names its state and the time since the last start, and the live region announces taps', async ({ page }) => {
    await openApp(page, 'busy', '#/live');
    await expect(hero(page)).toHaveAttribute('data-state', 'resting');
    await expect(heroButton(page)).toHaveAccessibleName(/^Start contraction\. .* since the last one started$/);

    const announcer = page.getByTestId('announcer');
    await expect(announcer).toHaveAttribute('aria-live', 'polite');

    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    await expect(heroButton(page)).toHaveAccessibleName(/^End contraction\./);
    await expect(announcer).toHaveText('Contraction started');

    await page.waitForTimeout(1500);
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'resting');
    await expect(announcer).toHaveText(/^Contraction ended, lasted \d+ seconds?$/);
    await expect(heroButton(page)).toHaveAccessibleName(/^Start contraction\. .* since the last one started$/);
  });
});

test.describe('roles', () => {
  test('every Settings toggle is a switch with aria-checked, and the strength scale is a radiogroup', async ({ page }) => {
    await openApp(page, 'history-only', '#/settings');
    const switches = page.getByRole('switch');
    // 4 presets + Keep screen awake, Gentle buzz and Breathing glow.
    await expect(switches).toHaveCount(7);
    for (const el of await switches.all()) {
      expect(['true', 'false']).toContain(await el.getAttribute('aria-checked'));
    }
    await expect(page.getByRole('radiogroup', { name: 'Breathe in' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Breathe out' })).toBeVisible();
    await page.getByRole('switch', { name: 'Breathing glow' }).click();
    await expect(page.getByRole('switch', { name: 'Breathing glow' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('radiogroup', { name: 'Breathe in' })).toHaveCount(0);
    await expect(page.getByRole('radiogroup', { name: 'Strength scale' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Look' })).toBeVisible();
  });

  test('the strength picker on Live is a radiogroup', async ({ page }) => {
    await openApp(page, 'busy', '#/live');
    await heroButton(page).click();
    await page.waitForTimeout(700);
    await heroButton(page).click();
    const picker = page.getByRole('radiogroup', { name: 'How strong was that one?' });
    await expect(picker).toBeVisible();
    expect(await picker.getByRole('radio').count()).toBeGreaterThan(0);
  });

  test('CONFLICT-2: Live strength picker follows the Settings scale (words, 1-10, both)', async ({ page }) => {
    await openApp(page, 'busy', '#/settings');
    const scale = page.getByRole('radiogroup', { name: 'Strength scale' });
    const expected = [
      { option: '5 words', radios: 5, first: 'Mild' },
      { option: '1–10', radios: 10, first: '1' },
      { option: 'Both', radios: 15, first: 'Mild' },
    ];
    for (const { option, radios, first } of expected) {
      await scale.getByRole('radio', { name: option }).click();
      await expect(scale.getByRole('radio', { name: option })).toHaveAttribute('aria-checked', 'true');
      // Settings -> Back (an active session returns to Live), then rate a contraction.
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await expect(hero(page)).toBeVisible();
      await heroButton(page).click();
      await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
      await page.waitForTimeout(700);
      await heroButton(page).click();
      const picker = page.getByRole('radiogroup', { name: 'How strong was that one?' });
      await expect(picker).toBeVisible();
      await expect(picker.getByRole('radio')).toHaveCount(radios);
      await expect(picker.getByRole('radio', { name: first, exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Skip' }).click();
      await page.waitForTimeout(700);
      // Back to Settings through the Menu sheet.
      await page.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('link', { name: 'Settings' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    }
  });

  test('every chart is an image with a non-empty label', async ({ page }) => {
    const screens = [
      `#/session/${tuesday.id}`,
      `#/compare?ids=${tonight.id},${tuesday.id}`,
      '#/history',
      '#/live',
    ];
    for (const [i, hash] of screens.entries()) {
      if (i === 0) await openApp(page, 'busy', hash);
      else {
        await page.evaluate((h) => {
          window.location.hash = h;
        }, hash);
      }
      await expect(page.locator('svg[role="img"]').first()).toBeVisible();
      const charts = await page.locator('svg[role="img"]').all();
      expect(charts.length, hash).toBeGreaterThan(0);
      for (const chart of charts) {
        const label = (await chart.getAttribute('aria-label')) ?? '';
        expect(label.trim().length, `${hash}: chart label`).toBeGreaterThan(0);
      }
    }
    // The detail page carries all five charts.
    await page.evaluate((h) => {
      window.location.hash = h;
    }, `#/session/${tuesday.id}`);
    await expect(page.locator('svg[role="img"]')).toHaveCount(5);
  });
});

/** macOS WebKit only focuses form controls and links with Alt+Tab (Full Keyboard Access is off by default). */
const tabKey = () => (process.platform === 'darwin' && test.info().project.name === 'iphone-13' ? 'Alt+Tab' : 'Tab');

test.describe('focus ring and contrast', () => {
  const ring = (page: Page) =>
    page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement as Element);
      return { width: cs.outlineWidth, style: cs.outlineStyle, colour: cs.outlineColor, offset: cs.outlineOffset };
    });

  test('Tab focus shows a 3 px lavender ring with a 2 px offset; a mouse click shows none', async ({ page }) => {
    await openApp(page, 'busy', '#/live');
    await expect(heroButton(page)).toBeVisible();

    await page.keyboard.press(tabKey());
    let guard = 0;
    // Walk the first few stops; each focused control must carry the ring.
    while (guard++ < 4) {
      expect(await ring(page), `tab stop ${guard}`).toEqual({
        width: '3px',
        style: 'solid',
        colour: 'rgb(203, 187, 244)',
        offset: '2px',
      });
      await page.keyboard.press(tabKey());
    }

    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    const after = await ring(page);
    expect(after.style === 'none' || after.width === '0px', JSON.stringify(after)).toBe(true);
  });

  test('prefers-contrast: more lifts --text-muted to #D6D0E8', async ({ page }) => {
    await openApp(page, 'history-only', '#/settings');
    const muted = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim().toLowerCase());
    expect(await muted()).toBe('#b3accb');
    await page.emulateMedia({ contrast: 'more' });
    expect(await muted()).toBe('#d6d0e8');
  });
});
