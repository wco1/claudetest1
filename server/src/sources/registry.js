import { createLogger } from '../lib/logger.js';

const log = createLogger('sources');

/**
 * A source provider knows how to turn a catalogue title into something you can
 * actually play, and how to stream the bytes.
 *
 * Providers shipped with Kinoteka only serve media that belongs to you: files on
 * a disk you own (`local`) or on remote storage you control (`remote`). The
 * interface is deliberately small so you can add a provider for any service you
 * hold a licence or an API contract with — see docs/SOURCES.md.
 *
 * Required shape:
 *
 *   id            string   unique, stable, url-safe
 *   name          string   shown in the UI
 *   listTitles()  -> Array<LibraryTitle>            (optional; library providers)
 *   getSources(titleId, { season, episode })
 *                 -> Array<Source>
 *   openStream(sourceId, { range })
 *                 -> { stream, size, start, end, mimeType, filename, totalSize }
 *   refresh()     -> void                            (optional)
 */
class SourceRegistry {
  #providers = new Map();

  register(provider) {
    if (!provider?.id) throw new Error('source provider needs an id');
    for (const method of ['getSources', 'openStream']) {
      if (typeof provider[method] !== 'function') {
        throw new Error(`source provider "${provider.id}" is missing ${method}()`);
      }
    }
    this.#providers.set(provider.id, provider);
    log.info(`registered source provider "${provider.id}" (${provider.name})`);
  }

  get(id) {
    return this.#providers.get(id);
  }

  list() {
    return [...this.#providers.values()];
  }

  /** Everything playable for a title, best quality first. */
  async getSources(titleId, options = {}) {
    const results = await Promise.all(
      this.list().map(async (provider) => {
        try {
          return (await provider.getSources(titleId, options)) || [];
        } catch (err) {
          log.warn(`provider "${provider.id}" failed for ${titleId}:`, err.message);
          return [];
        }
      }),
    );
    return results.flat().sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  /** Union of every library provider's catalogue. */
  async listLibraryTitles() {
    const results = await Promise.all(
      this.list().map(async (provider) => {
        if (typeof provider.listTitles !== 'function') return [];
        try {
          return (await provider.listTitles()) || [];
        } catch (err) {
          log.warn(`provider "${provider.id}" listTitles failed:`, err.message);
          return [];
        }
      }),
    );
    return results.flat();
  }

  async refreshAll() {
    for (const provider of this.list()) {
      if (typeof provider.refresh === 'function') {
        try {
          await provider.refresh();
        } catch (err) {
          log.error(`provider "${provider.id}" refresh failed:`, err.message);
        }
      }
    }
  }
}

export const sources = new SourceRegistry();

export const MIME_BY_EXT = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.wmv': 'video/x-ms-wmv',
  '.srt': 'application/x-subrip',
  '.vtt': 'text/vtt',
  '.ass': 'text/x-ssa',
  '.ssa': 'text/x-ssa',
};

/**
 * Browsers and TVs disagree about containers. MP4/H.264 plays everywhere;
 * MKV plays on Android TV, Tizen and webOS but not in Safari on an iPad.
 */
export function directPlaySupport(ext, videoCodec) {
  const container = ext.toLowerCase();
  if (['.mp4', '.m4v', '.webm'].includes(container)) return 'universal';
  if (['.mkv', '.ts', '.m2ts'].includes(container)) {
    if (videoCodec && /hevc|h265/i.test(videoCodec)) return 'tv-only';
    return 'most';
  }
  return 'limited';
}
