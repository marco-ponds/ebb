import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, IconButton, Switch } from '../../components';
import { updateSettings } from '../../db/settings';
import type { Threshold } from '../../db/types';
import { thresholdDescription, thresholdName } from '../../domain/thresholds';
import { useSettings } from '../../state/hooks';
import styles from './Settings.module.css';
import { ThresholdEditor } from './ThresholdEditor';

type Editing = { threshold: Threshold | null } | null;

export function ThresholdsSection() {
  const { thresholds } = useSettings();
  const [editing, setEditing] = useState<Editing>(null);

  const store = (next: Threshold[]) => void updateSettings({ thresholds: next });
  const toggle = (id: string, enabled: boolean) => store(thresholds.map((t) => (t.id === id ? { ...t, enabled } : t)));
  const close = () => setEditing(null);

  const save = (t: Threshold) => {
    const exists = thresholds.some((x) => x.id === t.id);
    store(exists ? thresholds.map((x) => (x.id === t.id ? t : x)) : [...thresholds, t]);
    close();
  };
  const remove = (id: string) => {
    store(thresholds.filter((t) => t.id !== id));
    close();
  };

  return (
    <section aria-labelledby="settings-thresholds">
      <h2 id="settings-thresholds" className={styles.sectionTitle}>
        Your thresholds
      </h2>
      <Card>
        <p className={styles.intro}>
          None are on until you choose. Pick what your midwife or unit told you — a gentle note appears when it's met.
        </p>
        <ul className={styles.rows}>
          {thresholds.map((t) => (
            <li key={t.id} className={styles.row}>
              <div className={styles.rowMain}>
                <Switch
                  tone="butter"
                  checked={t.enabled}
                  onChange={(on) => toggle(t.id, on)}
                  label={thresholdName(t)}
                  description={thresholdDescription(t)}
                />
              </div>
              {t.preset ? null : (
                <IconButton
                  label={`Edit ${thresholdName(t)}`}
                  icon={<Pencil size={20} strokeWidth={2.2} />}
                  onClick={() => setEditing({ threshold: t })}
                />
              )}
            </li>
          ))}
        </ul>
        <Button variant="ghost" className={styles.addButton} onClick={() => setEditing({ threshold: null })}>
          + Custom threshold
        </Button>
      </Card>
      <ThresholdEditor
        key={editing?.threshold?.id ?? 'new'}
        open={editing !== null}
        initial={editing?.threshold ?? null}
        onClose={close}
        onSave={save}
        onDelete={remove}
      />
    </section>
  );
}
