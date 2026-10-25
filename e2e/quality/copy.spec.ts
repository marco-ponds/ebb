import { expect, test } from '../fixtures';
import { SCREEN_STATES, SETTLE_MS } from './states';

const SAFETY = "This app records contractions. It doesn't give medical advice — if you're worried, contact your midwife or maternity unit.";

/** Global Constraints, "Never": none of these may appear anywhere, in any case. */
const FORBIDDEN = [
  /you are in active labou?r/i,
  /active labou?r/i,
  /early labou?r/i,
  /braxton hicks/i,
  /false labou?r/i,
  /progressing well/i,
  /time to go to hospital/i,
  /call now/i,
  /labou?r has stopped/i,
];

const SAFETY_SCREENS = ['Welcome', 'Start', 'Settings'];

for (const state of SCREEN_STATES) {
  test(`copy: ${state.name} has no exclamation marks and no forbidden phrases`, async ({ page }) => {
    await state.open(page);
    await page.waitForTimeout(SETTLE_MS);
    const text = await page.evaluate(() => document.body.innerText);
    expect(text.length).toBeGreaterThan(20);
    expect(text).not.toContain('!');
    for (const phrase of FORBIDDEN) expect(text).not.toMatch(phrase);
    if (SAFETY_SCREENS.includes(state.name)) {
      expect(text.replace(/\s+/g, ' ')).toContain(SAFETY);
    }
  });

  test(`copy: ${state.name} uses no pure red or pure white (Night theme)`, async ({ page }) => {
    await state.open(page);
    await page.waitForTimeout(SETTLE_MS);
    expect(await page.evaluate(() => document.documentElement.dataset.theme ?? 'night')).toBe('night');
    const hits = await page.evaluate(() => {
      const banned = new Set(['rgb(255, 0, 0)', 'rgb(255, 255, 255)']);
      const props = [
        'color',
        'background-color',
        'border-top-color',
        'border-right-color',
        'border-bottom-color',
        'border-left-color',
        'outline-color',
        'fill',
        'stroke',
      ];
      const found: string[] = [];
      for (const el of Array.from(document.querySelectorAll('html, body, body *'))) {
        const cs = getComputedStyle(el);
        for (const p of props) {
          const v = cs.getPropertyValue(p).trim();
          if (banned.has(v)) found.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').split(' ')[0]} ${p}=${v}`);
        }
      }
      return found;
    });
    expect(hits).toEqual([]);
  });
}
