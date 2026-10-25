import { DEFAULT_SETTINGS } from './defaults';
import { runWrite, write } from './queue';
import { getSettingsRow } from './reads';
import type { Settings } from './types';

const KEY = 'singleton';

const defaults = (): Settings => structuredClone(DEFAULT_SETTINGS);

/** Reads the settings row, writing the defaults first when it is missing. */
export async function getSettings(): Promise<Settings> {
  const existing = await getSettingsRow();
  if (existing) return existing;
  return runWrite(async () => {
    const found = await getSettingsRow();
    const row = found ?? defaults();
    if (!found) await write('settings', KEY, row);
    return row;
  });
}

/** Merges `patch` into the settings. Settings changes are not undoable. */
export function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  return runWrite(async () => {
    const row: Settings = { ...((await getSettingsRow()) ?? defaults()), ...patch };
    await write('settings', KEY, row);
    return row;
  });
}
