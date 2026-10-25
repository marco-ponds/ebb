// installPrompt first: beforeinstallprompt can fire before React mounts.
import './app/installPrompt';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './app/App';
import { markBootFailed } from './app/boot';
import { initSwUpdate } from './app/swUpdate';
import { initStore } from './state/store';

initSwUpdate(registerSW);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
// Render at once: App shows the dark background, then a skeleton after 300 ms, then the landing screen.
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

initStore()
  .catch((e) => {
    // Never leave a skeleton forever: App shows a quiet "couldn't open storage" card.
    console.error(e);
    markBootFailed();
  })
  .finally(() => {
    document.documentElement.dataset.dbReady = '1';
  });
