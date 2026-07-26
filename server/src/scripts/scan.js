#!/usr/bin/env node
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';
import { LocalLibrary } from '../sources/local.js';

const log = createLogger('scan');
const force = process.argv.includes('--force');

if (!config.library.roots.length) {
  log.error('MEDIA_ROOTS is empty — nothing to scan. Set it in .env first.');
  process.exit(1);
}

const library = new LocalLibrary();
const stats = await library.scan({ force });

log.info('---');
log.info(`titles: ${stats.titles}`);
log.info(`files:  ${stats.files}`);
log.info(`roots:  ${stats.roots.join(', ')}`);
process.exit(0);
