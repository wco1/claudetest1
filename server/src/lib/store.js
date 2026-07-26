import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from './logger.js';

const log = createLogger('store');

/**
 * Tiny JSON document store with debounced atomic writes.
 *
 * A personal cinema for you and a handful of friends does not need a database
 * engine; it needs something that never corrupts on power loss and never blocks
 * a 4K stream. Writes go to a temp file and are renamed into place, which is
 * atomic on every POSIX filesystem.
 */
export class JsonStore {
  #file;
  #data;
  #timer = null;
  #writing = null;
  #dirty = false;

  constructor(file, initial = {}) {
    this.#file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.#data = this.#load(initial);
  }

  #load(initial) {
    try {
      if (fs.existsSync(this.#file)) {
        return { ...initial, ...JSON.parse(fs.readFileSync(this.#file, 'utf8')) };
      }
    } catch (err) {
      log.error(`corrupt store ${path.basename(this.#file)}, starting fresh:`, err.message);
      try {
        fs.renameSync(this.#file, `${this.#file}.corrupt-${Date.now()}`);
      } catch {
        /* best effort */
      }
    }
    return { ...initial };
  }

  get data() {
    return this.#data;
  }

  /** Mutate the document and schedule a flush. */
  update(mutator) {
    const result = mutator(this.#data);
    this.touch();
    return result;
  }

  touch() {
    this.#dirty = true;
    if (this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.flush();
    }, 400);
    this.#timer.unref?.();
  }

  async flush() {
    if (this.#writing) {
      await this.#writing;
      if (!this.#dirty) return;
    }
    if (!this.#dirty) return;
    this.#dirty = false;
    const snapshot = JSON.stringify(this.#data);
    const tmp = `${this.#file}.${process.pid}.tmp`;
    this.#writing = (async () => {
      try {
        await fsp.writeFile(tmp, snapshot, 'utf8');
        await fsp.rename(tmp, this.#file);
      } catch (err) {
        log.error(`failed to persist ${path.basename(this.#file)}:`, err.message);
        this.#dirty = true;
      } finally {
        this.#writing = null;
      }
    })();
    await this.#writing;
  }

  async close() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    await this.flush();
  }
}
