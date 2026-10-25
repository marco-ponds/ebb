import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './app/App';
import { initStore } from './state/store';

registerSW({ immediate: true });

async function boot() {
  try {
    await initStore();
  } catch (e) {
    // Never leave a blank page: render anyway so the shell can say what happened.
    console.error(e);
  } finally {
    document.documentElement.dataset.dbReady = '1';
  }
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root');
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
