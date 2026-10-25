import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useSyncExternalStore } from 'react';
import { Dexie } from 'dexie';
import { getQueueSnapshot, subscribeQueue, type StorageStatus } from '../db/queue';
import { getDb } from '../db/schema';
import type { Contraction, EbbEvent, Session, Settings } from '../db/types';
import { mergeOverlay } from './overlay';
import { useAppStore } from './store';

const useOverlay = () => useSyncExternalStore(subscribeQueue, getQueueSnapshot, getQueueSnapshot).overlay;

/** All sessions, newest first. `undefined` while the first read is in flight. */
export function useSessions(): Session[] | undefined {
  const rows = useLiveQuery(() => getDb().sessions.toArray(), []);
  const overlay = useOverlay();
  return useMemo(
    () => rows && mergeOverlay(rows, overlay, 'sessions').sort((a, b) => b.startedAt - a.startedAt),
    [rows, overlay],
  );
}

/** One session; `null` when it doesn't exist, `undefined` while loading. */
export function useSession(id: string): Session | null | undefined {
  const row = useLiveQuery(() => getDb().sessions.get(id).then((s) => s ?? null), [id]);
  const overlay = useOverlay();
  return useMemo(() => {
    if (row === undefined) return undefined;
    return mergeOverlay(row ? [row] : [], overlay, 'sessions').find((s) => s.id === id) ?? null;
  }, [row, overlay, id]);
}

/** Non-deleted contractions of a session by startAt, pending writes included. */
export function useContractions(sessionId: string): Contraction[] | undefined {
  const rows = useLiveQuery(
    () => getDb().contractions.where('[sessionId+startAt]').between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey]).toArray(),
    [sessionId],
  );
  const overlay = useOverlay();
  return useMemo(
    () =>
      rows &&
      mergeOverlay(rows, overlay, 'contractions')
        .filter((c) => c.sessionId === sessionId && c.deletedAt === null)
        .sort((a, b) => a.startAt - b.startAt),
    [rows, overlay, sessionId],
  );
}

/** Non-deleted events of a session by time, pending writes included. */
export function useEvents(sessionId: string): EbbEvent[] | undefined {
  const rows = useLiveQuery(
    () => getDb().events.where('[sessionId+at]').between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey]).toArray(),
    [sessionId],
  );
  const overlay = useOverlay();
  return useMemo(
    () =>
      rows &&
      mergeOverlay(rows, overlay, 'events')
        .filter((e) => e.sessionId === sessionId && e.deletedAt === null)
        .sort((a, b) => a.at - b.at),
    [rows, overlay, sessionId],
  );
}

export function useSettings(): Settings {
  return useAppStore((s) => s.settings);
}

export function useUndoAvailable(): boolean {
  return useAppStore((s) => s.undo !== null);
}

export function useStorageStatus(): { status: StorageStatus; pendingCount: number; conflictCount: number } {
  return useAppStore((s) => s.storage);
}
