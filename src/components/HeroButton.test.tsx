import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeroButton } from '.';
import { GLOW_FADE_MS } from './HeroButton/HeroButton';

function reducedMotion(on: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches: on,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('HeroButton', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is a real button named by ariaLabel and calls onPress', async () => {
    const onPress = vi.fn();
    render(
      <HeroButton tone="lavender" shape="rounded" onPress={onPress} ariaLabel="Start contraction. 3 minutes 42 seconds since the last one started">
        Tap when it starts
      </HeroButton>,
    );
    const b = screen.getByRole('button', { name: /^Start contraction/ });
    expect(b.tagName).toBe('BUTTON');
    await userEvent.click(b);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes tone and shape, and renders two halo rings', () => {
    render(
      <HeroButton tone="peach" shape="circle" onPress={() => {}} ariaLabel="x">
        1:14
      </HeroButton>,
    );
    const b = screen.getByRole('button');
    expect(b).toHaveAttribute('data-tone', 'peach');
    expect(b).toHaveAttribute('data-shape', 'circle');
    expect(b.querySelectorAll('[data-halo]')).toHaveLength(2);
  });

  it('renders the glow only when glow is on and motion is not reduced', () => {
    reducedMotion(false);
    const { rerender } = render(<HeroButton tone="lavender" shape="rounded" onPress={() => {}} ariaLabel="x" glow>a</HeroButton>);
    expect(screen.getByRole('button').querySelector('[data-glow]')).not.toBeNull();
    rerender(<HeroButton tone="lavender" shape="rounded" onPress={() => {}} ariaLabel="x">a</HeroButton>);
    expect(screen.getByRole('button').querySelector('[data-glow]')).toBeNull();
  });

  it('fades the glow out for one crossfade when the contraction ends, then unmounts it', () => {
    vi.useFakeTimers();
    try {
      reducedMotion(false);
      const props = { tone: 'peach', shape: 'circle', onPress: () => {}, ariaLabel: 'x' } as const;
      const btn = () => screen.getByRole('button');
      const { rerender } = render(<HeroButton {...props} glow>a</HeroButton>);
      expect(btn().querySelector('[data-glow-leaving]')).toBeNull();
      rerender(<HeroButton {...props}>a</HeroButton>);
      const layer = btn().querySelector('[data-glow-leaving="true"]');
      expect(layer).not.toBeNull();
      expect(btn().querySelector('[data-glow]')).toBeNull();
      act(() => void vi.advanceTimersByTime(GLOW_FADE_MS - 1));
      expect(btn().querySelector('[data-glow-leaving]')).not.toBeNull();
      act(() => void vi.advanceTimersByTime(1));
      expect(btn().querySelector('[data-glow-leaving]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts a fresh glow if a contraction begins while the old one is fading', () => {
    vi.useFakeTimers();
    try {
      reducedMotion(false);
      const props = { tone: 'peach', shape: 'circle', onPress: () => {}, ariaLabel: 'x' } as const;
      const { rerender } = render(<HeroButton {...props} glow glowTiming={{ inSeconds: 6, outSeconds: 3 }}>a</HeroButton>);
      rerender(<HeroButton {...props}>a</HeroButton>);
      rerender(<HeroButton {...props} glow glowTiming={{ inSeconds: 3, outSeconds: 8 }}>a</HeroButton>);
      const g = screen.getByRole('button').querySelector('[data-glow]') as HTMLElement;
      expect(g.style.animationName).toBe('breathe-3-8');
      expect(screen.getByRole('button').querySelector('[data-glow-leaving]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('omits the glow under reduced motion', () => {
    reducedMotion(true);
    render(<HeroButton tone="lavender" shape="rounded" onPress={() => {}} ariaLabel="x" glow>a</HeroButton>);
    expect(screen.getByRole('button').querySelector('[data-glow]')).toBeNull();
  });

  it('pauses the glow animation while the document is hidden', () => {
    reducedMotion(false);
    render(<HeroButton tone="lavender" shape="rounded" onPress={() => {}} ariaLabel="x" glow>a</HeroButton>);
    const glow = () => screen.getByRole('button').querySelector('[data-glow]') as HTMLElement;
    expect(glow().style.animationPlayState).toBe('running');
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      fireEvent(document, new Event('visibilitychange'));
    });
    expect(glow().style.animationPlayState).toBe('paused');
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      fireEvent(document, new Event('visibilitychange'));
    });
  });

  it('snapshots the glow timing at mount and picks up a new one on the next mount', () => {
    reducedMotion(false);
    const props = { tone: 'peach', shape: 'circle', onPress: () => {}, ariaLabel: 'x' } as const;
    const glow = () => screen.getByRole('button').querySelector('[data-glow]') as HTMLElement;
    const { rerender } = render(<HeroButton {...props} glow glowTiming={{ inSeconds: 6, outSeconds: 3 }}>a</HeroButton>);
    expect(glow().style.animationName).toBe('breathe-6-3');
    expect(glow().style.animationDuration).toBe('9s');
    rerender(<HeroButton {...props} glow glowTiming={{ inSeconds: 3, outSeconds: 8 }}>a</HeroButton>);
    expect(glow().style.animationName).toBe('breathe-6-3');
    expect(glow().style.animationDuration).toBe('9s');
    rerender(<HeroButton {...props} glowTiming={{ inSeconds: 3, outSeconds: 8 }}>a</HeroButton>);
    rerender(<HeroButton {...props} glow glowTiming={{ inSeconds: 3, outSeconds: 8 }}>a</HeroButton>);
    expect(glow().style.animationName).toBe('breathe-3-8');
    expect(glow().style.animationDuration).toBe('11s');
  });

  it('defaults the glow to 4 s in and 4 s out', () => {
    reducedMotion(false);
    render(<HeroButton tone="peach" shape="circle" onPress={() => {}} ariaLabel="x" glow>a</HeroButton>);
    const g = screen.getByRole('button').querySelector('[data-glow]') as HTMLElement;
    expect(g.style.animationName).toBe('breathe-4-4');
    expect(g.style.animationDuration).toBe('8s');
  });

  it('dims when asked', () => {
    render(<HeroButton tone="lavender" shape="rounded" onPress={() => {}} ariaLabel="x" dimmed>a</HeroButton>);
    expect(screen.getByRole('button')).toHaveAttribute('data-dimmed', 'true');
  });
});
