/**
 * TTL cache with LRU eviction and in-flight request coalescing.
 *
 * Coalescing matters more than it looks: when a TV boots, the home screen fires
 * a dozen catalogue requests at once and several of them want the same genre
 * list. Without this they would all hit TMDB.
 */
export class TtlCache {
  #map = new Map();
  #inflight = new Map();
  #max;

  constructor({ max = 2000 } = {}) {
    this.#max = max;
  }

  get(key) {
    const entry = this.#map.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.#map.delete(key);
      return undefined;
    }
    // Refresh recency for LRU.
    this.#map.delete(key);
    this.#map.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (this.#map.has(key)) this.#map.delete(key);
    this.#map.set(key, { value, expires: Date.now() + ttlMs });
    while (this.#map.size > this.#max) {
      const oldest = this.#map.keys().next().value;
      this.#map.delete(oldest);
    }
  }

  /** Get from cache, otherwise run `producer` — deduplicating concurrent calls. */
  async wrap(key, ttlMs, producer) {
    const hit = this.get(key);
    if (hit !== undefined) return hit;

    const pending = this.#inflight.get(key);
    if (pending) return pending;

    const promise = (async () => {
      try {
        const value = await producer();
        if (value !== undefined) this.set(key, value, ttlMs);
        return value;
      } finally {
        this.#inflight.delete(key);
      }
    })();

    this.#inflight.set(key, promise);
    return promise;
  }

  delete(key) {
    this.#map.delete(key);
  }

  clear() {
    this.#map.clear();
  }

  get size() {
    return this.#map.size;
  }
}
