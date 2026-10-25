// Test helper (not imported by the app): a fresh database and a clean write queue per test.
import { resetQueue } from './queue';
import { createDb, getDb, setDb } from './schema';
import { closeSync } from './sync';

export async function freshDb(): Promise<void> {
  resetQueue();
  const db = createDb();
  setDb(db);
  await db.open();
}

export async function dropDb(): Promise<void> {
  closeSync();
  const db = getDb();
  db.close();
  await db.delete();
  resetQueue();
}
