import Dexie, { RangeSet } from 'dexie';

export const SYNC_CHANNEL = 'ebb-sync';
export type SyncTable = 'sessions' | 'contractions' | 'events' | 'settings' | 'undo';
export interface SyncMessage {
  type: 'changed';
  tables: SyncTable[];
}

const ALL_TABLES: SyncTable[] = ['sessions', 'contractions', 'events', 'settings', 'undo'];

let channel: BroadcastChannel | null = null;
const handlers = new Set<(tables: SyncTable[]) => void>();

function isSyncMessage(data: unknown): data is SyncMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as SyncMessage).type === 'changed' &&
    Array.isArray((data as SyncMessage).tables)
  );
}

/** Wakes every liveQuery in this tab, as if the database had changed locally. */
export function refreshLiveQueries(): void {
  Dexie.on('storagemutated').fire({ all: new RangeSet(-Infinity, [[]]) });
}

function ensureChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (channel) return channel;
  channel = new BroadcastChannel(SYNC_CHANNEL);
  channel.onmessage = (ev: MessageEvent) => {
    if (!isSyncMessage(ev.data)) return;
    refreshLiveQueries();
    for (const h of handlers) h(ev.data.tables);
  };
  return channel;
}

/** Tells the other tabs that a write committed. Last write wins per record, so there is nothing to merge. */
export function notifyChanged(tables: SyncTable[] = ALL_TABLES): void {
  ensureChannel()?.postMessage({ type: 'changed', tables } satisfies SyncMessage);
}

/** Calls `onRemoteChange` whenever another tab commits a write. Returns the unsubscribe function. */
export function startSync(onRemoteChange: (tables: SyncTable[]) => void = () => {}): () => void {
  ensureChannel();
  handlers.add(onRemoteChange);
  return () => {
    handlers.delete(onRemoteChange);
  };
}

export function closeSync(): void {
  handlers.clear();
  channel?.close();
  channel = null;
}
