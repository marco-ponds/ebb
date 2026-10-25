import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetInstallPromptForTests } from '../../app/installPrompt';
import { dropDb, freshDb } from '../../db/testDb';
import { getDb } from '../../db/schema';
import { initStore, teardownStore, useAppStore } from '../../state/store';
import { WelcomeScreen } from '.';

const SAFETY = "This app records contractions. It doesn't give medical advice — if you're worried, contact your midwife or maternity unit.";
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';

beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  __resetInstallPromptForTests();
  await freshDb();
  await initStore();
});
afterEach(async () => {
  vi.restoreAllMocks();
  teardownStore();
  await dropDb();
});

describe('WelcomeScreen', () => {
  it('shows the mark, the one-line promise and the safety line verbatim', () => {
    render(<WelcomeScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ebb');
    expect(screen.getByText('Time contractions with one tap. Everything stays on this phone.')).toBeInTheDocument();
    expect(screen.getByText(SAFETY)).toBeInTheDocument();
  });

  it('asks no threshold questions', () => {
    render(<WelcomeScreen />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('Get started requests durable storage, saves onboardedAt and heads to Start', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true });
    render(<WelcomeScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'Get started' }));
    await waitFor(() => expect(useAppStore.getState().settings.onboardedAt).not.toBeNull());
    expect(persist).toHaveBeenCalledTimes(1);
    expect((await getDb().settings.get('singleton'))?.onboardedAt).not.toBeNull();
    expect(window.location.hash).toBe('#/');
    delete (navigator as unknown as Record<string, unknown>).storage;
  });

  it('still gets started when the browser has no persist()', async () => {
    render(<WelcomeScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'Get started' }));
    await waitFor(() => expect(useAppStore.getState().settings.onboardedAt).not.toBeNull());
  });

  it('shows the iOS install hint on iPhone Safari', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_UA);
    render(<WelcomeScreen />);
    expect(screen.getByText('Tap Share, then Add to Home Screen.')).toBeInTheDocument();
  });

  it('shows an Install button that uses the deferred prompt, on Chromium', async () => {
    render(<WelcomeScreen />);
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(() => Promise.resolve()),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    act(() => void window.dispatchEvent(e));
    await userEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(e.prompt).toHaveBeenCalledTimes(1);
  });

  it('shows no install hint when running standalone', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_UA);
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    render(<WelcomeScreen />);
    expect(screen.queryByText(/Add to Home Screen/)).toBeNull();
    delete (navigator as unknown as Record<string, unknown>).standalone;
  });

  it('shows the quiet storage card only when storage is in memory', () => {
    const { rerender } = render(<WelcomeScreen />);
    const copy = "This browser won't keep your data. Open Ebb from your home screen instead.";
    expect(screen.queryByText(copy)).toBeNull();
    act(() => useAppStore.setState({ storage: { status: 'memory', pendingCount: 0, conflictCount: 0 } }));
    rerender(<WelcomeScreen />);
    expect(screen.getByText(copy)).toBeInTheDocument();
  });
});
