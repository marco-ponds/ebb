import { Suspense, lazy, useEffect, useLayoutEffect, useState } from 'react';
import { Skeleton, ToastHost } from '../components';
import { findActiveSession } from '../db/sessions';
import { LiveScreen } from '../screens/Live';
import { StartScreen } from '../screens/Start';
import { WelcomeScreen } from '../screens/Welcome';
import { useAppStore } from '../state/store';
import { BootFailed } from './BootFailed';
import { useBootStore } from './boot';
import { decideLanding } from './landing';
import { navigate, useRoute, type Route } from './router';
import { useApplyTheme } from './theme';
import { useAppWakeLock } from './wakeLock';

// Secondary screens load on demand to keep the initial bundle small; the SW still precaches the chunks.
const HistoryScreen = lazy(() => import('../screens/History').then((m) => ({ default: m.HistoryScreen })));
const CompareScreen = lazy(() => import('../screens/Compare').then((m) => ({ default: m.CompareScreen })));
const SessionDetailScreen = lazy(() =>
  import('../screens/SessionDetail').then((m) => ({ default: m.SessionDetailScreen })),
);
const SettingsScreen = lazy(() => import('../screens/Settings').then((m) => ({ default: m.SettingsScreen })));

export { WelcomeScreen } from '../screens/Welcome';

const SKELETON_AFTER_MS = 300;

/** Replaces the current history entry before paint, so a redirected route never flashes. */
function Redirect({ to }: { to: string }) {
  useLayoutEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

/**
 * The store trails the database by a moment, so "no active session" in the store is not proof.
 * Confirm with a direct read before sending #/live back to Start.
 */
function LiveGuard() {
  const activeSession = useAppStore((s) => s.activeSession);
  const [inDb, setInDb] = useState<boolean | null>(null);

  useEffect(() => {
    if (activeSession) return;
    let live = true;
    void findActiveSession().then((found) => live && setInDb(found !== undefined));
    return () => {
      live = false;
    };
  }, [activeSession]);

  if (activeSession || inDb) return <LiveScreen />;
  return inDb === false ? <Redirect to="#/" /> : null;
}

function Screen({ route }: { route: Route }) {
  const onboardedAt = useAppStore((s) => s.settings.onboardedAt);
  const activeSession = useAppStore((s) => s.activeSession);
  const activeContraction = useAppStore((s) => s.activeContraction);

  switch (route.name) {
    case 'start': {
      const landing = decideLanding({ onboardedAt, activeSession, activeContraction });
      if (landing === 'welcome') return <WelcomeScreen />;
      if (landing === 'live') return <Redirect to="#/live" />;
      return <StartScreen />;
    }
    case 'live':
      return <LiveGuard />;
    case 'history':
      return <HistoryScreen />;
    case 'session':
      return <SessionDetailScreen id={route.params.id ?? ''} />;
    case 'compare':
      return <CompareScreen ids={(route.query.get('ids') ?? '').split(',').filter(Boolean)} />;
    case 'settings':
      return <SettingsScreen />;
  }
}

function Shell() {
  const route = useRoute();
  const ready = useAppStore((s) => s.ready);
  const failed = useBootStore((s) => s.failed);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (ready || failed) return;
    const t = setTimeout(() => setSlow(true), SKELETON_AFTER_MS);
    return () => clearTimeout(t);
  }, [ready, failed]);

  if (failed && !ready) return <BootFailed />;
  // Before 300 ms the page is just the Dusk background (set on <html>), never white.
  if (!ready) return slow ? <Skeleton /> : null;
  return (
    <Suspense fallback={<Skeleton />}>
      <Screen route={route} />
    </Suspense>
  );
}

export function App() {
  useApplyTheme();
  useAppWakeLock();
  return (
    <>
      <Shell />
      <ToastHost />
    </>
  );
}
