import express from 'express';
import { hasMetadata } from '../config.js';
import * as tmdb from '../metadata/tmdb.js';
import { sources } from '../sources/registry.js';
import { requireAuth } from './auth.js';

export function createTitlesRouter({ users, library }) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/:id', async (req, res, next) => {
    const id = req.params.id;
    const parsed = tmdb.parseId(id);

    try {
      // Files you own but TMDB could not identify still get a detail page.
      if (!parsed) {
        const owned = (await sources.listLibraryTitles()).find((t) => t.id === id);
        if (!owned) return res.status(404).json({ error: 'not_found' });
        const available = await sources.getSources(id);
        return res.json({
          ...owned,
          genres: [],
          cast: [],
          trailers: [],
          unidentified: true,
          sources: available,
          inLibrary: available.length > 0,
        });
      }

      if (!hasMetadata()) return res.status(503).json({ error: 'no_metadata_key' });

      const [details, available, episodes] = await Promise.all([
        tmdb.getDetails(parsed.mediaType, parsed.tmdbId),
        sources.getSources(id),
        library?.getEpisodeAvailability ? library.getEpisodeAvailability(id) : Promise.resolve({}),
      ]);

      const profileId = req.profile.id;
      const progress = users.data.progress?.[profileId]?.[id] || null;
      const inWatchlist = (users.data.watchlist?.[profileId] || []).includes(id);

      res.json({
        ...details,
        sources: available,
        inLibrary: available.length > 0,
        ownedEpisodes: episodes,
        progress: progress ? { position: progress.position, duration: progress.duration } : null,
        inWatchlist,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/season/:season', async (req, res, next) => {
    const parsed = tmdb.parseId(req.params.id);
    if (!parsed || parsed.mediaType !== 'tv') return res.status(404).json({ error: 'not_found' });

    const seasonNumber = Number.parseInt(req.params.season, 10);
    if (!Number.isFinite(seasonNumber)) return res.status(400).json({ error: 'bad_season' });

    try {
      const [season, owned] = await Promise.all([
        tmdb.getSeason(parsed.tmdbId, seasonNumber),
        sources.getSources(req.params.id, { season: seasonNumber }),
      ]);

      const byEpisode = new Map();
      for (const source of owned) {
        if (source.episode == null) continue;
        const list = byEpisode.get(source.episode) || [];
        list.push(source);
        byEpisode.set(source.episode, list);
      }

      const profileId = req.profile.id;
      const progressMap = users.data.progress?.[profileId] || {};

      res.json({
        ...season,
        episodes: season.episodes.map((episode) => {
          const key = `${req.params.id}#s${seasonNumber}e${episode.episodeNumber}`;
          const progress = progressMap[key];
          return {
            ...episode,
            sources: byEpisode.get(episode.episodeNumber) || [],
            inLibrary: byEpisode.has(episode.episodeNumber),
            progress: progress ? { position: progress.position, duration: progress.duration } : null,
          };
        }),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
