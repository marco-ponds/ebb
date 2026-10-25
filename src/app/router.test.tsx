import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, goBack, navigate, parseHash, useRoute } from './router';

function setHash(hash: string) {
  window.history.replaceState(null, '', hash === '' ? '/' : hash);
}

describe('parseHash', () => {
  it.each([
    ['', 'start'],
    ['#', 'start'],
    ['#/', 'start'],
    ['#/start', 'start'],
    ['#/live', 'live'],
    ['#/history', 'history'],
    ['#/settings', 'settings'],
    ['#/nonsense', 'start'],
    ['#/session', 'start'],
  ])('maps %j to %s', (hash, name) => {
    expect(parseHash(hash).name).toBe(name);
  });

  it('extracts the session id', () => {
    const r = parseHash('#/session/abc-123');
    expect(r.name).toBe('session');
    expect(r.params.id).toBe('abc-123');
    expect(r.path).toBe('/session/abc-123');
  });

  it('parses the query string', () => {
    const r = parseHash('#/compare?ids=a,b');
    expect(r.name).toBe('compare');
    expect(r.query.get('ids')).toBe('a,b');
    expect(r.path).toBe('/compare');
  });
});

describe('navigate and useRoute', () => {
  beforeEach(() => setHash(''));

  it('starts on the start route for an empty hash', () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current.name).toBe('start');
  });

  it('updates subscribers when navigating', () => {
    const { result } = renderHook(() => useRoute());
    act(() => navigate('#/session/abc'));
    expect(result.current.name).toBe('session');
    expect(result.current.params.id).toBe('abc');
    expect(window.location.hash).toBe('#/session/abc');
  });

  it('replace does not add a history entry', () => {
    const before = window.history.length;
    const { result } = renderHook(() => useRoute());
    act(() => navigate('#/history', { replace: true }));
    expect(result.current.name).toBe('history');
    expect(window.history.length).toBe(before);
  });

  it('reacts to hashchange from outside', () => {
    const { result } = renderHook(() => useRoute());
    act(() => {
      window.location.hash = '#/settings';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.name).toBe('settings');
  });
});

describe('Link', () => {
  beforeEach(() => setHash(''));

  it('renders a real anchor and navigates on click', async () => {
    render(<Link to="#/history" className="x">History</Link>);
    const a = screen.getByRole('link', { name: 'History' });
    expect(a).toHaveAttribute('href', '#/history');
    expect(a).toHaveClass('x');
    await userEvent.click(a);
    expect(window.location.hash).toBe('#/history');
  });
});

describe('goBack', () => {
  beforeEach(() => setHash(''));

  it('goes to the fallback when there is no in-app entry', () => {
    const back = vi.spyOn(window.history, 'back');
    goBack('#/history');
    expect(back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/history');
    back.mockRestore();
  });

  it('uses history.back when an in-app entry exists', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    navigate('#/live');
    goBack('#/history');
    expect(back).toHaveBeenCalledOnce();
    back.mockRestore();
  });
});

describe('parseHash with a malformed hash', () => {
  it('treats an undecodable session id as the start route instead of throwing', () => {
    expect(parseHash('#/session/%E0%A4%A').name).toBe('start');
  });
});
