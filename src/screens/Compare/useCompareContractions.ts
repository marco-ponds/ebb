import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { getDb } from '../../db/schema';
import type { Contraction } from '../../db/types';

/** Non-deleted contractions of the given sessions, grouped by session id. `undefined` while loading. */
export function useCompareContractions(ids: string[]): Map<string, Contraction[]> | undefined {
  const key = ids.join(',');
  const rows = useLiveQuery(
    () => (ids.length === 0 ? Promise.resolve<Contraction[]>([]) : getDb().contractions.where('sessionId').anyOf(ids).toArray()),
    [key],
  );
  return useMemo(() => {
    if (!rows) return undefined;
    const by = new Map<string, Contraction[]>(ids.map((id) => [id, []]));
    for (const c of rows) {
      if (c.deletedAt === null) by.get(c.sessionId)?.push(c);
    }
    return by;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `ids`
  }, [rows, key]);
}
