/**
 * Every screen and sheet state, reachable from a fresh page. The axe and copy sweeps both walk this list, so a new
 * state added here is checked for accessibility and for the copy rules at once.
 */
import type { Page } from '@playwright/test';
import { expect } from '../fixtures';
import { buildSeries, makeContraction, makeEvent, makeSession, onboard, seedDb, waitForDb } from '../helpers/db';
import { DEFAULT_SETTINGS } from '../../src/db/defaults';
import type { Settings } from '../../src/db/types';

export const MIN = 60_000;
export const at = (day: number, h: number, m: number) => new Date(2026, 9, day, h, m).getTime();
/** Sun 25 Oct 2026, 23:00 local. */
export const NOW = at(25, 23, 0);

/** Unnamed, so Live calls it "Tonight". 18 contractions, 4 min apart, the last one started at 22:55. */
export const tonight = makeSession({ startedAt: at(25, 21, 40), endedAt: null });
export const tuesday = makeSession({ startedAt: at(20, 19, 5), endedAt: at(20, 23, 40) });
export const sunday = makeSession({ startedAt: at(18, 2, 10), endedAt: at(18, 3, 25) });

const tonightRows = buildSeries({ sessionId: tonight.id, startAt: at(25, 21, 47), count: 18, intervalMs: 4 * MIN, durationMs: 55_000, intensity: 6 });
const tuesdayRows = buildSeries({ sessionId: tuesday.id, startAt: tuesday.startedAt + 5 * MIN, count: 31, intervalMs: 8 * MIN, durationMs: 44_000, intensity: 4 });
const sundayRows = buildSeries({ sessionId: sunday.id, startAt: sunday.startedAt + 5 * MIN, count: 9, intervalMs: 8 * MIN, durationMs: 35_000, intensity: 3 });
export const tuesdayEvent = makeEvent({ sessionId: tuesday.id, at: tuesday.startedAt + 249 * MIN, type: 'waters', details: 'clear' });
const tonightEvent = makeEvent({ sessionId: tonight.id, at: at(25, 22, 20), type: 'note', note: 'Tea and toast' });

export type Seed = 'busy' | 'stale' | 'paused' | 'banner' | 'history-only' | 'welcome';

export interface Opened {
  page: Page;
}

/** Boots the app at NOW with the seed. The route is entered by `hash`. */
export async function openApp(page: Page, seed: Seed, hash: string, settings: Partial<Settings> = {}): Promise<void> {
  await page.addInitScript(() => {
    // A held wake lock shows the mint "Screen stays on" pill, the one the headless browsers cannot otherwise reach.
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => ({ released: false, release: async () => undefined, addEventListener: () => undefined }),
      },
    });
  });
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await waitForDb(page);
  if (seed === 'welcome') return;
  const thresholds =
    seed === 'banner'
      ? DEFAULT_SETTINGS.thresholds.map((t) => (t.id === 'preset-3-in-10' ? { ...t, enabled: true } : t))
      : DEFAULT_SETTINGS.thresholds;
  await onboard(page, { thresholds, ...settings });
  if (seed === 'history-only') {
    await seedDb(page, { sessions: [tuesday, sunday], contractions: [...tuesdayRows, ...sundayRows], events: [tuesdayEvent] });
  } else {
    const base = {
      sessions: [tonight, tuesday, sunday],
      events: [tonightEvent, tuesdayEvent],
    };
    if (seed === 'stale') {
      // A contraction that has been going for 6 minutes.
      await seedDb(page, {
        ...base,
        contractions: [
          ...tonightRows.slice(0, 10),
          makeContraction({ sessionId: tonight.id, startAt: NOW - 6 * MIN, endAt: null }),
          ...tuesdayRows,
          ...sundayRows,
        ],
      });
    } else if (seed === 'paused') {
      // The last contraction began 65 minutes ago.
      await seedDb(page, { ...base, contractions: [...tonightRows.slice(0, 3), ...tuesdayRows, ...sundayRows] });
    } else if (seed === 'banner') {
      // Four starts in the last 10 minutes meet "3 in 10 min".
      const extra = [at(25, 22, 53), at(25, 22, 57)].map((startAt) =>
        makeContraction({ sessionId: tonight.id, startAt, endAt: startAt + 50_000, intensity: 6 }),
      );
      await seedDb(page, { ...base, contractions: [...tonightRows, ...extra, ...tuesdayRows, ...sundayRows] });
    } else {
      await seedDb(page, { ...base, contractions: [...tonightRows, ...tuesdayRows, ...sundayRows] });
    }
  }
  if (hash !== '#/') {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
  }
}

const hero = (page: Page) => page.getByTestId('hero');
const heroButton = (page: Page) => hero(page).getByRole('button');

/** A tap on the hero, then a pause past the 600 ms debounce. */
async function tapHero(page: Page, state: 'contracting' | 'resting'): Promise<void> {
  await heroButton(page).click();
  await expect(hero(page)).toHaveAttribute('data-state', state);
  await page.waitForTimeout(700);
}

export interface ScreenState {
  name: string;
  /** Brings a fresh page to this state. */
  open: (page: Page) => Promise<void>;
}

const live = async (page: Page, seed: Seed = 'busy', settings: Partial<Settings> = {}) => {
  await openApp(page, seed, '#/live', settings);
  await expect(page.getByTestId('hero')).toBeVisible();
  await expect(page.getByText('Screen stays on')).toBeVisible();
};

const detail = async (page: Page, seed: Seed = 'busy') => {
  await openApp(page, seed, `#/session/${tuesday.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tuesday evening');
};

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name });

export const SCREEN_STATES: ScreenState[] = [
  {
    name: 'Welcome',
    open: async (page) => {
      await openApp(page, 'welcome', '#/');
      await expect(page.getByRole('button', { name: 'Get started' })).toBeVisible();
    },
  },
  {
    name: 'Start, no sessions yet',
    open: async (page) => {
      await page.clock.install({ time: NOW });
      await page.goto('/');
      await waitForDb(page);
      await onboard(page);
      await expect(page.getByRole('button', { name: /Start timing/ })).toBeVisible();
    },
  },
  {
    name: 'Start',
    open: async (page) => {
      await openApp(page, 'history-only', '#/');
      await expect(page.getByRole('link', { name: /LAST SESSION/ })).toBeVisible();
    },
  },
  { name: 'Live, resting', open: (page) => live(page) },
  {
    name: 'Live, contracting',
    open: async (page) => {
      await live(page);
      await tapHero(page, 'contracting');
    },
  },
  {
    name: 'Live, strength picker',
    open: async (page) => {
      await live(page);
      await tapHero(page, 'contracting');
      await tapHero(page, 'resting');
      await expect(page.getByRole('radiogroup', { name: 'How strong was that one?' })).toBeVisible();
    },
  },
  {
    name: 'Live, threshold banner',
    open: async (page) => {
      await live(page, 'banner');
      await expect(page.getByRole('status').filter({ hasText: 'Matches the threshold you set' })).toBeVisible();
    },
  },
  {
    name: 'Live, still going card',
    open: async (page) => {
      await live(page, 'stale');
      await expect(page.getByText('Still going?')).toBeVisible();
    },
  },
  {
    name: 'Live, contractions paused card',
    open: async (page) => {
      await live(page, 'paused');
      await expect(page.getByText('Contractions paused?')).toBeVisible();
    },
  },
  {
    name: 'Live, menu sheet',
    open: async (page) => {
      await live(page);
      await page.getByRole('button', { name: 'Menu' }).click();
      await expect(dialog(page, 'Menu')).toBeVisible();
    },
  },
  {
    name: 'Live, event sheet',
    open: async (page) => {
      await live(page);
      await page.getByRole('button', { name: 'Event' }).click();
      await expect(dialog(page, 'Add an event')).toBeVisible();
      await dialog(page, 'Add an event').getByRole('radio', { name: 'Waters' }).click();
    },
  },
  {
    name: 'Live, event saved with the gentle prompt',
    open: async (page) => {
      await live(page);
      await page.getByRole('button', { name: 'Event' }).click();
      const sheet = dialog(page, 'Add an event');
      await sheet.getByRole('radio', { name: 'Bleeding' }).click();
      await sheet.getByRole('button', { name: 'Save' }).click();
      await expect(sheet.getByText("If you haven't already, contact your midwife or maternity unit.")).toBeVisible();
    },
  },
  {
    name: 'Live, share sheet',
    open: async (page) => {
      await live(page);
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await expect(dialog(page, 'Share summary')).toBeVisible();
    },
  },
  {
    name: 'Live, end-session sheet',
    open: async (page) => {
      await live(page);
      // Assistive-technology activation (a click with no hold) opens the sheet directly.
      await page.getByRole('button', { name: 'Press and hold to end session' }).evaluate((el) => (el as HTMLElement).click());
      await expect(dialog(page, 'End this session?')).toBeVisible();
    },
  },
  {
    name: 'History',
    open: async (page) => {
      await openApp(page, 'busy', '#/history');
      await expect(page.getByRole('heading', { level: 1, name: 'Sessions' })).toBeVisible();
    },
  },
  {
    name: 'History, select mode',
    open: async (page) => {
      await openApp(page, 'busy', '#/history');
      await page.getByRole('button', { name: 'Select' }).click();
      await page.getByRole('checkbox').nth(0).click();
      await page.getByRole('checkbox').nth(1).click();
      await expect(page.getByText('2 selected')).toBeVisible();
    },
  },
  { name: 'Session detail', open: (page) => detail(page) },
  {
    name: 'Session detail, active session',
    open: async (page) => {
      await openApp(page, 'busy', `#/session/${tonight.id}`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Tonight');
    },
  },
  {
    name: 'Session detail, whole log shown',
    open: async (page) => {
      await detail(page);
      await page.getByRole('button', { name: /Show all \d+ entries/ }).click();
      await expect(page.getByRole('button', { name: /Show all/ })).toHaveCount(0);
    },
  },
  {
    name: 'Session detail, renaming',
    open: async (page) => {
      await detail(page);
      await page.getByRole('button', { name: /Rename/ }).click();
      await expect(page.getByLabel('Session name')).toBeFocused();
    },
  },
  {
    name: 'Session detail, edit contraction sheet',
    open: async (page) => {
      await detail(page);
      await page.getByRole('button', { name: /Edit contraction/ }).first().click();
      await expect(dialog(page, 'Edit contraction')).toBeVisible();
    },
  },
  {
    name: 'Session detail, edit event sheet',
    open: async (page) => {
      await detail(page);
      await page.getByRole('button', { name: /Edit .*Waters/ }).first().click();
      await expect(dialog(page, 'Edit event')).toBeVisible();
    },
  },
  {
    name: 'Session detail, add a missed contraction sheet',
    open: async (page) => {
      await detail(page);
      await page.getByRole('button', { name: 'Add a missed contraction' }).click();
      await expect(dialog(page, 'Add a missed contraction')).toBeVisible();
    },
  },
  {
    name: 'Session detail, export sheet',
    open: async (page) => {
      await detail(page);
      await page.getByRole('button', { name: 'Export' }).click();
      await expect(dialog(page, 'Export')).toBeVisible();
    },
  },
  {
    name: 'Session detail, share sheet',
    open: async (page) => {
      await detail(page);
      await page.getByRole('button', { name: 'Share summary' }).click();
      await expect(dialog(page, 'Share summary')).toBeVisible();
    },
  },
  {
    name: 'Compare, two sessions',
    open: async (page) => {
      await openApp(page, 'busy', `#/compare?ids=${tonight.id},${tuesday.id}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Compare' })).toBeVisible();
    },
  },
  {
    name: 'Compare, three sessions',
    open: async (page) => {
      await openApp(page, 'busy', `#/compare?ids=${tonight.id},${tuesday.id},${sunday.id}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Compare' })).toBeVisible();
    },
  },
  {
    name: 'Settings',
    open: async (page) => {
      await openApp(page, 'history-only', '#/settings');
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    },
  },
  {
    name: 'Settings, during a session',
    open: async (page) => {
      await openApp(page, 'busy', '#/settings');
      await expect(page.getByText('Finish the current session before restoring')).toBeVisible();
    },
  },
  {
    name: 'Settings, custom threshold sheet',
    open: async (page) => {
      await openApp(page, 'history-only', '#/settings');
      await page.getByRole('button', { name: '+ Custom threshold' }).click();
      await expect(dialog(page, 'Custom threshold')).toBeVisible();
    },
  },
  {
    name: 'Settings, delete all data sheet',
    open: async (page) => {
      await openApp(page, 'history-only', '#/settings');
      await page.getByRole('button', { name: /Delete all data/ }).click();
      await expect(dialog(page, 'Delete all data')).toBeVisible();
    },
  },
  {
    name: 'Settings, restore preview',
    open: async (page) => {
      await openApp(page, 'history-only', '#/settings');
      const backup = {
        app: 'ebb',
        schema: 1,
        exportedAt: NOW,
        sessions: [tuesday],
        contractions: tuesdayRows,
        events: [tuesdayEvent],
        settings: { ...DEFAULT_SETTINGS, onboardedAt: null },
      };
      await page.locator('input[type="file"]').setInputFiles({
        name: 'backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(backup)),
      });
      await expect(page.getByRole('button', { name: 'Merge' })).toBeVisible();
    },
  },
];

/** Sheets finish their 220 ms entrance before a measurement that depends on colour or position. */
export const SETTLE_MS = 400;
