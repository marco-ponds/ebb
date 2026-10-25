import { useRoute } from './router';
import { CompareScreen } from '../screens/Compare';
import { HistoryScreen } from '../screens/History';
import { LiveScreen } from '../screens/Live';
import { SessionDetailScreen } from '../screens/SessionDetail';
import { SettingsScreen } from '../screens/Settings';
import { StartScreen } from '../screens/Start';

export { WelcomeScreen } from '../screens/Welcome';

export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'live':
      return <LiveScreen />;
    case 'history':
      return <HistoryScreen />;
    case 'session':
      return <SessionDetailScreen id={route.params.id ?? ''} />;
    case 'compare':
      return <CompareScreen ids={(route.query.get('ids') ?? '').split(',').filter(Boolean)} />;
    case 'settings':
      return <SettingsScreen />;
    case 'start':
      return <StartScreen />;
  }
}
