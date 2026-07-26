import express from 'express';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('images');

// Only sizes TMDB actually serves; anything else would 404 upstream.
const ALLOWED = new Set([
  'w92', 'w154', 'w185', 'w300', 'w342', 'w500', 'w780', 'w1280',
  'h632', 'original',
]);

/**
 * Image proxy.
 *
 * Serving artwork from our own origin means one TLS handshake and one keep-alive
 * connection for the whole grid instead of a fresh connection per poster — the
 * single biggest win on a TV, where connection setup dominates.
 */
export function createImageRouter() {
  const router = express.Router();

  router.get('/:size/:path(*)', async (req, res) => {
    const { size } = req.params;
    const imagePath = req.params.path;

    if (!ALLOWED.has(size) || !/^[\w./-]+\.(jpg|jpeg|png|svg|webp)$/i.test(imagePath)) {
      return res.status(400).end();
    }

    const upstream = `${config.tmdb.imageBase}/${size}/${imagePath.replace(/^\/+/, '')}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const response = await fetch(upstream, { signal: controller.signal }).finally(() =>
        clearTimeout(timeout),
      );

      if (!response.ok || !response.body) return res.status(response.status).end();

      res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
      const length = response.headers.get('content-length');
      if (length) res.setHeader('Content-Length', length);
      // Artwork is immutable: TMDB paths are content-addressed.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      const reader = response.body.getReader();
      res.on('close', () => reader.cancel().catch(() => {}));
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      }
      res.end();
    } catch (err) {
      if (err.name !== 'AbortError') log.debug(`image proxy failed for ${imagePath}:`, err.message);
      if (!res.headersSent) res.status(502).end();
      else res.end();
    }
  });

  return router;
}
