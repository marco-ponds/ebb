import { ChevronLeft } from 'lucide-react';
import { InstallHint } from '../../app/InstallHint';
import { useInstallHint } from '../../app/installPrompt';
import { useUpdateReady } from '../../app/swUpdate';
import { goBack } from '../../app/router';
import { isWakeLockSupported } from '../../app/wakeLock';
import { Card, IconButton, SafetyLine, Segmented, Switch } from '../../components';
import { updateSettings } from '../../db/settings';
import type { IntensityScale, Theme } from '../../db/types';
import { useSettings } from '../../state/hooks';
import { useAppStore } from '../../state/store';
import { DataSection } from './DataSection';
import styles from './Settings.module.css';
import { ThresholdsSection } from './ThresholdsSection';

const SCALE: Array<{ value: IntensityScale; label: string }> = [
  { value: 'words', label: '5 words' },
  { value: 'numeric', label: '1–10' },
  { value: 'both', label: 'Both' },
];
const LOOK: Array<{ value: Theme; label: string }> = [
  { value: 'night', label: 'Night' },
  { value: 'day', label: 'Day' },
  { value: 'system', label: 'Match phone' },
];

function InstallSection() {
  const { kind } = useInstallHint();
  if (kind === 'none') return null;
  return (
    <section aria-labelledby="settings-install">
      <h2 id="settings-install" className={styles.sectionTitle}>
        Install Ebb
      </h2>
      <Card>
        <div className={styles.stack}>
          <InstallHint textClassName={styles.installText} />
        </div>
      </Card>
    </section>
  );
}

export function SettingsScreen() {
  const settings = useSettings();
  const active = useAppStore((s) => s.activeSession !== null);
  const updateReady = useUpdateReady();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <IconButton
          label="Back"
          icon={<ChevronLeft size={26} strokeWidth={2.4} />}
          onClick={() => goBack(active ? '#/live' : '#/')}
        />
        <h1 className={styles.title}>Settings</h1>
      </header>

      <ThresholdsSection />

      <section aria-labelledby="settings-scale">
        <h2 id="settings-scale" className={styles.sectionTitle}>
          Strength scale
        </h2>
        <Segmented
          label="Strength scale"
          options={SCALE}
          value={settings.intensityScale}
          onChange={(v) => void updateSettings({ intensityScale: v as IntensityScale })}
        />
      </section>

      <section aria-labelledby="settings-look">
        <h2 id="settings-look" className={styles.sectionTitle}>
          Look
        </h2>
        <Segmented label="Look" options={LOOK} value={settings.theme} onChange={(v) => void updateSettings({ theme: v as Theme })} />
      </section>

      <Card>
        <ul className={styles.rows}>
          <li className={styles.row}>
            <div className={styles.rowMain}>
              <Switch
                tone="mint"
                label="Keep screen awake"
                description="During a session"
                checked={settings.keepAwake}
                onChange={(on) => void updateSettings({ keepAwake: on })}
              />
              {isWakeLockSupported() ? null : (
                <p className={styles.help}>
                  This browser can't keep the screen on. You can raise the auto-lock time in your phone's display settings.
                </p>
              )}
            </div>
          </li>
          <li className={styles.row}>
            <div className={styles.rowMain}>
              <Switch
                tone="mint"
                label="Gentle buzz"
                description="On start and stop"
                checked={settings.haptics}
                onChange={(on) => void updateSettings({ haptics: on })}
              />
            </div>
          </li>
          <li className={styles.row}>
            <div className={styles.rowMain}>
              <Switch
                tone="mint"
                label="Breathing glow"
                description="Slow pulse during a contraction"
                checked={settings.breathingGlow}
                onChange={(on) => void updateSettings({ breathingGlow: on })}
              />
            </div>
          </li>
        </ul>
      </Card>

      <DataSection />

      <InstallSection />

      <footer className={styles.footer}>
        <SafetyLine />
        <p className={styles.version}>Version {__APP_VERSION__}</p>
        {updateReady ? <p className={styles.update}>Update ready — restart the app to use it</p> : null}
      </footer>
    </main>
  );
}
