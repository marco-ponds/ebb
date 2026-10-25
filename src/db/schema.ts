import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Contraction, EbbEvent, Session, Settings, UndoEntry } from './types';

/**
 * Migration rule: schema changes are forward-only. Before any `version(n+1)` upgrade runs, snapshot
 * the existing data to the backups cache (Task 3 provides the snapshot function). Never edit or
 * remove an existing `version(n)` block.
 */
export class EbbDB extends Dexie {
  sessions!: EntityTable<Session, 'id'>;
  contractions!: EntityTable<Contraction, 'id'>;
  events!: EntityTable<EbbEvent, 'id'>;
  /** Single row under key 'singleton'. */
  settings!: Table<Settings, string>;
  /** Single row under key 'singleton': the last undoable action. */
  undo!: Table<UndoEntry, string>;

  constructor(deps?: { indexedDB: IDBFactory; IDBKeyRange: typeof IDBKeyRange }) {
    super('ebb', deps);
    this.version(1).stores({
      sessions: 'id, startedAt, endedAt',
      contractions: 'id, sessionId, [sessionId+startAt]',
      events: 'id, [sessionId+at]',
      settings: '',
      undo: '',
    });
  }
}

export function createDb(deps?: { indexedDB: IDBFactory; IDBKeyRange: typeof IDBKeyRange }): EbbDB {
  return new EbbDB(deps);
}

let current: EbbDB | null = null;

export function getDb(): EbbDB {
  current ??= createDb();
  return current;
}

export function setDb(db: EbbDB): void {
  current = db;
}
