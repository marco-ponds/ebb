import { liveQuery, type Subscription } from 'dexie';
import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '../db/defaults';
import { getQueueSnapshot, setMemoryMode, subscribeQueue, type StorageStatus } from '../db/queue';
import { createDb, getDb, setDb } from '../db/schema';
import { getSettings } from '../db/settings';
import { startSync } from '../db/sync';
import { purgeExpired } from '../db/undo';
import type { Contraction, Session, Settings, UndoEntry } from '../db/types';
import { mergeOverlay } from './overlay';

export interface AppState {
  ready: boolean;
  activeSession: Session | null;
  activeContraction: Contraction | null;
  settings: Settings;
  storage: { status: StorageStatus; pendingCount: number };
  undo: UndoEntry | null;
}

const initial = (): AppState => ({
  ready: false,
  activeSession: null,
  activeContraction: null,
  settings: structuredClone(DEFAULT_SETTINGS),
  storage: { status: 'ok', pendingCount: 0 },
  undo: null,
});

/** A cache: the liveQuery below fills it from the database, and pending writes are overlaid on top. */
export const useAppStore = create<AppState>(() => initial());

interface DbSnapshot {
  unended: Session[];
  open: Contraction[];
  settings: Settings | undefined;
  undo: UndoEntry | undefined;
}

let lastSnapshot: DbSnapshot | null = null;
let teardowns: Array<() => void> = [];

function derive(): void {
  const queue = getQueueSnapshot();
  const storage = { status: queue.status, pendingCount: queue.pendingCount };
  if (!lastSnapshot) {
    useAppStore.setState({ storage });
    return;
  }
  const sessions = mergeOverlay(lastSnapshot.unended, queue.overlay, 'sessions').filter((s) => s.endedAt === null);
  const activeSession = sessions[0] ?? null;
  const open = mergeOverlay(lastSnapshot.open, queue.overlay, 'contractions').filter(
    (c) => c.endAt === null && c.deletedAt === null && c.sessionId === activeSession?.id,
  );
  const [settings] = mergeOverlay(
    [{ id: 'singleton', ...(lastSnapshot.settings ?? DEFAULT_SETTINGS) }],
    queue.overlay,
    'settings',
  );
  useAppStore.setState({
    activeSession,
    activeContraction: open[0] ?? null,
    settings: settings ? stripId(settings) : structuredClone(DEFAULT_SETTINGS),
    storage,
    undo: lastSnapshot.undo ?? null,
  });
}

function stripId(s: Settings & { id?: string }): Settings {
  const { id: _id, ...rest } = s;
  void _id;
  return rest;
}

async function openWithFallback(): Promise<void> {
  try {
    await getDb().open();
  } catch {
    // Private mode or storage unavailable: run the same code over an in-memory database.
    // fake-indexeddb is imported lazily so it never reaches the main bundle.
    const { indexedDB, IDBKeyRange } = await import('fake-indexeddb');
    setDb(createDb({ indexedDB, IDBKeyRange }));
    await getDb().open();
    setMemoryMode(true);
  }
}

export function teardownStore(): void {
  for (const t of teardowns) t();
  teardowns = [];
  lastSnapshot = null;
  useAppStore.setState(initial(), true);
}

/** Opens the database (falling back to memory), loads the cache, subscribes to live queries and to other tabs. */
export async function initStore(): Promise<void> {
  teardownStore();
  try {
    await openWithFallback();
    await getSettings();
    await purgeExpired(Date.now());

    const db = getDb();
    let first!: () => void;
    const firstEmission = new Promise<void>((resolve) => (first = resolve));
    const sub: Subscription = liveQuery(async (): Promise<DbSnapshot> => {
      const [unended, open, settings, undo] = await Promise.all([
        // The endedAt index does not hold nulls, so filter rather than query it.
        db.sessions.filter((s) => s.endedAt === null).toArray(),
        db.contractions.filter((c) => c.endAt === null && c.deletedAt === null).toArray(),
        db.settings.get('singleton'),
        db.undo.get('singleton'),
      ]);
      return { unended, open, settings, undo };
    }).subscribe({
      next: (snap) => {
        lastSnapshot = snap;
        derive();
        first();
      },
      error: (e) => {
        console.error(e);
        first();
      },
    });
    teardowns.push(() => sub.unsubscribe());
    teardowns.push(subscribeQueue(derive));
    teardowns.push(startSync());
    await firstEmission;
    useAppStore.setState({ ready: true });
  } finally {
    document.documentElement.dataset.dbReady = '1';
  }
}
