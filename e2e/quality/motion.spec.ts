import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { openApp } from './states';

const hero = (page: Page) => page.getByTestId('hero');
const heroButton = (page: Page) => hero(page).getByRole('button');
const CAPTION = 'Breathe with the glow';

async function startContraction(page: Page): Promise<void> {
  await heroButton(page).click();
  await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
}

const animationNames = (page: Page) =>
  page.evaluate(() => document.getAnimations().map((a) => (a as CSSAnimation).animationName ?? ''));

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('no glow element or animation, and the breathing caption is hidden', async ({ page }) => {
    await openApp(page, 'busy', '#/live');
    await startContraction(page);
    await expect(page.locator('[data-glow]')).toHaveCount(0);
    await expect(page.getByText(CAPTION)).toHaveCount(0);
    await page.waitForTimeout(400);
    expect((await animationNames(page)).filter((n) => /breathe/.test(n))).toEqual([]);
  });

  test('sheets fade in and do not transform', async ({ page }) => {
    await openApp(page, 'busy', '#/live');
    await page.getByRole('button', { name: 'Menu' }).click();
    const sheet = page.getByRole('dialog', { name: 'Menu' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('data-motion', 'fade');
    // Sampled at once, mid-entrance: a slide would put the sheet below its resting place.
    const style = await sheet.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { animation: cs.animationName, transform: cs.transform };
    });
    expect(style.animation).toMatch(/fade/);
    expect(style.animation).not.toMatch(/slide/);
    expect(style.transform).toBe('none');
    const animations = await animationNames(page);
    expect(animations.filter((n) => /slide/.test(n))).toEqual([]);
  });

  test('hold-to-end counts down in text instead of filling a ring', async ({ page }) => {
    await openApp(page, 'busy', '#/live');
    const control = page.getByRole('button', { name: 'Press and hold to end session' });
    await control.scrollIntoViewIfNeeded();
    await expect(control.locator('[data-fill]')).toHaveCount(0);
    const box = await control.boundingBox();
    if (!box) throw new Error('no box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.locator('button[data-holding="true"]')).toContainText(/Keep holding · \d\.\d s/);
    await page.mouse.up();
    await expect(page.getByRole('dialog', { name: 'End this session?' })).toHaveCount(0);
  });
});

test.describe('motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('the glow breathes for 8 s while contracting, with its caption', async ({ page }) => {
    await openApp(page, 'busy', '#/live');
    await expect(page.locator('[data-glow]')).toHaveCount(0);
    await startContraction(page);
    const glow = page.locator('[data-glow]');
    await expect(glow).toHaveCount(1);
    await expect(page.getByText(CAPTION)).toBeVisible();
    const style = await glow.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { name: cs.animationName, duration: cs.animationDuration, iteration: cs.animationIterationCount, timing: cs.animationTimingFunction, state: cs.animationPlayState };
    });
    expect(style).toEqual({ name: 'breathe-4-4', duration: '8s', iteration: 'infinite', timing: 'ease-in-out', state: 'running' });
  });

  test('the glow follows the chosen in/out timing, with a peak keyframe at in/(in+out)', async ({ page }) => {
    await openApp(page, 'busy', '#/live', { breatheInSeconds: 6, breatheOutSeconds: 3 });
    await startContraction(page);
    const glow = page.locator('[data-glow]');
    await expect(glow).toHaveCSS('animation-name', 'breathe-6-3');
    await expect(glow).toHaveCSS('animation-duration', '9s');
    const keyTexts = await page.evaluate(() => {
      const rule = [...document.styleSheets]
        .flatMap((s) => [...s.cssRules])
        .find((r): r is CSSKeyframesRule => r instanceof CSSKeyframesRule && r.name === 'breathe-6-3');
      return rule ? [...rule.cssRules].map((k) => (k as CSSKeyframeRule).keyText) : null;
    });
    expect(keyTexts).toContain('66.667%');
  });

  test('the 420 px glow never takes taps: the tap target stays the 300 px button', async ({ page }) => {
    await openApp(page, 'busy', '#/live');
    await startContraction(page);
    const glow = page.locator('[data-glow]');
    await expect(glow).toHaveCSS('pointer-events', 'none');
    expect(await glow.evaluate((el) => (el as HTMLElement).offsetWidth)).toBe(420);
    const box = await heroButton(page).boundingBox();
    if (!box) throw new Error('no hero box');
    expect(Math.round(box.width)).toBe(300);
    expect(Math.round(box.height)).toBe(300);
    const insideButton = await page.evaluate(
      ([x, y]) => document.querySelector('[data-testid="hero"] button')?.contains(document.elementFromPoint(x, y)) ?? false,
      [box.x + box.width / 2, box.y - 30],
    );
    expect(insideButton).toBe(false);
  });

  test('with Breathing glow switched off there is no glow and no caption', async ({ page }) => {
    await openApp(page, 'busy', '#/live', { breathingGlow: false });
    await startContraction(page);
    await expect(page.locator('[data-glow]')).toHaveCount(0);
    await expect(page.getByText(CAPTION)).toHaveCount(0);
    expect((await animationNames(page)).filter((n) => /breathe/.test(n))).toEqual([]);
  });

  test('the glow pauses while the document is hidden and resumes when it is visible', async ({ page }) => {
    await openApp(page, 'busy', '#/live');
    await startContraction(page);
    const glow = page.locator('[data-glow]');
    await expect(glow).toHaveCSS('animation-play-state', 'running');

    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);

    await setHidden(true);
    await expect(glow).toHaveCSS('animation-play-state', 'paused');
    await setHidden(false);
    await expect(glow).toHaveCSS('animation-play-state', 'running');
  });
});
