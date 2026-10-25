import { newId } from '../../lib/uuid';
import { useState } from 'react';
import { Button, Segmented, Sheet } from '../../components';
import type { Threshold } from '../../db/types';
import { validateCustom, type CustomInput } from '../../domain/thresholds';
import styles from './Settings.module.css';

type Kind = Threshold['kind'];

interface Draft {
  kind: Kind;
  n: string;
  minutes: string;
  apartMin: string;
  lastingMin: string;
  hours: string;
  label: string;
}

const blank: Draft = { kind: 'n-in-m', n: '3', minutes: '10', apartMin: '5', lastingMin: '1', hours: '1', label: '' };

function draftOf(t: Threshold | null): Draft {
  if (!t) return blank;
  if (t.kind === 'n-in-m') return { ...blank, kind: 'n-in-m', n: String(t.n), minutes: String(t.minutes), label: t.label ?? '' };
  return {
    ...blank,
    kind: 'ald',
    apartMin: String(t.apartMin),
    lastingMin: String(t.lastingMin),
    hours: String(t.hours),
    label: t.label ?? '',
  };
}

const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s));

function inputOf(d: Draft): CustomInput {
  return d.kind === 'n-in-m'
    ? { kind: 'n-in-m', n: num(d.n), minutes: num(d.minutes) }
    : { kind: 'ald', apartMin: num(d.apartMin), lastingMin: num(d.lastingMin), hours: num(d.hours) };
}

const FIELDS: Record<Kind, Array<{ key: 'n' | 'minutes' | 'apartMin' | 'lastingMin' | 'hours'; label: string }>> = {
  'n-in-m': [
    { key: 'n', label: 'Contractions' },
    { key: 'minutes', label: 'Minutes' },
  ],
  ald: [
    { key: 'apartMin', label: 'Apart, at most (min)' },
    { key: 'lastingMin', label: 'Lasting, at least (min)' },
    { key: 'hours', label: 'For (hours)' },
  ],
};

function Form({ initial, onSave, onDelete }: { initial: Threshold | null; onSave: (t: Threshold) => void; onDelete?: () => void }) {
  const [d, setD] = useState<Draft>(() => draftOf(initial));
  const errors = validateCustom(inputOf(d));
  const invalid = Object.keys(errors).length > 0;
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const save = () => {
    if (invalid) return;
    const base = { id: initial?.id ?? newId(), enabled: initial?.enabled ?? true, label: d.label.trim() || null, preset: false as const };
    const input = inputOf(d);
    onSave(input.kind === 'n-in-m' ? { ...base, ...input } : { ...base, ...input });
  };

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Segmented
        label="Threshold type"
        options={[
          { value: 'n-in-m', label: 'N in M minutes' },
          { value: 'ald', label: 'A-L-D' },
        ]}
        value={d.kind}
        onChange={(v) => set({ kind: v as Kind })}
      />
      {d.kind === 'ald' ? (
        <p className={styles.hint}>Apart at most A min, lasting at least L min, for D hours.</p>
      ) : null}
      {FIELDS[d.kind].map((f) => (
        <div key={f.key} className={styles.stack}>
          <label className={styles.field}>
            {f.label}
            <input
              className={styles.input}
              type="number"
              inputMode="decimal"
              step="any"
              value={d[f.key]}
              onChange={(e) => set({ [f.key]: e.target.value })}
              aria-invalid={errors[f.key] ? true : undefined}
            />
          </label>
          {errors[f.key] ? <p className={styles.hint}>{errors[f.key]}</p> : null}
        </div>
      ))}
      <label className={styles.field}>
        Label (optional)
        <input className={styles.input} type="text" value={d.label} maxLength={40} onChange={(e) => set({ label: e.target.value })} />
      </label>
      <Button variant="primary" type="submit" disabled={invalid}>
        Save
      </Button>
      {onDelete ? (
        <Button variant="destructive-text" onClick={onDelete}>
          Delete
        </Button>
      ) : null}
    </form>
  );
}

export interface ThresholdEditorProps {
  open: boolean;
  /** The custom threshold being edited, or null for a new one. */
  initial: Threshold | null;
  onClose: () => void;
  onSave: (t: Threshold) => void;
  onDelete: (id: string) => void;
}

export function ThresholdEditor({ open, initial, onClose, onSave, onDelete }: ThresholdEditorProps) {
  return (
    <Sheet open={open} onClose={onClose} title={initial ? 'Edit threshold' : 'Custom threshold'}>
      <Form initial={initial} onSave={onSave} onDelete={initial ? () => onDelete(initial.id) : undefined} />
    </Sheet>
  );
}
