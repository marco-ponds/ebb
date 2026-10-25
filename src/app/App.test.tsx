import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showToast, useToastStore } from '../components';
import { startContraction } from '../db/contractions';
import { startSession } from '../db/sessions';
import { updateSettings } from '../db/settings';
import { dropDb, freshDb } from '../db/testDb';
import { initStore, teardownStore, useAppStore } from '../state/store';
import { App } from './App';
import { markBootFailed, resetBoot } from './boot';
import { navigate } from './router';

const h1 = () => screen.getByRole('heading', { level: 1 });

async function boot(onboarded = true) {
  if (onboarded) await updateSettings({ onboardedAt: 1 });
  await initStore();
}

beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  resetBoot();
  await freshDb();
});
afterEach(async () => {
  vi.useRealTimers();
  useToastStore.setState({ toast: null });
  teardownStore();
  await dropDb();
});

describe('App routing and landing guard', () => {
  it('renders Welcome at #/ while onboardedAt is null', async () => {
    await boot(false);
    render(<App />);
    expect(h1()).toHaveTextContent('ebb');
    expect(screen.getByRole('button', { name: 'Get started' })).toBeInTheDocument();
  });

  it('renders Start at #/ once onboarded and idle', async () => {
    await boot();
    render(<App />);
    expect(h1()).toHaveTextContent("Whenever you're ready.");
  });

  it('redirects #/ to #/live (replace) while a session is active', async () => {
    await startSession(1000);
    await boot();
    const before = window.history.length;
    render(<App />);
    expect(window.location.hash).toBe('#/live');
    expect(window.history.length).toBe(before);
  });

  it('lands on Live for an open contraction too', async () => {
    const s = await startSession(1000);
    await startContraction(s.id, 2000);
    await boot();
    render(<App />);
    expect(window.location.hash).toBe('#/live');
  });

  it('redirects #/live to #/ when no session is active', async () => {
    window.history.replaceState(null, '', '#/live');
    await boot();
    render(<App />);
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(h1()).toHaveTextContent("Whenever you're ready.");
  });

  it('does not bounce #/live while the store lags a session already in the database', async () => {
    await startSession(1000);
    await updateSettings({ onboardedAt: 1 });
    // Store is "ready" but has not caught up with the committed write.
    useAppStore.setState({ ready: true, activeSession: null, settings: { ...useAppStore.getState().settings, onboardedAt: 1 } });
    window.history.replaceState(null, '', '#/live');
    render(<App />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(window.location.hash).toBe('#/live');
  });

  it('leaves other routes alone', async () => {
    await boot();
    window.history.replaceState(null, '', '#/history');
    render(<App />);
    expect(window.location.hash).toBe('#/history');
    act(() => navigate('#/settings'));
    expect(window.location.hash).toBe('#/settings');
  });

  it('follows a session that starts while open: #/ moves on to Live', async () => {
    await boot();
    render(<App />);
    await act(async () => void (await startSession(5000)));
    expect(window.location.hash).toBe('#/live');
  });

  it('mounts the toast host once', async () => {
    await boot();
    render(<App />);
    act(() => showToast({ message: 'Hello there' }));
    expect(screen.getAllByText('Hello there')).toHaveLength(1);
  });

  it('applies the theme from settings', async () => {
    await updateSettings({ theme: 'day' });
    await boot();
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('day');
  });
});

describe('App before the store is ready', () => {
  beforeEach(() => {
    teardownStore(); // ready: false, as while initStore() is still reading
  });

  it('shows nothing but the background for the first 300 ms, then the skeleton', () => {
    vi.useFakeTimers();
    const { container } = render(<App />);
    act(() => void vi.advanceTimersByTime(299));
    expect(container.querySelector('[data-skeleton="button"]')).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(container.querySelector('[data-skeleton="button"]')).not.toBeNull();
    expect(container).not.toHaveTextContent(/\S/); // no text, no spinner
  });

  it('swaps the skeleton for the screen when the store becomes ready', () => {
    vi.useFakeTimers();
    useAppStore.setState({ settings: { ...useAppStore.getState().settings, onboardedAt: 1 } });
    const { container } = render(<App />);
    act(() => void vi.advanceTimersByTime(400));
    expect(container.querySelector('[data-skeleton="button"]')).not.toBeNull();
    act(() => useAppStore.setState({ ready: true }));
    expect(container.querySelector('[data-skeleton="button"]')).toBeNull();
  });

  it('shows a quiet card instead of an endless skeleton when the store failed to start', () => {
    render(<App />);
    act(() => markBootFailed());
    const card = screen.getByText("Ebb couldn't open its storage. Close and reopen the app.");
    expect(card.textContent).not.toMatch(/!/);
  });
});
