import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, PRESET_THRESHOLDS } from './defaults';
import { createDb, getDb, setDb } from './schema';

describe('schema', () => {
  it('opens a db named ebb with the five tables', async () => {
    const db = createDb();
    await db.open();
    expect(db.name).toBe('ebb');
    expect(db.tables.map((t) => t.name).sort()).toEqual(['contractions', 'events', 'sessions', 'settings', 'undo']);
    db.close();
  });

  it('round-trips a settings row under an out-of-line key', async () => {
    const db = createDb();
    await db.settings.put(DEFAULT_SETTINGS, 'singleton');
    expect(await db.settings.get('singleton')).toEqual(DEFAULT_SETTINGS);
    db.close();
    await db.delete();
  });

  it('getDb returns the db given to setDb', () => {
    const db = createDb();
    setDb(db);
    expect(getDb()).toBe(db);
  });

  it('ships four disabled presets', () => {
    expect(PRESET_THRESHOLDS.map((t) => t.id)).toEqual(['preset-3-in-10', 'preset-5-1-1', 'preset-4-1-1', 'preset-3-1-1']);
    expect(PRESET_THRESHOLDS.every((t) => !t.enabled && t.preset && t.label === null)).toBe(true);
  });
});
