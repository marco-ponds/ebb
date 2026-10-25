import { test as base, expect } from '@playwright/test';

/**
 * Every spec imports `test` and `expect` from here. The auto fixture records every request the
 * page makes and fails the test if any goes to a foreign origin (zero network after install).
 */
export const test = base.extend<{ noForeignRequests: void }>({
  noForeignRequests: [
    async ({ page, baseURL }, use) => {
      const base = new URL(baseURL ?? 'http://localhost:4173').origin;
      const foreign: string[] = [];
      page.on('request', (req) => {
        const url = req.url();
        if (url.startsWith('data:') || url.startsWith('blob:')) return;
        if (new URL(url).origin !== base) foreign.push(url);
      });
      await use();
      expect(foreign, 'requests to a foreign origin').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
