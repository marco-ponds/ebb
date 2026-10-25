import { isDomainError } from './errors';
import { getDb, type EbbDB } from './schema';
import { notifyChanged } from './sync';
import type { Contraction, EbbEvent, Session, Settings, UndoEntry } from './types';

export type StorageStatus = 'ok' | 'failing' | 'memory';
export type OverlayTable = 'sessions' | 'contractions' | 'events' | 'settings' | 'undo';

/** A row the UI should show although the database has not accepted it yet (`value: null` = the row is gone). */
export interface OverlayRecord {
  table: OverlayTable;
  id: string;
  value: Session | Contraction | EbbEvent | Settings | UndoEntry | null;
}

/** A parked change that could not be saved because the database changed underneath it (e.g. another tab got there first). */
export interface ReplayConflict {
  reason: string;
  writes: readonly OverlayRecord[];
}

export interface QueueSnapshot {
  status: StorageStatus;
  pendingCount: number;
  overlay: readonly OverlayRecord[];
  conflicts: readonly ReplayConflict[];
}

export interface RunWriteOptions {
  /** Default true. Bulk operations (restore, delete all) are not taps: on storage failure they reject instead of parking. */
  parkable?: boolean;
  /** Runs inside the queue, outside the transaction, just before the write (e.g. to snapshot to Cache Storage). */
  before?: () => Promise<void>;
}

interface WriteContext {
  seed: OverlayRecord[];
  /** Every row this op wrote (or, in plan mode, would write), in order. These are what gets parked on failure. */
  writes: OverlayRecord[];
  /** Plan mode: earlier writes are still parked, so this op only records what it would write. */
  plan: boolean;
  storageError: unknown;
  completed: boolean;
  result: unknown;
}

interface PendingWrite {
  writes: OverlayRecord[];
}

const TABLES = ['sessions', 'contractions', 'events', 'settings', 'undo'] as const;

let retryDelays = [100, 300, 900];
let chain: Promise<unknown> = Promise.resolve();
let pending: PendingWrite[] = [];
let memoryMode = false;
let failing = false;
let running: WriteContext | null = null;
const listeners = new Set<() => void>();
let conflicts: ReplayConflict[] = [];
let snapshot: QueueSnapshot = { status: 'ok', pendingCount: 0, overlay: [], conflicts: [] };

function emit(): void {
  snapshot = {
    status: memoryMode ? 'memory' : failing ? 'failing' : 'ok',
    pendingCount: pending.length,
    overlay: pending.flatMap((p) => p.writes),
    conflicts,
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

/** Everything the app intends to be true: parked writes, then the writes of the op that is running now. Later wins. */
export function intendedWrites(table?: OverlayTable): OverlayRecord[] {
  const all = [...pending.flatMap((p) => p.writes), ...(running?.writes ?? [])];
  return table ? all.filter((w) => w.table === table) : all;
}

export function intendedWrite(table: OverlayTable, id: string): OverlayRecord | undefined {
  const all = intendedWrites(table);
  for (let i = all.length - 1; i >= 0; i--) if (all[i].id === id) return all[i];
  return undefined;
}

async function applyWrite(db: EbbDB, w: OverlayRecord): Promise<void> {
  const table = db[w.table] as unknown as { put(v: unknown, key?: string): Promise<unknown>; delete(key: string): Promise<void> };
  if (w.value === null) await table.delete(w.id);
  else if (w.table === 'settings' || w.table === 'undo') await table.put(w.value, w.id);
  else await table.put(w.value);
}

/**
 * The only way an op changes a row. It records the write (so a failed commit can park it and show it as an overlay)
 * and performs it inside the op's transaction. A storage failure is remembered, not thrown, so the op can finish
 * and hand back its result; the queue then rolls the transaction back and parks the recorded writes.
 */
export async function write(table: OverlayTable, id: string, value: OverlayRecord['value']): Promise<void> {
  const ctx = running;
  if (!ctx) throw new Error('write() must be called from inside runWrite');
  const record: OverlayRecord = { table, id, value };
  ctx.writes.push(record);
  if (ctx.plan || ctx.storageError) return;
  try {
    await applyWrite(getDb(), record);
  } catch (e) {
    if (isDomainError(e)) throw e;
    ctx.storageError = e;
  }
}

async function attempt<T>(op: () => Promise<T>, ctx: WriteContext): Promise<T> {
  const db = getDb();
  ctx.writes = [...ctx.seed];
  ctx.storageError = null;
  ctx.completed = false;
  running = ctx;
  try {
    return await db.transaction('rw', TABLES.map((t) => db[t]), async () => {
      const result = await op();
      ctx.result = result;
      ctx.completed = true;
      if (ctx.storageError) throw ctx.storageError; // roll the whole op back
      return result;
    });
  } finally {
    running = null;
  }
}

async function planOnly<T>(op: () => Promise<T>, ctx: WriteContext): Promise<T> {
  ctx.writes = [...ctx.seed];
  ctx.plan = true;
  running = ctx;
  try {
    const result = await op();
    ctx.result = result;
    ctx.completed = true;
    return result;
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

class ConflictSignal extends Error {}

/**
 * Parked writes are only known to this tab, so before they land the data-model invariants are re-checked against the
 * database: at most one active session, at most one open contraction, and only in the active session.
 */
async function assertInvariants(db: EbbDB, writes: OverlayRecord[]): Promise<void> {
  for (const w of writes) {
    const v = w.value as Session | Contraction | null;
    if (!v) continue;
    if (w.table === 'sessions' && (v as Session).endedAt === null) {
      if (await db.sessions.filter((s) => s.endedAt === null && s.id !== w.id).first()) throw new ConflictSignal('Another session is already active');
    }
    if (w.table === 'contractions' && (v as Contraction).endAt === null && (v as Contraction).deletedAt === null) {
      const c = v as Contraction;
      if (await db.contractions.filter((o) => o.endAt === null && o.deletedAt === null && o.id !== w.id).first()) {
        throw new ConflictSignal('Another contraction is already in progress');
      }
      const session = await db.sessions.get(c.sessionId);
      if (!session || session.endedAt !== null) throw new ConflictSignal('The session this contraction belongs to has ended');
    }
  }
}

/** Replays parked writes in order, one transaction each. Stops at the first storage failure. */
async function flush(): Promise<boolean> {
  while (pending.length > 0) {
    const next = pending[0];
    try {
      const db = getDb();
      await db.transaction('rw', TABLES.map((t) => db[t]), async () => {
        for (const w of next.writes) await applyWrite(db, w);
        await assertInvariants(db, next.writes);
      });
    } catch (e) {
      if (e instanceof ConflictSignal) {
        // Not applied, not dropped silently: reported, and the overlay no longer shows it. Later sets stay parked.
        conflicts = [...conflicts, { reason: e.message, writes: next.writes }];
        pending = pending.slice(1);
        failing = true;
        emit();
      }
      return false;
    }
    pending = pending.slice(1);
    notifyChanged();
    emit();
  }
  failing = false;
  emit();
  return true;
}

async function execute<T>(op: () => Promise<T>, ctx: WriteContext, options: RunWriteOptions): Promise<T> {
  const parkable = options.parkable ?? true;
  let delays = retryDelays;
  let plan = false;
  if (pending.length > 0 && !(await flush())) {
    if (!parkable) throw new Error('Earlier changes are not saved yet. Retry saving them first.');
    plan = true; // storage is still failing: queue this op behind the parked ones, working from what they intend
    delays = [];
  }
  await options.before?.();
  try {
    const result = plan ? await planOnly(op, ctx) : await attemptWithRetries(op, ctx, delays);
    if (!plan) notifyChanged();
    else park(ctx);
    return result;
  } catch (e) {
    if (isDomainError(e) || !parkable || !ctx.completed || plan) throw e;
    park(ctx);
    return ctx.result as T;
  }
}

function park(ctx: WriteContext): void {
  pending = [...pending, { writes: ctx.writes }];
  failing = true;
  emit();
}

/**
 * The only write path to IndexedDB. Writes run one at a time, each in a Dexie `rw` transaction, and a storage failure
 * is retried 3x (100, 300, 900 ms). After that the writes are kept in memory, status becomes 'failing', and the caller
 * still gets the intended result so the UI keeps the tap. Later ops see the parked writes and queue behind them, so a
 * stop after a parked start works. Domain errors (see errors.ts) are never retried. `overlay` seeds records the op
 * wants shown in addition to what it passes to `write`.
 */
export function runWrite<T>(op: () => Promise<T>, overlay: OverlayRecord[] = [], options: RunWriteOptions = {}): Promise<T> {
  const ctx: WriteContext = { seed: overlay, writes: [], plan: false, storageError: null, completed: false, result: undefined };
  const result = chain.then(() => execute(op, ctx, options));
  chain = result.catch(() => undefined);
  return result;
}

/** Replays the writes that storage refused. Resolves true when none are left. */
export function retryPendingWrites(): Promise<boolean> {
  const result = chain.then(flush);
  chain = result.catch(() => undefined);
  return result;
}

/** Forget the reported conflicts once the user has seen them. */
export function clearConflicts(): void {
  conflicts = [];
  emit();
}

/** Test hook: shorten the retry back-off. */
export function setRetryDelays(delays: number[]): void {
  retryDelays = delays;
}

/** Test hook: forget every pending write and go back to a clean 'ok' state. */
export function resetQueue(): void {
  chain = Promise.resolve();
  pending = [];
  conflicts = [];
  failing = false;
  memoryMode = false;
  retryDelays = [100, 300, 900];
  emit();
}
