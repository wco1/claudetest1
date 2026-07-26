import type {
  AuthState, Card, Episode, HomePayload, Season, Source, TitleDetails,
} from './types';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

const TOKEN_KEY = 'kt.token';

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body) headers['Content-Type'] = 'application/json';

  // Some TV browsers drop cookies on LAN origins; the bearer copy covers it.
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path, { credentials: 'same-origin', ...init, headers });

  if (!response.ok) {
    let code = 'request_failed';
    let message = response.statusText;
    try {
      const body = await response.json();
      code = body.error || code;
      message = body.message || message;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
};

export const api = {
  health: () => request<{ ok: boolean; metadata: boolean; library: unknown }>('/api/health'),

  authState: () => request<AuthState>('/api/auth/state'),
  login: (payload: { code?: string; name?: string; profileId?: string }) =>
    request<{ ok: true; profile: AuthState['profile']; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  playbackToken: () => request<{ token: string }>('/api/auth/playback-token'),

  home: () => request<HomePayload>('/api/catalog/home'),
  genres: () => request<{ movie: { id: number; name: string }[]; tv: { id: number; name: string }[] }>(
    '/api/catalog/genres',
  ),
  browse: (params: {
    type?: string; genres?: string; sort?: string; page?: number; year?: number | string; lang?: string;
  }) =>
    request<{ page: number; totalPages: number; totalResults: number; results: Card[] }>(
      `/api/catalog/browse${qs(params)}`,
    ),
  search: (q: string, page = 1) =>
    request<{ page: number; totalPages: number; totalResults: number; results: Card[] }>(
      `/api/catalog/search${qs({ q, page })}`,
    ),
  library: () => request<{ titles: Card[]; stats: unknown }>('/api/catalog/library'),

  title: (id: string) => request<TitleDetails>(`/api/titles/${encodeURIComponent(id)}`),
  season: (id: string, season: number) =>
    request<Season & { episodes: Episode[] }>(`/api/titles/${encodeURIComponent(id)}/season/${season}`),

  sources: (id: string, params: { season?: number; episode?: number } = {}) =>
    request<{ sources: Source[] }>(`/api/playback/sources/${encodeURIComponent(id)}${qs(params)}`),

  saveProgress: (payload: {
    titleId: string; season?: number | null; episode?: number | null;
    position: number; duration: number; card?: Card;
  }) =>
    request<{ ok: true }>('/api/user/progress', { method: 'POST', body: JSON.stringify(payload) }),

  watchlist: () => request<{ items: Card[] }>('/api/user/watchlist'),
  toggleWatchlist: (titleId: string, card?: Card) =>
    request<{ ok: true; inWatchlist: boolean }>('/api/user/watchlist', {
      method: 'POST',
      body: JSON.stringify({ titleId, card }),
    }),
};

/** Artwork always goes through our own origin — one connection, hard caching. */
export function imageUrl(path: string | null | undefined, size: string): string | null {
  if (!path) return null;
  return `/api/img/${size}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** <video> cannot send headers, so playback URLs carry the token in the query. */
export function withToken(url: string): string {
  const token = readToken();
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`;
}
