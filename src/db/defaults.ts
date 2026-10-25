import type { Settings, Threshold } from './types';

export const PRESET_THRESHOLDS: Threshold[] = [
  { id: 'preset-3-in-10', kind: 'n-in-m', n: 3, minutes: 10, enabled: false, label: null, preset: true },
  { id: 'preset-5-1-1', kind: 'ald', apartMin: 5, lastingMin: 1, hours: 1, enabled: false, label: null, preset: true },
  { id: 'preset-4-1-1', kind: 'ald', apartMin: 4, lastingMin: 1, hours: 1, enabled: false, label: null, preset: true },
  { id: 'preset-3-1-1', kind: 'ald', apartMin: 3, lastingMin: 1, hours: 1, enabled: false, label: null, preset: true },
];

export const DEFAULT_SETTINGS: Settings = {
  thresholds: PRESET_THRESHOLDS,
  intensityScale: 'words',
  theme: 'night',
  keepAwake: true,
  haptics: true,
  breathingGlow: true,
  lastBackupAt: null,
  onboardedAt: null,
};
