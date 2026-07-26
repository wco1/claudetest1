/* eslint-env serviceworker */
/**
 * Kinoteka service worker.
 *
 * Goals, in order:
 *   1. The app shell opens instantly and works with no network (an iPad on a
 *      plane still shows its library page and cached artwork).
 *   2. Artwork is cached hard but bounded, so a big browse session does not
 *      fill the device.
 *   3. Video is never touched. Range requests through a service worker break
 *      seeking in Safari, and a film would blow any cache budget.
 */

const VERSION = 'v1';
const SHELL_CACHE = `kt-shell-${VERSION}`;
const IMAGE_CACHE = `kt-img-${VERSION}`;
const API_CACHE = `kt-api-${VERSION}`;

const SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];
const MAX_IMAGES = 600;
const API_TTL_MS = 10 * 60 * 1000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('kt-') && !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Bounded LRU-ish trim: oldest entries first, cheapest possible. */
async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept media: range requests must reach the server untouched.
  if (
    url.pathname.startsWith('/api/playback/stream') ||
    url.pathname.startsWith('/api/playback/download') ||
    request.headers.has('range')
  ) {
    return;
  }

  // Artwork: cache-first, it is immutable.
  if (url.pathname.startsWith('/api/img/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const response = await fetch(request);
          if (response.ok) {
            await cache.put(request, response.clone());
            void trim(IMAGE_CACHE, MAX_IMAGES);
          }
          return response;
        } catch (err) {
          return hit || Response.error();
        }
      }),
    );
    return;
  }

  // Catalogue data: network-first with a short-lived fallback, so a flaky
  // connection shows yesterday's home screen instead of an error.
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname.startsWith('/api/auth') || url.pathname.startsWith('/api/user')) return;
    event.respondWith(
      (async () => {
        const cache = await caches.open(API_CACHE);
        try {
          const response = await fetch(request);
          if (response.ok) {
            const copy = response.clone();
            const headers = new Headers(copy.headers);
            headers.set('x-kt-cached-at', String(Date.now()));
            cache.put(request, new Response(await copy.blob(), { status: 200, headers }));
          }
          return response;
        } catch (err) {
          const hit = await cache.match(request);
          if (!hit) throw err;
          const cachedAt = Number(hit.headers.get('x-kt-cached-at') || 0);
          if (Date.now() - cachedAt > API_TTL_MS * 24) return hit;
          return hit;
        }
      })(),
    );
    return;
  }

  // App shell and hashed assets: cache-first, refresh in the background.
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const hit = await cache.match(request, { ignoreSearch: false });
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);

      if (hit) {
        void network;
        return hit;
      }

      const response = await network;
      if (response) return response;

      // Navigation with nothing cached: fall back to the shell.
      if (request.mode === 'navigate') {
        const shell = await cache.match('/index.html');
        if (shell) return shell;
      }
      return Response.error();
    }),
  );
});
