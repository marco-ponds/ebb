import { isDomainError } from './errors';
import { getDb } from './schema';
import { notifyChanged } from './sync';
import type { Contraction, EbbEvent, Session, Settings, TableName } from './types';

export type StorageStatus = 'ok' | 'failing' | 'memory';

/** A row the UI should show although the database has not accepted it yet (`value: null` = the row is gone). */
export interface OverlayRecord {
  table: TableName | 'settings';
  id: string;
  value: Session | Contraction | EbbEvent | Settings | null;
}

export interface QueueSnapshot {
  status: StorageStatus;
  pendingCount: number;
  overlay: readonly OverlayRecord[];
}

interface WriteContext {
  overlay: OverlayRecord[];
  hasIntent: boolean;
  value: unknown;
}

interface PendingWrite {
  op: () => Promise<unknown>;
  ctx: WriteContext;
}

let retryDelays = [100, 300, 900];
let chain: Promise<unknown> = Promise.resolve();
let pending: PendingWrite[] = [];
let memoryMode = false;
let failing = false;
let running: WriteContext | null = null;
const listeners = new Set<() => void>();
let snapshot: QueueSnapshot = { status: 'ok', pendingCount: 0, overlay: [] };

function emit(): void {
  snapshot = {
    status: memoryMode ? 'memory' : failing ? 'failing' : 'ok',
    pendingCount: pending.length,
    overlay: pending.flatMap((p) => p.ctx.overlay),
  };
  for (const l of listeners) l();
}

export function getQueueSnapshot(): QueueSnapshot {
  return snapshot;
}

export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Marks the tab as running on the in-memory fallback database. */
export function setMemoryMode(on: boolean): void {
  memoryMode = on;
  emit();
}

/**
 * Called by an op once it has decided what it will write, before it writes. If storage then keeps failing,
 * the queue resolves the caller with `result` and shows `overlay` to the hooks until a retry commits it.
 */
export function intend<T>(result: T, overlay: OverlayRecord[] = []): void {
  if (!running) throw new Error('intend() must be called from inside runWrite');
  running.hasIntent = true;
  running.value = result;
  running.overlay.splice(0, running.overlay.length, ...overlay);
}

async function attempt<T>(op: () => Promise<T>, ctx: WriteContext): Promise<T> {
  const db = getDb();
  running = ctx;
  try {
    return await db.transaction('rw', [db.sessions, db.contractions, db.events, db.settings, db.undo], op);
  } finally {
    running = null;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function attemptWithRetries<T>(op: () => Promise<T>, ctx: WriteContext, delays: number[]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await attempt(op, ctx);
    } catch (e) {
      if (isDomainError(e) || i >= delays.length) throw e;
      await sleep(delays[i]);
    }
  }
}

/** Replays pending writes in order. Stops at the first storage failure. */
async function flush(): Promise<boolean> {
  while (pending.length > 0) {
    const next = pending[0];
    try {
      await attempt(next.op, next.ctx);
    } catch (e) {
      // A request that can no longer be honoured (state changed meanwhile) is dropped; storage trouble stops the replay.
      if (!isDomainError(e)) return false;
    }
    pending = pending.slice(1);
    notifyChanged();
    emit();
  }
  failing = false;
  emit();
  return true;
}

async function execute<T>(op: () => Promise<T>, ctx: WriteContext): Promise<T> {
  let delays = retryDelays;
  if (pending.length > 0 && !(await flush())) delays = [];
  try {
    const result = await attemptWithRetries(op, ctx, delays);
    notifyChanged();
    return result;
  } catch (e) {
    if (isDomainError(e) || !ctx.hasIntent) throw e;
    pending = [...pending, { op, ctx }];
    failing = true;
    emit();
    return ctx.value as T;
  }
}

/**
 * The only write path to IndexedDB. Writes run one at a time, each in a Dexie `rw` transaction, and a storage failure
 * is retried 3x (100, 300, 900 ms). After that the op is kept in memory, status becomes 'failing', and the caller still
 * gets the intended result so the UI keeps the tap. Domain errors (see errors.ts) are never retried.
 */
export function runWrite<T>(op: () => Promise<T>, overlay: OverlayRecord[] = []): Promise<T> {
  const ctx: WriteContext = { overlay, hasIntent: false, value: undefined };
  const result = chain.then(() => execute(op, ctx));
  chain = result.catch(() => undefined);
  return result;
}

/** Replays the writes that storage refused. Resolves true when none are left. */
export function retryPendingWrites(): Promise<boolean> {
  const result = chain.then(flush);
  chain = result.catch(() => undefined);
  return result;
}

/** Test hook: shorten the retry back-off. */
export function setRetryDelays(delays: number[]): void {
  retryDelays = delays;
}

/** Test hook: forget every pending write and go back to a clean 'ok' state. */
export function resetQueue(): void {
  chain = Promise.resolve();
  pending = [];
  failing = false;
  memoryMode = false;
  retryDelays = [100, 300, 900];
  emit();
}
