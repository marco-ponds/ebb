import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { SCREEN_STATES, SETTLE_MS, openApp, pauseGlowAtPeak } from './states';

const hero = (page: Page) => page.getByTestId('hero');
const heroButton = (page: Page) => hero(page).getByRole('button');
const statCard = (page: Page, label: string) => page.getByText(label, { exact: true }).locator('xpath=..');

test.describe('large text (200 % zoom reflow)', () => {
  // 200 % browser zoom on a 390 px phone is a 195 px layout viewport.
  test.use({ viewport: { width: 195, height: 422 } });

  test('stat cards stack, the hero stays at least 200 px tall, the page scrolls and nothing overflows sideways', async ({ page }) => {
    await openApp(page, 'busy', '#/live');
    await expect(hero(page)).toBeVisible();
    const a = await statCard(page, 'Time apart').boundingBox();
    const b = await statCard(page, 'Lasting').boundingBox();
    if (!a || !b) throw new Error('stat cards missing');
    expect(Math.abs(a.x - b.x)).toBeLessThan(2);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height - 1);

    const box = await heroButton(page).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(200);

    const scroll = await page.evaluate(() => ({
      canScroll: document.documentElement.scrollHeight > window.innerHeight,
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    expect(scroll).toEqual({ canScroll: true, sideways: false });

    // The big button is still reachable by scrolling.
    await heroButton(page).scrollIntoViewIfNeeded();
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    // Check at the glow's peak, where it is widest, not at the small inhale frame.
    await pauseGlowAtPeak(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });

  test('Settings: no segmented option label overflows its segment at 200 % zoom, and every option is at least 48 x 48', async ({ page }) => {
    await openApp(page, 'history-only', '#/settings');
    await expect(page.getByRole('radiogroup', { name: 'Breathe in' })).toBeVisible();
    const report = await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll<HTMLElement>('[role="radiogroup"] [role="radio"]'));
      return {
        count: options.length,
        overflowing: options.filter((o) => o.scrollWidth > o.clientWidth).map((o) => o.textContent),
        small: options
          .filter((o) => o.getBoundingClientRect().width < 47.5 || o.getBoundingClientRect().height < 47.5)
          .map((o) => o.textContent),
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    expect(report.count).toBeGreaterThan(10);
    expect(report).toMatchObject({ overflowing: [], small: [], sideways: false });
  });
});

test.describe('landscape phone (844 x 390)', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('the hero sits in the left half; stats and the timeline sit on the right', async ({ page }) => {
    await openApp(page, 'busy', '#/live');
    await expect(hero(page)).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    const half = 844 / 2;
    const h = await heroButton(page).boundingBox();
    if (!h) throw new Error('no hero box');
    expect(h.x + h.width).toBeLessThanOrEqual(half + 1);

    for (const label of ['Time apart', 'Lasting']) {
      const box = await statCard(page, label).boundingBox();
      expect(box?.x ?? 0, `${label} card`).toBeGreaterThanOrEqual(half - 1);
    }
    const timeline = await page.getByRole('region', { name: 'Last hour' }).boundingBox();
    expect(timeline?.x ?? 0).toBeGreaterThanOrEqual(half - 1);
  });

  test('while contracting, the hero slot clips the glow sideways and the button stays in the left half', async ({ page }) => {
    await openApp(page, 'busy', '#/live');
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    await expect(page.locator('[data-glow]')).toHaveCount(1);
    await expect(page.locator('[data-slot="hero"]')).toHaveCSS('overflow-x', 'clip');
    const box = await heroButton(page).boundingBox();
    if (!box) throw new Error('no hero box');
    expect(box.x + box.width).toBeLessThanOrEqual(422);
  });

  test('the contracting glow at its peak adds no vertical scroll', async ({ page }) => {
    await openApp(page, 'busy', '#/live');
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    await expect(page.locator('[data-glow]')).toHaveCount(1);
    // Pause the glow at its computed peak, where it is largest.
    await pauseGlowAtPeak(page);
    const withGlow = await page.evaluate(() => document.documentElement.scrollHeight);
    const without = await page.evaluate(() => {
      const g = document.querySelector<HTMLElement>('[data-glow]');
      if (!g) throw new Error('no glow');
      g.style.display = 'none';
      return document.documentElement.scrollHeight;
    });
    expect(withGlow).toBe(without);
  });
});

test.describe('phone portrait (390 x 844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the hero is at least 240 px tall and stat values stay on one line', async ({ page }) => {
    await openApp(page, 'busy', '#/live');
    await expect(hero(page)).toBeVisible();
    const box = await heroButton(page).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(240);

    const lines = await page.evaluate(() => {
      const out: Record<string, number> = {};
      for (const label of ['Time apart', 'Lasting']) {
        const card = Array.from(document.querySelectorAll('div')).find((d) => d.children.length >= 2 && d.firstElementChild?.textContent === label);
        const value = card?.children[1];
        if (!value) throw new Error(`no stat value for ${label}`);
        const range = document.createRange();
        range.selectNodeContents(value);
        const tops = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top)));
        out[label] = tops.size;
      }
      return out;
    });
    expect(lines).toEqual({ 'Time apart': 1, Lasting: 1 });
  });

  test('no sideways scroll while contracting with the 420 px glow', async ({ page }) => {
    await openApp(page, 'busy', '#/live');
    await heroButton(page).click();
    await expect(hero(page)).toHaveAttribute('data-state', 'contracting');
    await expect(page.locator('[data-glow]')).toHaveCount(1);
    // At the peak the glow is 420 px, wider than the 390 px screen: only the clip keeps it from scrolling.
    await pauseGlowAtPeak(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('Settings: the six Breathe in options form an even 3 + 3 grid of at least 48 x 48 targets', async ({ page }) => {
    await openApp(page, 'history-only', '#/settings');
    const radios = page.getByRole('radiogroup', { name: 'Breathe in' }).getByRole('radio');
    await expect(radios).toHaveCount(6);
    const boxes = await radios.evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: r.width, h: r.height };
      }),
    );
    const rows = new Map<number, number[]>();
    for (const b of boxes) rows.set(b.y, [...(rows.get(b.y) ?? []), b.x]);
    expect(rows.size).toBe(2);
    for (const xs of rows.values()) expect(xs).toHaveLength(3);
    const [first, second] = [...rows.values()];
    expect(first).toEqual(second);
    const widths = new Set(boxes.map((b) => Math.round(b.w)));
    expect(widths.size).toBe(1);
    for (const b of boxes) {
      expect(b.w).toBeGreaterThanOrEqual(48);
      expect(b.h).toBeGreaterThanOrEqual(48);
    }
  });

  // Every screen and sheet: all buttons are at least 48 x 48 and no rendered text is smaller than 12 px.
  for (const state of SCREEN_STATES) {
    test(`${state.name}: buttons are at least 48 x 48 and no text is under 12 px`, async ({ page }) => {
      await state.open(page);
      await page.waitForTimeout(SETTLE_MS);
      const report = await page.evaluate(() => {
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
        };
        const small: string[] = [];
        let checked = 0;
        let texts = 0;
        for (const el of Array.from(document.querySelectorAll('button, [role="button"], [role="switch"], [role="radio"], [role="checkbox"]'))) {
          if (!visible(el)) continue;
          checked++;
          const r = el.getBoundingClientRect();
          if (r.width < 47.5 || r.height < 47.5) {
            small.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        }
        const tiny: string[] = [];
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          const hasText = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
          if (!hasText || !visible(el)) continue;
          texts++;
          let px = parseFloat(getComputedStyle(el).fontSize);
          if (el instanceof SVGElement) {
            const ctm = (el as SVGGraphicsElement).getScreenCTM?.();
            if (ctm) px *= Math.hypot(ctm.a, ctm.b);
          }
          if (px < 11.95) tiny.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}" ${px.toFixed(1)}px`);
        }
        return { small, tiny, checked, texts };
      });
      expect(report.checked, 'controls inspected').toBeGreaterThan(0);
      expect(report.texts, 'text nodes inspected').toBeGreaterThan(2);
      expect({ small: report.small, tiny: report.tiny }).toEqual({ small: [], tiny: [] });
    });
  }
});
