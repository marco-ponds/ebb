import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { navigate } from './router';

describe('App routing', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));

  it.each([
    ['', 'Start'],
    ['#/live', 'Live'],
    ['#/history', 'History'],
    ['#/settings', 'Settings'],
    ['#/session/abc', 'Session'],
    ['#/compare?ids=a,b', 'Compare'],
    ['#/unknown', 'Start'],
  ])('renders %j as the %s screen', (hash, title) => {
    window.history.replaceState(null, '', hash || '/');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
  });

  it('switches screen when the route changes', () => {
    render(<App />);
    act(() => navigate('#/history'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('History');
  });
});
