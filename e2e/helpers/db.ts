/**
 * E2E database helpers.
 *
 * - Call `seedDb` / `readDb` / `clearDb` after `page.goto` + `waitForDb`, so the app has already
 *   created the `ebb` database. They open it WITHOUT a version so they never trigger an upgrade
 *   (Dexie version 1 is native IDB version 10).
 * - Time control: call `await page.clock.install({ time })` BEFORE `page.goto` so the app boots
 *   with a fixed clock, then advance it with `page.clock.fastForward` / `runFor`.
 */
import type { Page } from '@playwright/test';
import { DEFAULT_SETTINGS } from '../../src/db/defaults';
import type { Contraction, EbbEvent, Session, Settings } from '../../src/db/types';

export interface DbData {
  sessions?: Session[];
  contractions?: Contraction[];
  events?: EbbEvent[];
  settings?: Settings;
}

export interface DbDump {
  sessions: Session[];
  contractions: Contraction[];
  events: EbbEvent[];
  settings: Settings | null;
  undo: unknown;
}

export async function waitForDb(page: Page): Promise<void> {
  await page.waitForSelector('html[data-db-ready="1"]', { state: 'attached' });
}

export async function seedDb(page: Page, data: DbData): Promise<void> {
  await page.evaluate(async (d) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('ebb');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['sessions', 'contractions', 'events', 'settings'], 'readwrite');
    for (const row of d.sessions ?? []) tx.objectStore('sessions').put(row);
    for (const row of d.contractions ?? []) tx.objectStore('contractions').put(row);
    for (const row of d.events ?? []) tx.objectStore('events').put(row);
    if (d.settings) tx.objectStore('settings').put(d.settings, 'singleton');
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, data);
  await page.reload();
  await waitForDb(page);
}

export async function readDb(page: Page): Promise<DbDump> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('ebb');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const all = (store: string) =>
      new Promise<unknown[]>((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const dump = {
      sessions: await all('sessions'),
      contractions: await all('contractions'),
      events: await all('events'),
      settings: (await all('settings'))[0] ?? null,
      undo: (await all('undo'))[0] ?? null,
    };
    db.close();
    return dump;
  }) as Promise<DbDump>;
}

export async function clearDb(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('ebb');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const names = Array.from(db.objectStoreNames);
    const tx = db.transaction(names, 'readwrite');
    for (const n of names) tx.objectStore(n).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
}

/** Writes DEFAULT_SETTINGS with `onboardedAt` set, so the Welcome screen is skipped. */
export async function onboard(page: Page, overrides: Partial<Settings> = {}): Promise<void> {
  await seedDb(page, { settings: { ...DEFAULT_SETTINGS, onboardedAt: Date.now(), ...overrides } });
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

export function makeSession(p: Partial<Session> = {}): Session {
  const startedAt = p.startedAt ?? 1_700_000_000_000;
  return {
    id: nextId('s'),
    name: null,
    startedAt,
    endedAt: null,
    notes: '',
    createdAt: startedAt,
    updatedAt: startedAt,
    thresholdMetAt: null,
    ...p,
  };
}

export function makeContraction(p: Partial<Contraction> & { sessionId: string }): Contraction {
  const startAt = p.startAt ?? 1_700_000_000_000;
  return {
    id: nextId('c'),
    startAt,
    endAt: startAt + 60_000,
    intensity: null,
    note: null,
    deletedAt: null,
    timeChanged: false,
    reviewed: false,
    updatedAt: startAt,
    ...p,
  };
}

export function makeEvent(p: Partial<EbbEvent> & { sessionId: string }): EbbEvent {
  const at = p.at ?? 1_700_000_000_000;
  return {
    id: nextId('e'),
    at,
    type: 'note',
    details: null,
    note: null,
    deletedAt: null,
    updatedAt: at,
    ...p,
  };
}

/** `count` contractions, one every `intervalMs` (start to start), each lasting `durationMs`. */
export function buildSeries(o: {
  sessionId: string;
  startAt: number;
  count: number;
  intervalMs: number;
  durationMs: number;
  intensity?: number | null;
}): Contraction[] {
  return Array.from({ length: o.count }, (_, i) => {
    const startAt = o.startAt + i * o.intervalMs;
    return makeContraction({
      sessionId: o.sessionId,
      startAt,
      endAt: startAt + o.durationMs,
      intensity: o.intensity ?? null,
      updatedAt: startAt + o.durationMs,
    });
  });
}
