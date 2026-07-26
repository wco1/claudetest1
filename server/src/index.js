import path from 'node:path';
import { config, hasMetadata } from './config.js';
import { createApp } from './app.js';
import { createLogger } from './lib/logger.js';
import { JsonStore } from './lib/store.js';
import { LocalLibrary } from './sources/local.js';
import { sources } from './sources/registry.js';

const log = createLogger('boot');

const users = new JsonStore(path.join(config.dataDir, 'users.json'), {
  profiles: {},
  progress: {},
  watchlist: {},
  watchlistCards: {},
});

const library = new LocalLibrary();
sources.register(library);

const app = createApp({ users, library });

const server = app.listen(config.port, config.host, () => {
  log.info(`Kinoteka listening on http://${config.host}:${config.port}`);
  if (!hasMetadata()) {
    log.warn('TMDB_API_KEY is not set — the catalogue will be empty.');
    log.warn('Get a free key at https://www.themoviedb.org/settings/api and put it in .env');
  }
  if (!config.library.roots.length) {
    log.warn('MEDIA_ROOTS is not set — no local files will be playable.');
  }
  if (!config.auth.accessCode) {
    log.warn('ACCESS_CODE is empty — the site is open to anyone who can reach it.');
  }
});

// Streams on slow TVs can idle; the defaults would cut a paused film loose.
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;
server.requestTimeout = 0;

// Index the library after the port is open so the UI is reachable immediately.
setTimeout(() => {
  library.scan().catch((err) => log.error('initial scan failed:', err.message));
}, 1000).unref();

if (config.library.scanIntervalMin > 0) {
  setInterval(
    () => library.scan().catch((err) => log.error('scheduled scan failed:', err.message)),
    config.library.scanIntervalMin * 60 * 1000,
  ).unref();
}

async function shutdown(signal) {
  log.info(`${signal} received, shutting down`);
  server.close();
  await users.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
