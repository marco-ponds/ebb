import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetInstallPromptForTests, useInstallHint } from './installPrompt';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';

function mockStandalone(on: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: on && q === '(display-mode: standalone)',
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function installEvent() {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  e.prompt = vi.fn(() => Promise.resolve());
  e.userChoice = Promise.resolve({ outcome: 'accepted' });
  return e;
}

function secure(on: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value: on, configurable: true });
}

describe('useInstallHint', () => {
  beforeEach(() => {
    __resetInstallPromptForTests();
    mockStandalone(false);
    secure(true);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14) Chrome/120');
  });
  afterEach(() => vi.restoreAllMocks());

  it('is manual on a secure, non-iOS browser with no deferred prompt', () => {
    expect(renderHook(() => useInstallHint()).result.current).toEqual({ kind: 'manual' });
  });

  it('is insecure on plain http, where no prompt or service worker can exist', () => {
    secure(false);
    expect(renderHook(() => useInstallHint()).result.current).toEqual({ kind: 'insecure' });
  });

  it('is insecure rather than ios on an iPhone over plain http', () => {
    secure(false);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_UA);
    expect(renderHook(() => useInstallHint()).result.current.kind).toBe('insecure');
  });

  it('is none when standalone, even when insecure', () => {
    secure(false);
    mockStandalone(true);
    expect(renderHook(() => useInstallHint()).result.current.kind).toBe('none');
  });

  it('is ios on iPhone Safari outside standalone', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_UA);
    expect(renderHook(() => useInstallHint()).result.current.kind).toBe('ios');
  });

  it('is none when standalone, via display-mode', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_UA);
    mockStandalone(true);
    expect(renderHook(() => useInstallHint()).result.current.kind).toBe('none');
  });

  it('is none when navigator.standalone is true', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_UA);
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    expect(renderHook(() => useInstallHint()).result.current.kind).toBe('none');
    delete (navigator as unknown as Record<string, unknown>).standalone;
  });

  it('captures beforeinstallprompt, offers a prompt and calls the deferred event once', async () => {
    const { result } = renderHook(() => useInstallHint());
    const e = installEvent();
    act(() => void window.dispatchEvent(e));
    expect(e.defaultPrevented).toBe(true);
    expect(result.current.kind).toBe('prompt');
    await act(async () => {
      await result.current.prompt?.();
    });
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.kind).toBe('manual');
  });

  it('keeps an event that fired before the hook mounted', () => {
    window.dispatchEvent(installEvent());
    expect(renderHook(() => useInstallHint()).result.current.kind).toBe('prompt');
  });
});
