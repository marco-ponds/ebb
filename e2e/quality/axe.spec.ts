import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../fixtures';
import { SCREEN_STATES, SETTLE_MS } from './states';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

for (const state of SCREEN_STATES) {
  test(`axe: ${state.name} has no WCAG 2.2 AA violations`, async ({ page }) => {
    await state.open(page);
    await page.waitForTimeout(SETTLE_MS);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const summary = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => `${n.target.join(' ')} :: ${n.failureSummary?.split('\n').slice(0, 3).join(' | ')}`),
    }));
    expect(summary).toEqual([]);
  });
}
