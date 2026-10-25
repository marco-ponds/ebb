import { test, expect } from './fixtures';
import { buildSeries, makeSession, onboard, readDb, seedDb, waitForDb } from './helpers/db';

const SAFETY = "This app records contractions. It doesn't give medical advice — if you're worried, contact your midwife or maternity unit.";

// Tue 20 Oct 2026, 19:05 to 23:40, in the machine's time zone (the browser uses the same one).
const START = new Date(2026, 9, 20, 19, 5).getTime();
const END = new Date(2026, 9, 20, 23, 40).getTime();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForDb(page);
});

test('with no sessions the last-session card is hidden and the safety line shows', async ({ page }) => {
  await onboard(page);
  await expect(page.getByRole('heading', { level: 1, name: "Whenever you're ready." })).toBeVisible();
  await expect(page.getByText('LAST SESSION')).toHaveCount(0);
  await expect(page.getByText(SAFETY)).toBeVisible();
});

test('the last-session card shows the ended session and opens its detail', async ({ page }) => {
  await onboard(page);
  const session = makeSession({ startedAt: START, endedAt: END });
  await seedDb(page, {
    sessions: [session],
    contractions: buildSeries({ sessionId: session.id, startAt: START + 300_000, count: 12, intervalMs: 300_000, durationMs: 60_000 }),
  });
  const card = page.getByRole('link', { name: /LAST SESSION/ });
  await expect(card).toContainText('Tuesday evening');
  await expect(card).toContainText('Tue 20 Oct · 19:05–23:40 · 4 h 35 m · 12 contractions');
  await card.click();
  await expect(page).toHaveURL(new RegExp(`#/session/${session.id}$`));
});

test('Start timing begins a session and opens Live', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: /Start timing/ }).click();
  await expect(page).toHaveURL(/#\/live$/);
  const dump = await readDb(page);
  expect(dump.sessions).toHaveLength(1);
  expect(dump.sessions[0]?.endedAt).toBeNull();
});

test('the icon button opens Settings and All sessions opens History', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await page.goBack();
  await page.getByRole('link', { name: 'All sessions' }).click();
  await expect(page).toHaveURL(/#\/history$/);
});

test('Back up saves a file and then reads "today"', async ({ page }) => {
  await onboard(page);
  const session = makeSession({ startedAt: START, endedAt: END });
  await seedDb(page, { sessions: [session] });
  await expect(page.getByRole('button', { name: 'Back up · never' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up · never' }).click();
  expect((await download).suggestedFilename()).toMatch(/^ebb-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.getByRole('button', { name: 'Back up · today' })).toBeVisible();
});
