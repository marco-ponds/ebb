import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { makeSession, onboard, readDb, seedDb, waitForDb } from './../helpers/db';

const MIN = 60_000;
const hero = (page: Page) => page.getByTestId('hero');
const heroButton = (page: Page) => hero(page).getByRole('button');

const openContractions = async (page: Page) => (await readDb(page)).contractions.filter((c) => c.endAt === null).length;

test('Ebb open in two tabs: a tap in one shows in the other within a second, and the database never holds two open contractions', async ({
  page: a,
  context,
  baseURL,
}) => {
  // The second tab gets the same foreign-origin guard as the fixture gives the first.
  const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
  const foreign: string[] = [];

  await a.goto('/');
  await waitForDb(a);
  await onboard(a);
  await seedDb(a, { sessions: [makeSession({ name: 'Test labour', startedAt: Date.now() - 30 * MIN })] });
  await a.goto('/#/live');
  await expect(hero(a)).toHaveAttribute('data-state', 'resting');

  const b = await context.newPage();
  b.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith('data:') && !url.startsWith('blob:') && new URL(url).origin !== origin) foreign.push(url);
  });
  await b.goto('/#/live');
  await waitForDb(b);
  await expect(hero(b)).toHaveAttribute('data-state', 'resting');

  // A starts: B follows within 1 s.
  await heroButton(a).click();
  await expect(hero(a)).toHaveAttribute('data-state', 'contracting');
  await expect(hero(b)).toHaveAttribute('data-state', 'contracting', { timeout: 1000 });
  expect(await openContractions(a)).toBe(1);

  // B stops: A follows within 1 s.
  await b.waitForTimeout(700);
  await heroButton(b).click();
  await expect(hero(b)).toHaveAttribute('data-state', 'resting');
  await expect(hero(a)).toHaveAttribute('data-state', 'resting', { timeout: 1000 });
  expect(await openContractions(b)).toBe(0);

  // Both tabs tap "start" at the same moment: whichever lands first wins, and there is never a second open contraction.
  await a.waitForTimeout(700);
  await Promise.all([heroButton(a).click(), heroButton(b).click()]);
  for (let i = 0; i < 8; i++) {
    expect(await openContractions(a)).toBeLessThanOrEqual(1);
    await a.waitForTimeout(100);
  }
  await expect.poll(() => openContractions(a)).toBeLessThanOrEqual(1);
  // And the two tabs end up agreeing with each other and with the database.
  const stateA = await hero(a).getAttribute('data-state');
  await expect(hero(b)).toHaveAttribute('data-state', stateA ?? 'resting', { timeout: 2000 });
  expect(await openContractions(a)).toBe(stateA === 'contracting' ? 1 : 0);

  expect(foreign, 'requests to a foreign origin from the second tab').toEqual([]);
});
