import { ChevronLeft } from 'lucide-react';
import { InstallHint } from '../../app/InstallHint';
import { useInstallHint } from '../../app/installPrompt';
import { useUpdateReady } from '../../app/swUpdate';
import { goBack } from '../../app/router';
import { isWakeLockSupported } from '../../app/wakeLock';
import { Card, IconButton, SafetyLine, Segmented, Switch } from '../../components';
import { BREATHE_SECONDS } from '../../db/defaults';
import { updateSettings } from '../../db/settings';
import type { IntensityScale, Theme } from '../../db/types';
import { useReducedMotion } from '../../lib/useReducedMotion';
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

const BREATHE_OPTIONS = BREATHE_SECONDS.map((n) => ({ value: String(n), label: `${n} s` }));

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
  const reducedMotion = useReducedMotion();
  const showTiming = settings.breathingGlow && !reducedMotion;

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
                description={
                  showTiming
                    ? `Slow pulse during a contraction · in ${settings.breatheInSeconds} s, out ${settings.breatheOutSeconds} s`
                    : 'Slow pulse during a contraction'
                }
                checked={settings.breathingGlow}
                onChange={(on) => void updateSettings({ breathingGlow: on })}
              />
              {reducedMotion ? (
                <p className={styles.help}>Your phone is set to reduce motion, so the glow stays off</p>
              ) : null}
              {showTiming ? (
                <div className={styles.timing}>
                  <span className={styles.timingLabel} aria-hidden="true">
                    Breathe in
                  </span>
                  <Segmented
                    label="Breathe in"
                    options={BREATHE_OPTIONS}
                    value={String(settings.breatheInSeconds)}
                    onChange={(v) => void updateSettings({ breatheInSeconds: Number(v) })}
                  />
                  <span className={styles.timingLabel} aria-hidden="true">
                    Breathe out
                  </span>
                  <Segmented
                    label="Breathe out"
                    options={BREATHE_OPTIONS}
                    value={String(settings.breatheOutSeconds)}
                    onChange={(v) => void updateSettings({ breatheOutSeconds: Number(v) })}
                  />
                </div>
              ) : null}
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
