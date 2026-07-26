import express from 'express';
import { requireAuth } from './auth.js';

/** Watch progress and watchlist — per profile, so friends do not mix histories. */
export function createUserRouter({ users }) {
  const router = express.Router();
  router.use(requireAuth);

  const progressFor = (profileId) => (users.data.progress[profileId] ||= {});
  const watchlistFor = (profileId) => (users.data.watchlist[profileId] ||= []);

  /**
   * Called every ~15s during playback and once on exit. Kept deliberately cheap:
   * the store batches writes, so a TV reporting progress never blocks the stream.
   */
  router.post('/progress', (req, res) => {
    const { titleId, season, episode, position, duration, card } = req.body || {};
    if (!titleId || typeof position !== 'number') {
      return res.status(400).json({ error: 'bad_request' });
    }

    const key = season != null && episode != null ? `${titleId}#s${season}e${episode}` : titleId;
    users.update((data) => {
      const store = (data.progress[req.profile.id] ||= {});
      const finished = duration > 0 && position / duration > 0.95;
      store[key] = {
        titleId,
        key,
        season: season ?? null,
        episode: episode ?? null,
        position: Math.max(0, Math.round(position)),
        duration: Math.round(duration || 0),
        finished,
        card: card || store[key]?.card || null,
        updatedAt: Date.now(),
      };

      // Keep the history bounded so the file stays small on a shared box.
      const entries = Object.entries(store);
      if (entries.length > 400) {
        entries
          .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
          .slice(0, entries.length - 400)
          .forEach(([k]) => delete store[k]);
      }
    });

    res.json({ ok: true });
  });

  router.get('/progress/:titleId', (req, res) => {
    const store = progressFor(req.profile.id);
    const prefix = req.params.titleId;
    const entries = Object.values(store).filter((p) => p.titleId === prefix);
    res.json({ entries });
  });

  router.delete('/progress/:key', (req, res) => {
    users.update((data) => {
      delete (data.progress[req.profile.id] || {})[req.params.key];
    });
    res.json({ ok: true });
  });

  router.get('/watchlist', (req, res) => {
    const ids = watchlistFor(req.profile.id);
    const cards = users.data.watchlistCards?.[req.profile.id] || {};
    res.json({ items: ids.map((id) => cards[id]).filter(Boolean) });
  });

  router.post('/watchlist', (req, res) => {
    const { titleId, card } = req.body || {};
    if (!titleId) return res.status(400).json({ error: 'bad_request' });

    const added = users.update((data) => {
      const list = (data.watchlist[req.profile.id] ||= []);
      const cards = ((data.watchlistCards ||= {})[req.profile.id] ||= {});
      const index = list.indexOf(titleId);
      if (index === -1) {
        list.unshift(titleId);
        if (card) cards[titleId] = card;
        return true;
      }
      list.splice(index, 1);
      delete cards[titleId];
      return false;
    });

    res.json({ ok: true, inWatchlist: added });
  });

  return router;
}
