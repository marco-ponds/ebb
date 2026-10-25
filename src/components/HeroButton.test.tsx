import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeroButton } from '.';

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

  it('dims when asked', () => {
    render(<HeroButton tone="lavender" shape="rounded" onPress={() => {}} ariaLabel="x" dimmed>a</HeroButton>);
    expect(screen.getByRole('button')).toHaveAttribute('data-dimmed', 'true');
  });
});
