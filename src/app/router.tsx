import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

export type RouteName = 'start' | 'live' | 'history' | 'session' | 'compare' | 'settings';

export interface Route {
  name: RouteName;
  params: { id?: string };
  query: URLSearchParams;
  /** Normalised path without the leading '#' or the query, e.g. '/session/abc'. */
  path: string;
}

const SIMPLE: Record<string, RouteName> = {
  '/': 'start',
  '/start': 'start',
  '/live': 'live',
  '/history': 'history',
  '/compare': 'compare',
  '/settings': 'settings',
};

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const qi = raw.indexOf('?');
  const pathPart = qi === -1 ? raw : raw.slice(0, qi);
  const query = new URLSearchParams(qi === -1 ? '' : raw.slice(qi + 1));
  const path = pathPart === '' ? '/' : pathPart;

  const session = /^\/session\/([^/]+)$/.exec(path);
  if (session?.[1]) {
    return { name: 'session', params: { id: decodeURIComponent(session[1]) }, query, path };
  }
  const name = SIMPLE[path];
  if (name) return { name, params: {}, query, path };
  return { name: 'start', params: {}, query, path: '/' };
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
  };
}

const getSnapshot = () => window.location.hash;

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getSnapshot);
  return parseHash(hash);
}

/** `to` looks like '#/session/abc'. Marks the history entry so goBack knows it is in-app. */
export function navigate(to: string, opts?: { replace?: boolean }): void {
  const state = opts?.replace ? window.history.state : { ebb: true };
  if (opts?.replace) window.history.replaceState(state, '', to);
  else window.history.pushState(state, '', to);
  emit();
}

export function goBack(fallback: string): void {
  const state = window.history.state as { ebb?: boolean } | null;
  if (state?.ebb) window.history.back();
  else navigate(fallback);
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string };

export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a {...rest} href={to} onClick={handle}>
      {children}
    </a>
  );
}
