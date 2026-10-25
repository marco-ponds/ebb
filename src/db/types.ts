// FROZEN: later tasks treat this file as the data-model contract.
export type EventType =
  | 'waters'
  | 'bleeding'
  | 'reduced-movement'
  | 'called-midwife'
  | 'went-to-hospital'
  | 'note';
export type WatersDetail = 'clear' | 'pink' | 'green-brown' | 'unsure';
export type IntensityScale = 'words' | 'numeric' | 'both';
export type Theme = 'night' | 'day' | 'system';

export interface Session {
  id: string;
  name: string | null;
  startedAt: number;
  endedAt: number | null;
  notes: string;
  createdAt: number;
  updatedAt: number;
  thresholdMetAt: number | null;
}

export interface Contraction {
  id: string;
  sessionId: string;
  startAt: number;
  endAt: number | null;
  intensity: number | null;
  note: string | null;
  deletedAt: number | null;
  timeChanged: boolean;
  reviewed: boolean;
  updatedAt: number;
}

export interface EbbEvent {
  id: string;
  sessionId: string;
  at: number;
  type: EventType;
  details: WatersDetail | null;
  note: string | null;
  deletedAt: number | null;
  updatedAt: number;
}

interface ThresholdBase {
  id: string;
  enabled: boolean;
  label: string | null;
  preset: boolean;
}
export interface NInMThreshold extends ThresholdBase {
  kind: 'n-in-m';
  n: number;
  minutes: number;
}
export interface AldThreshold extends ThresholdBase {
  kind: 'ald';
  apartMin: number;
  lastingMin: number;
  hours: number;
}
export type Threshold = NInMThreshold | AldThreshold;

export interface Settings {
  thresholds: Threshold[];
  intensityScale: IntensityScale;
  theme: Theme;
  keepAwake: boolean;
  haptics: boolean;
  breathingGlow: boolean;
  lastBackupAt: number | null;
  onboardedAt: number | null;
}

export type UndoKind = 'start' | 'stop' | 'rate' | 'event' | 'edit' | 'delete' | 'add';
export type TableName = 'sessions' | 'contractions' | 'events';
export interface UndoEntry {
  kind: UndoKind;
  at: number;
  before: Array<{ table: TableName; id: string; value: Session | Contraction | EbbEvent | null }>;
}
