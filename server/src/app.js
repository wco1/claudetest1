import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config, hasMetadata } from './config.js';
import { createLogger } from './lib/logger.js';
import { createAuthMiddleware, createAuthRouter } from './routes/auth.js';
import { createCatalogRouter } from './routes/catalog.js';
import { createImageRouter } from './routes/images.js';
import { createPlaybackRouter } from './routes/playback.js';
import { createTitlesRouter } from './routes/titles.js';
import { createUserRouter } from './routes/user.js';
import { sources } from './sources/registry.js';

const log = createLogger('http');

export function createApp({ users, library }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', true);

  app.use(express.json({ limit: '256kb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // Request logging, minus the noise of range requests during playback.
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/playback/stream') || req.path.startsWith('/api/img')) return next();
    const started = Date.now();
    res.on('finish', () => {
      log.debug(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
  });

  app.use(createAuthMiddleware({ users }));

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      metadata: hasMetadata(),
      library: library?.stats ?? null,
      providers: sources.list().map((p) => ({ id: p.id, name: p.name })),
      version: '1.0.0',
    });
  });

  app.use('/api/auth', createAuthRouter({ users }));
  app.use('/api/catalog', createCatalogRouter({ users, library }));
  app.use('/api/titles', createTitlesRouter({ users, library }));
  app.use('/api/playback', createPlaybackRouter());
  app.use('/api/user', createUserRouter({ users }));
  app.use('/api/img', createImageRouter());

  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

  // --- Web client ----------------------------------------------------------
  if (fs.existsSync(config.webDist)) {
    app.use(
      express.static(config.webDist, {
        index: false,
        setHeaders(res, filePath) {
          // Vite emits content-hashed asset names, so they can be cached hard.
          if (/\/assets\//.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(config.webDist, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => {
      res
        .status(503)
        .type('html')
        .send(
          '<h1>Kinoteka</h1><p>Клиент не собран. Выполните <code>npm run build</code> в корне проекта.</p>',
        );
    });
  }

  // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
  app.use((err, req, res, next) => {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) log.error(`${req.method} ${req.originalUrl}:`, err.message);
    if (res.headersSent) return res.destroy();
    res.status(status).json({ error: err.code || 'server_error', message: err.message });
  });

  return app;
}
