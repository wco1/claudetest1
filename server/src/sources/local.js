import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, hasMetadata } from '../config.js';
import { createLogger } from '../lib/logger.js';
import { JsonStore } from '../lib/store.js';
import { parseFilename, probeFile, qualityScore } from '../media/probe.js';
import { findByTitle, makeId } from '../metadata/tmdb.js';
import { MIME_BY_EXT, directPlaySupport } from './registry.js';

const log = createLogger('library');

const fileId = (absolutePath) =>
  crypto.createHash('sha1').update(absolutePath).digest('hex').slice(0, 16);

const normaliseTitle = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const LANGUAGE_LABELS = {
  ru: 'Русская', en: 'English', uk: 'Українська', ja: '日本語',
  fr: 'Français', de: 'Deutsch', es: 'Español', it: 'Italiano',
};

/**
 * The `local` provider: your own files, indexed and enriched with real
 * metadata, streamed straight to the player with byte-range support so seeking
 * on a TV is instant.
 */
export class LocalLibrary {
  id = 'local';
  name = 'Моя библиотека';
  kind = 'library';
  supportsDownload = true;

  #store;
  #roots;
  #scanning = false;
  /** absolutePath-hash -> file record */
  #files = new Map();
  /** titleId -> library title */
  #titles = new Map();

  constructor({ roots = config.library.roots, dataDir = config.dataDir } = {}) {
    this.#roots = roots;
    this.#store = new JsonStore(path.join(dataDir, 'library.json'), {
      files: {},
      matches: {},
      scannedAt: null,
    });
    this.#rebuildFromStore();
  }

  get isEmpty() {
    return this.#titles.size === 0;
  }

  get stats() {
    return {
      titles: this.#titles.size,
      files: this.#files.size,
      roots: this.#roots,
      scannedAt: this.#store.data.scannedAt,
      scanning: this.#scanning,
    };
  }

  // -------------------------------------------------------------------------
  // Scanning
  // -------------------------------------------------------------------------

  async #walk(dir, out = [], depth = 0) {
    if (depth > 8) return out;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err) {
      log.warn(`cannot read ${dir}: ${err.message}`);
      return out;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === '@eaDir') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.#walk(full, out, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (config.library.videoExtensions.includes(ext)) out.push(full);
      }
    }
    return out;
  }

  /** External subtitle files sitting next to the video. */
  async #findSidecarSubtitles(videoPath) {
    const dir = path.dirname(videoPath);
    const stem = path.basename(videoPath, path.extname(videoPath)).toLowerCase();
    let entries = [];
    try {
      entries = await fsp.readdir(dir);
    } catch {
      return [];
    }
    return entries
      .filter((name) => {
        const ext = path.extname(name).toLowerCase();
        if (!config.library.subtitleExtensions.includes(ext)) return false;
        return path.basename(name, ext).toLowerCase().startsWith(stem);
      })
      .map((name) => {
        const ext = path.extname(name).toLowerCase();
        const suffix = path.basename(name, ext).slice(stem.length).replace(/^[._-]+/, '');
        const langMatch = suffix.match(/\b(ru|rus|en|eng|uk|ukr|ja|jpn)\b/i);
        const raw = langMatch?.[1]?.toLowerCase();
        const language = raw ? { rus: 'ru', eng: 'en', ukr: 'uk', jpn: 'ja' }[raw] || raw : null;
        return {
          id: fileId(path.join(dir, name)),
          path: path.join(dir, name),
          language,
          label: suffix || (language ? LANGUAGE_LABELS[language] : 'Субтитры'),
          format: ext.slice(1),
          external: true,
        };
      });
  }

  async scan({ force = false } = {}) {
    if (this.#scanning) {
      log.info('scan already in progress');
      return this.stats;
    }
    if (!this.#roots.length) {
      log.info('no MEDIA_ROOTS configured — local library disabled');
      return this.stats;
    }

    this.#scanning = true;
    const started = Date.now();
    try {
      const found = [];
      for (const root of this.#roots) {
        if (!fs.existsSync(root)) {
          log.warn(`media root does not exist: ${root}`);
          continue;
        }
        await this.#walk(root, found);
      }
      log.info(`found ${found.length} video files in ${this.#roots.length} root(s)`);

      const known = this.#store.data.files;
      const next = {};
      let added = 0;
      let reused = 0;

      for (const absolutePath of found) {
        const id = fileId(absolutePath);
        let stat;
        try {
          stat = await fsp.stat(absolutePath);
        } catch {
          continue;
        }

        const previous = known[id];
        const unchanged =
          previous && previous.size === stat.size && previous.mtimeMs === stat.mtimeMs;
        if (unchanged && !force) {
          next[id] = previous;
          reused += 1;
          continue;
        }

        const parsed = parseFilename(absolutePath);
        const probed = await probeFile(absolutePath);
        const subtitles = await this.#findSidecarSubtitles(absolutePath);

        next[id] = {
          id,
          path: absolutePath,
          name: path.basename(absolutePath),
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          ext: path.extname(absolutePath).toLowerCase(),
          parsed,
          probe: probed,
          sidecarSubtitles: subtitles,
        };
        added += 1;
        if (added % 25 === 0) log.info(`indexed ${added} new files…`);
      }

      this.#store.update((data) => {
        data.files = next;
        data.scannedAt = new Date().toISOString();
      });
      await this.#store.flush();

      log.info(`indexed ${added} new / ${reused} unchanged files in ${Date.now() - started}ms`);

      await this.#matchMetadata();
      this.#rebuildFromStore();
      return this.stats;
    } finally {
      this.#scanning = false;
    }
  }

  /** Attach TMDB metadata to each distinct title, caching matches forever. */
  async #matchMetadata() {
    if (!hasMetadata()) {
      log.warn('TMDB_API_KEY missing — library will be listed without artwork');
      return;
    }
    const groups = new Map();
    for (const file of Object.values(this.#store.data.files)) {
      const { title, year, mediaType } = file.parsed;
      if (!title) continue;
      const key = `${mediaType}|${normaliseTitle(title)}|${mediaType === 'movie' ? year || '' : ''}`;
      if (!groups.has(key)) groups.set(key, { title, year, mediaType, key });
    }

    const matches = this.#store.data.matches;
    let looked = 0;
    for (const group of groups.values()) {
      if (matches[group.key] !== undefined) continue;
      try {
        const hit = await findByTitle(group.title, { year: group.year, mediaType: group.mediaType });
        matches[group.key] = hit ? { id: hit.id, card: hit } : null;
        looked += 1;
        if (!hit) log.warn(`no metadata match: "${group.title}" (${group.year ?? '—'})`);
      } catch (err) {
        log.warn(`metadata lookup failed for "${group.title}":`, err.message);
        break; // Network trouble — keep what we have and try on the next scan.
      }
    }
    if (looked) {
      this.#store.touch();
      await this.#store.flush();
      log.info(`matched ${looked} new title(s) against TMDB`);
    }
  }

  // -------------------------------------------------------------------------
  // Index
  // -------------------------------------------------------------------------

  #rebuildFromStore() {
    this.#files = new Map();
    this.#titles = new Map();

    const { files, matches } = this.#store.data;
    for (const file of Object.values(files || {})) {
      this.#files.set(file.id, file);

      const { title, year, mediaType } = file.parsed;
      if (!title) continue;
      const key = `${mediaType}|${normaliseTitle(title)}|${mediaType === 'movie' ? year || '' : ''}`;
      const match = matches?.[key];

      // Files without a metadata match are still watchable — they just show the
      // filename instead of a poster. Never hide someone's media from them.
      const titleId = match?.id || `local:${key}`;

      let entry = this.#titles.get(titleId);
      if (!entry) {
        entry = {
          id: titleId,
          mediaType,
          matched: Boolean(match),
          card: match?.card || {
            id: titleId,
            mediaType,
            tmdbId: null,
            title,
            originalTitle: '',
            year: year || null,
            poster: null,
            backdrop: null,
            overview: '',
            rating: null,
            votes: 0,
            genreIds: [],
          },
          files: [],
        };
        this.#titles.set(titleId, entry);
      }
      entry.files.push(file);
    }

    for (const entry of this.#titles.values()) {
      entry.files.sort((a, b) => this.#score(b) - this.#score(a));
    }
  }

  #score(file) {
    return qualityScore({
      height: file.probe?.video?.height ?? file.parsed.height,
      sourceScore: file.parsed.sourceScore,
      hdr: file.probe?.video?.hdr ?? file.parsed.hdr,
      bitrate: file.probe?.bitrate,
    });
  }

  // -------------------------------------------------------------------------
  // Provider interface
  // -------------------------------------------------------------------------

  async listTitles() {
    return [...this.#titles.values()].map((entry) => ({
      ...entry.card,
      inLibrary: true,
      matched: entry.matched,
      fileCount: entry.files.length,
      bestQuality: this.#qualityLabel(entry.files[0]),
    }));
  }

  #qualityLabel(file) {
    if (!file) return null;
    const height = file.probe?.video?.height ?? file.parsed.height;
    const res = height >= 2160 ? '4K' : height >= 1080 ? '1080p' : height >= 720 ? '720p' : file.parsed.resolution;
    return [res, file.probe?.video?.hdr ?? file.parsed.hdr, file.parsed.source].filter(Boolean).join(' · ');
  }

  #audioTracks(file) {
    const probed = file.probe?.audio || [];
    if (probed.length) {
      return probed.map((track) => ({
        index: track.order,
        streamIndex: track.index,
        language: track.language,
        label:
          track.title ||
          [LANGUAGE_LABELS[track.language] || track.language?.toUpperCase() || 'Дорожка',
           track.channels ? `${track.channels}.0`.replace('6.0', '5.1').replace('8.0', '7.1') : null,
           track.codec?.toUpperCase()]
            .filter(Boolean)
            .join(' · '),
        default: track.default,
      }));
    }
    // No ffprobe: fall back to whatever the filename claims.
    return file.parsed.languageHints.map((language, index) => ({
      index,
      streamIndex: null,
      language,
      label: LANGUAGE_LABELS[language] || language.toUpperCase(),
      default: index === 0,
    }));
  }

  #subtitles(file, sourceId) {
    const embedded = (file.probe?.subtitles || []).map((track) => ({
      index: track.order,
      streamIndex: track.index,
      language: track.language,
      label:
        track.title ||
        `${LANGUAGE_LABELS[track.language] || track.language?.toUpperCase() || 'Субтитры'}${track.forced ? ' (forced)' : ''}`,
      external: false,
      forced: track.forced,
    }));
    const external = (file.sidecarSubtitles || []).map((sub, i) => ({
      index: embedded.length + i,
      streamIndex: null,
      language: sub.language,
      label: sub.label || LANGUAGE_LABELS[sub.language] || 'Субтитры',
      external: true,
      url: `/api/playback/subtitle/${this.id}/${sourceId}/${sub.id}`,
    }));
    return [...embedded, ...external];
  }

  #toSource(file, titleId) {
    const height = file.probe?.video?.height ?? file.parsed.height;
    const audio = this.#audioTracks(file);
    return {
      id: file.id,
      providerId: this.id,
      providerName: this.name,
      titleId,
      kind: 'owned',
      label: this.#qualityLabel(file) || file.name,
      filename: file.name,
      container: file.ext.slice(1),
      size: file.size,
      duration: file.probe?.duration ?? null,
      quality: {
        resolution: height >= 2160 ? '4K' : height >= 1080 ? '1080p' : height >= 720 ? '720p' : file.parsed.resolution,
        height: height ?? null,
        hdr: file.probe?.video?.hdr ?? file.parsed.hdr,
        source: file.parsed.source,
        videoCodec: file.probe?.video?.codec ?? null,
        bitrate: file.probe?.bitrate ?? null,
      },
      audioTracks: audio,
      hasRussianAudio: audio.some((t) => t.language === 'ru'),
      subtitles: this.#subtitles(file, file.id),
      season: file.parsed.season,
      episode: file.parsed.episode,
      compatibility: directPlaySupport(file.ext, file.probe?.video?.codec),
      playUrl: `/api/playback/stream/${this.id}/${file.id}`,
      downloadUrl: `/api/playback/download/${this.id}/${file.id}`,
      score: this.#score(file),
    };
  }

  async getSources(titleId, { season, episode } = {}) {
    const entry = this.#titles.get(titleId);
    if (!entry) return [];
    let files = entry.files;
    if (season != null) files = files.filter((f) => f.parsed.season === Number(season));
    if (episode != null) files = files.filter((f) => f.parsed.episode === Number(episode));
    return files.map((file) => this.#toSource(file, titleId));
  }

  /** Episodes present on disk, so the series page can grey out what you lack. */
  async getEpisodeAvailability(titleId) {
    const entry = this.#titles.get(titleId);
    if (!entry) return {};
    const map = {};
    for (const file of entry.files) {
      const { season, episode } = file.parsed;
      if (season == null || episode == null) continue;
      (map[season] ||= new Set()).add(episode);
    }
    return Object.fromEntries(Object.entries(map).map(([s, set]) => [s, [...set].sort((a, b) => a - b)]));
  }

  getFile(id) {
    return this.#files.get(id) || null;
  }

  getSidecar(sourceId, subtitleId) {
    const file = this.#files.get(sourceId);
    return (file?.sidecarSubtitles || []).find((s) => s.id === subtitleId) || null;
  }

  /**
   * Open a byte range. Range support is what makes seeking work at all on a TV —
   * without it the set-top browser downloads from zero every time you jump.
   */
  async openStream(sourceId, { range } = {}) {
    const file = this.#files.get(sourceId);
    if (!file) return null;

    let stat;
    try {
      stat = await fsp.stat(file.path);
    } catch (err) {
      log.error(`file vanished: ${file.path} (${err.message})`);
      return null;
    }

    const totalSize = stat.size;
    let start = 0;
    let end = totalSize - 1;
    let partial = false;

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (match) {
        const [, rawStart, rawEnd] = match;
        if (rawStart === '' && rawEnd !== '') {
          // Suffix range: last N bytes.
          start = Math.max(0, totalSize - Number(rawEnd));
        } else {
          start = rawStart === '' ? 0 : Number(rawStart);
          if (rawEnd !== '') end = Math.min(Number(rawEnd), totalSize - 1);
        }
        if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= totalSize) {
          return { unsatisfiable: true, totalSize };
        }
        partial = true;
      }
    }

    return {
      stream: fs.createReadStream(file.path, { start, end }),
      start,
      end,
      partial,
      size: end - start + 1,
      totalSize,
      mimeType: MIME_BY_EXT[file.ext] || 'application/octet-stream',
      filename: file.name,
      lastModified: stat.mtime,
    };
  }

  async refresh() {
    await this.scan();
  }
}
