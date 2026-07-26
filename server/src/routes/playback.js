import fsp from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { createLogger } from '../lib/logger.js';
import { sources } from '../sources/registry.js';
import { requireAuth } from './auth.js';

const log = createLogger('playback');

/** Convert SubRip to WebVTT so the browser <track> element can use it. */
function srtToVtt(text) {
  const body = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n|\r/g, '\n')
    // 00:00:01,500 --> 00:00:04,000
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${body}`;
}

export function createPlaybackRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/sources/:id', async (req, res, next) => {
    try {
      const { season, episode } = req.query;
      const available = await sources.getSources(req.params.id, {
        season: season != null && season !== '' ? Number(season) : undefined,
        episode: episode != null && episode !== '' ? Number(episode) : undefined,
      });
      res.json({ sources: available });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Byte-range streaming.
   *
   * Set-top browsers are fussy: they expect `Accept-Ranges`, an exact
   * `Content-Range`, and they will re-request ranges aggressively while seeking.
   * Getting this wrong shows up as a spinner that never ends on a TV while
   * working perfectly on a laptop.
   */
  async function serve(req, res, { asAttachment }) {
    const provider = sources.get(req.params.provider);
    if (!provider) return res.status(404).json({ error: 'unknown_provider' });

    let opened;
    try {
      opened = await provider.openStream(req.params.sourceId, { range: req.headers.range });
    } catch (err) {
      log.error('openStream failed:', err.message);
      return res.status(500).json({ error: 'stream_failed' });
    }
    if (!opened) return res.status(404).json({ error: 'source_not_found' });

    if (opened.unsatisfiable) {
      res.setHeader('Content-Range', `bytes */${opened.totalSize}`);
      return res.status(416).end();
    }

    const { stream, start, end, size, totalSize, mimeType, filename, partial, lastModified } = opened;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'private, max-age=0, no-transform');
    if (lastModified) res.setHeader('Last-Modified', new Date(lastModified).toUTCString());

    if (asAttachment) {
      const safe = filename.replace(/["\\]/g, '');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safe.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
      );
    } else {
      res.setHeader('Content-Disposition', 'inline');
    }

    if (partial) {
      res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
    } else {
      res.status(200);
    }

    if (req.method === 'HEAD') {
      stream.destroy();
      return res.end();
    }

    // A viewer seeking rapidly aborts requests constantly; that is normal and
    // must not be logged as an error or leak file descriptors.
    const cleanup = () => stream.destroy();
    res.on('close', cleanup);
    stream.on('error', (err) => {
      if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE') log.warn('stream error:', err.message);
      res.destroy();
    });

    return stream.pipe(res);
  }

  router.get('/stream/:provider/:sourceId', (req, res) => serve(req, res, { asAttachment: false }));
  router.head('/stream/:provider/:sourceId', (req, res) => serve(req, res, { asAttachment: false }));
  router.get('/download/:provider/:sourceId', (req, res) => serve(req, res, { asAttachment: true }));

  router.get('/subtitle/:provider/:sourceId/:subtitleId', async (req, res, next) => {
    const provider = sources.get(req.params.provider);
    if (!provider?.getSidecar) return res.status(404).json({ error: 'not_found' });

    const sub = provider.getSidecar(req.params.sourceId, req.params.subtitleId);
    if (!sub) return res.status(404).json({ error: 'not_found' });

    try {
      const raw = await fsp.readFile(sub.path, 'utf8');
      const ext = path.extname(sub.path).toLowerCase();
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(ext === '.vtt' ? raw : srtToVtt(raw));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
