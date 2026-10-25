import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { getDb } from '../../db/schema';
import type { Contraction } from '../../db/types';

/** Non-deleted contractions of every session, grouped by session id. `undefined` while loading. */
export function useSessionContractions(): Map<string, Contraction[]> | undefined {
  const rows = useLiveQuery(() => getDb().contractions.toArray(), []);
  return useMemo(() => {
    if (!rows) return undefined;
    const by = new Map<string, Contraction[]>();
    for (const c of rows) {
      if (c.deletedAt !== null) continue;
      const list = by.get(c.sessionId);
      if (list) list.push(c);
      else by.set(c.sessionId, [c]);
    }
    return by;
  }, [rows]);
}
