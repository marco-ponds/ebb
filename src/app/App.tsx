import { useEffect, useLayoutEffect, useState } from 'react';
import { Skeleton, ToastHost } from '../components';
import { CompareScreen } from '../screens/Compare';
import { HistoryScreen } from '../screens/History';
import { LiveScreen } from '../screens/Live';
import { SessionDetailScreen } from '../screens/SessionDetail';
import { SettingsScreen } from '../screens/Settings';
import { StartScreen } from '../screens/Start';
import { WelcomeScreen } from '../screens/Welcome';
import { useAppStore } from '../state/store';
import { BootFailed } from './BootFailed';
import { useBootStore } from './boot';
import { decideLanding } from './landing';
import { navigate, useRoute, type Route } from './router';
import { useApplyTheme } from './theme';

export { WelcomeScreen } from '../screens/Welcome';

const SKELETON_AFTER_MS = 300;

/** Replaces the current history entry before paint, so a redirected route never flashes. */
function Redirect({ to }: { to: string }) {
  useLayoutEffect(() => navigate(to, { replace: true }), [to]);
  return null;
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
      return activeSession ? <LiveScreen /> : <Redirect to="#/" />;
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
  return <Screen route={route} />;
}

export function App() {
  useApplyTheme();
  return (
    <>
      <Shell />
      <ToastHost />
    </>
  );
}
