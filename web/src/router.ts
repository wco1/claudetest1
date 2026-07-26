import { useEffect, useState } from 'react';

export interface Route {
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
}

/**
 * Hash routing, deliberately.
 *
 * A television browser is often pointed at a plain file server or an app
 * container where history-API deep links 404 on refresh. Hashes always work, and
 * the TV Back button maps onto them for free.
 */
function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathname, search] = raw.split('?');
  return {
    path: pathname || '/',
    params: {},
    query: new URLSearchParams(search || ''),
  };
}

const listeners = new Set<(route: Route) => void>();
let currentRoute = parse();

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    currentRoute = parse();
    for (const listener of listeners) listener(currentRoute);
  });
}

export function navigate(path: string, { replace = false } = {}) {
  const target = path.startsWith('#') ? path : `#${path}`;
  if (location.hash === target) return;
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
  if (replace) {
    currentRoute = parse();
    for (const listener of listeners) listener(currentRoute);
  }
}

export function back() {
  if (history.length > 1) history.back();
  else navigate('/');
}

export function useRoute(): Route {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    listeners.add(setRoute);
    return () => {
      listeners.delete(setRoute);
    };
  }, []);
  return route;
}

/** Matches `/title/:id` style patterns; returns params or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const p = patternParts[i];
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (p !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

export const routes = {
  home: () => '/',
  browse: (type: 'movie' | 'tv') => `/browse/${type}`,
  title: (id: string) => `/title/${encodeURIComponent(id)}`,
  player: (id: string, params?: { source?: string; season?: number; episode?: number }) => {
    const search = new URLSearchParams();
    if (params?.source) search.set('source', params.source);
    if (params?.season != null) search.set('season', String(params.season));
    if (params?.episode != null) search.set('episode', String(params.episode));
    const q = search.toString();
    return `/watch/${encodeURIComponent(id)}${q ? `?${q}` : ''}`;
  },
  search: (q?: string) => (q ? `/search?q=${encodeURIComponent(q)}` : '/search'),
  library: () => '/library',
  watchlist: () => '/watchlist',
  settings: () => '/settings',
};
