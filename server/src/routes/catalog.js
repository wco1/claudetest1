import express from 'express';
import { config, hasMetadata } from '../config.js';
import { createLogger } from '../lib/logger.js';
import * as tmdb from '../metadata/tmdb.js';
import { sources } from '../sources/registry.js';
import { requireAuth } from './auth.js';

const log = createLogger('catalog');

/** Rows shown on the home screen, in order. */
const HOME_ROWS = [
  { id: 'trending', titleKey: 'row.trending', load: () => tmdb.trending('week') },
  { id: 'movies-popular', titleKey: 'row.popularMovies', load: () => tmdb.collection('movie', 'popular').then((r) => r.results) },
  {
    id: 'russian',
    titleKey: 'row.russian',
    load: () => tmdb.discover('movie', { originalLanguage: 'ru', minVotes: 25, sortBy: 'popularity.desc' }).then((r) => r.results),
  },
  { id: 'tv-popular', titleKey: 'row.popularSeries', load: () => tmdb.collection('tv', 'popular').then((r) => r.results) },
  { id: 'now-playing', titleKey: 'row.inCinemas', load: () => tmdb.collection('movie', 'now_playing').then((r) => r.results) },
  { id: 'top-rated', titleKey: 'row.topRated', load: () => tmdb.collection('movie', 'top_rated').then((r) => r.results) },
  {
    id: 'tv-russian',
    titleKey: 'row.russianSeries',
    load: () => tmdb.discover('tv', { originalLanguage: 'ru', minVotes: 15 }).then((r) => r.results),
  },
  { id: 'tv-top-rated', titleKey: 'row.topRatedSeries', load: () => tmdb.collection('tv', 'top_rated').then((r) => r.results) },
];

export function createCatalogRouter({ users, library }) {
  const router = express.Router();
  router.use(requireAuth);

  /**
   * Home screen. Every row is loaded independently and a failing row is dropped
   * rather than blanking the whole screen — a TV that half-loads is still usable.
   */
  router.get('/home', async (req, res) => {
    const profileId = req.profile.id;
    const rows = [];

    // 1. Continue watching — always first, it is what people open the app for.
    const progress = Object.values(users.data.progress?.[profileId] || {})
      .filter((p) => p.position > 60 && p.position < (p.duration || Infinity) * 0.95)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20);
    if (progress.length) {
      rows.push({
        id: 'continue',
        titleKey: 'row.continue',
        kind: 'continue',
        items: progress.map((p) => ({ ...p.card, progress: { position: p.position, duration: p.duration } })),
      });
    }

    // 2. Your own shelf.
    try {
      const owned = await sources.listLibraryTitles();
      if (owned.length) {
        rows.push({
          id: 'library',
          titleKey: 'row.myLibrary',
          kind: 'library',
          items: owned.slice(0, 40),
        });
      }
    } catch (err) {
      log.warn('library row failed:', err.message);
    }

    if (!hasMetadata()) {
      return res.json({ rows, degraded: 'no_metadata_key' });
    }

    const loaded = await Promise.allSettled(HOME_ROWS.map((row) => row.load()));
    loaded.forEach((result, i) => {
      if (result.status !== 'fulfilled' || !result.value?.length) {
        if (result.status === 'rejected') log.warn(`row ${HOME_ROWS[i].id} failed:`, result.reason?.message);
        return;
      }
      rows.push({
        id: HOME_ROWS[i].id,
        titleKey: HOME_ROWS[i].titleKey,
        kind: 'catalog',
        items: result.value.slice(0, 30),
      });
    });

    // Hero: the most compelling item that has artwork to fill a 4K screen.
    const heroPool = rows.find((r) => r.id === 'trending')?.items || rows[0]?.items || [];
    const hero = heroPool.filter((item) => item.backdrop).slice(0, 8);

    res.json({ rows, hero, region: config.tmdb.region });
  });

  router.get('/genres', async (req, res, next) => {
    try {
      const [movie, tv] = await Promise.all([tmdb.genres('movie'), tmdb.genres('tv')]);
      res.json({ movie, tv });
    } catch (err) {
      next(err);
    }
  });

  /** Filterable grid: /api/catalog/browse?type=movie&genres=28&sort=rating&page=2 */
  router.get('/browse', async (req, res, next) => {
    try {
      const mediaType = req.query.type === 'tv' ? 'tv' : 'movie';
      const sortMap = {
        popularity: 'popularity.desc',
        rating: 'vote_average.desc',
        newest: mediaType === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc',
        revenue: 'revenue.desc',
      };
      const result = await tmdb.discover(mediaType, {
        page: Math.max(1, Math.min(Number(req.query.page) || 1, 500)),
        genres: req.query.genres || undefined,
        sortBy: sortMap[req.query.sort] || sortMap.popularity,
        originalLanguage: req.query.lang || undefined,
        year: req.query.year || undefined,
        minVotes: req.query.sort === 'rating' ? 300 : 40,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/search', async (req, res, next) => {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return res.json({ results: [], page: 1, totalPages: 0, totalResults: 0 });
    try {
      const [remote, owned] = await Promise.all([
        hasMetadata()
          ? tmdb.search(query, { page: Math.max(1, Number(req.query.page) || 1) })
          : Promise.resolve({ results: [], page: 1, totalPages: 0, totalResults: 0 }),
        sources.listLibraryTitles().catch(() => []),
      ]);

      // Titles you already own float to the top of the results.
      const needle = query.toLowerCase();
      const ownedMatches = owned.filter(
        (t) =>
          t.title?.toLowerCase().includes(needle) || t.originalTitle?.toLowerCase().includes(needle),
      );
      const ownedIds = new Set(ownedMatches.map((t) => t.id));
      const merged = [
        ...ownedMatches,
        ...remote.results.map((item) =>
          ownedIds.has(item.id) ? { ...item, inLibrary: true } : item,
        ).filter((item) => !ownedIds.has(item.id)),
      ];

      res.json({ ...remote, results: merged });
    } catch (err) {
      next(err);
    }
  });

  /** Everything on your own shelf, for the "Моя библиотека" screen. */
  router.get('/library', async (req, res, next) => {
    try {
      const titles = await sources.listLibraryTitles();
      res.json({
        titles: titles.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru')),
        stats: library?.stats ?? null,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
