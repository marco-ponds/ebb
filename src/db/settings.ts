import { DEFAULT_SETTINGS } from './defaults';
import { intend, runWrite } from './queue';
import { getDb } from './schema';
import type { Settings } from './types';

const KEY = 'singleton';

const defaults = (): Settings => structuredClone(DEFAULT_SETTINGS);

/** Reads the settings row, writing the defaults first when it is missing. */
export async function getSettings(): Promise<Settings> {
  const existing = await getDb().settings.get(KEY);
  if (existing) return existing;
  return runWrite(async () => {
    const found = await getDb().settings.get(KEY);
    const row = found ?? defaults();
    intend(row, [{ table: 'settings', id: KEY, value: row }]);
    if (!found) await getDb().settings.put(row, KEY);
    return row;
  });
}

/** Merges `patch` into the settings. Settings changes are not undoable. */
export function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  return runWrite(async () => {
    const current = (await getDb().settings.get(KEY)) ?? defaults();
    const row: Settings = { ...current, ...patch };
    intend(row, [{ table: 'settings', id: KEY, value: row }]);
    await getDb().settings.put(row, KEY);
    return row;
  });
}
