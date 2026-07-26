import { config, hasMetadata } from '../config.js';
import { TtlCache } from '../lib/cache.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('tmdb');
const BASE = 'https://api.themoviedb.org/3';

const cache = new TtlCache({ max: config.cache.maxEntries });

/** v4 read-access tokens are JWTs; v3 keys are plain hex strings. */
const isBearerToken = (key) => key.startsWith('eyJ');

class TmdbError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'TmdbError';
    this.status = status;
  }
}

async function request(endpoint, params = {}, { ttlMs = config.cache.listTtlMs } = {}) {
  if (!hasMetadata()) {
    throw new TmdbError('TMDB_API_KEY is not configured', 503);
  }

  const url = new URL(BASE + endpoint);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const key = config.tmdb.apiKey;
  const headers = { accept: 'application/json' };
  if (isBearerToken(key)) headers.authorization = `Bearer ${key}`;
  else url.searchParams.set('api_key', key);

  const cacheKey = url.toString().replace(/([?&])api_key=[^&]*/, '$1');

  return cache.wrap(cacheKey, ttlMs, async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        const res = await fetch(url, { headers, signal: controller.signal });
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('retry-after') || 1);
          await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
          continue;
        }
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new TmdbError(`TMDB ${res.status} for ${endpoint}: ${body.slice(0, 200)}`, res.status);
        }
        return await res.json();
      } catch (err) {
        if (err instanceof TmdbError) throw err;
        if (attempt === 2) throw new TmdbError(`TMDB request failed: ${err.message}`, 502);
        await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Normalisers — everything the client sees is shaped here, never raw TMDB.
// ---------------------------------------------------------------------------

const yearOf = (date) => (date && date.length >= 4 ? Number(date.slice(0, 4)) : null);

/** Stable cross-type identifier, e.g. "movie:603". */
export const makeId = (mediaType, tmdbId) => `${mediaType}:${tmdbId}`;

export function parseId(id) {
  const [mediaType, rest] = String(id).split(':');
  const tmdbId = Number.parseInt(rest, 10);
  if (!['movie', 'tv'].includes(mediaType) || !Number.isFinite(tmdbId)) return null;
  return { mediaType, tmdbId };
}

export function normaliseCard(raw, forcedType) {
  const mediaType = forcedType || raw.media_type || (raw.title ? 'movie' : 'tv');
  if (mediaType !== 'movie' && mediaType !== 'tv') return null;
  const date = raw.release_date || raw.first_air_date || '';
  return {
    id: makeId(mediaType, raw.id),
    mediaType,
    tmdbId: raw.id,
    title: raw.title || raw.name || raw.original_title || raw.original_name || '',
    originalTitle: raw.original_title || raw.original_name || '',
    year: yearOf(date),
    poster: raw.poster_path || null,
    backdrop: raw.backdrop_path || null,
    overview: raw.overview || '',
    rating: raw.vote_average ? Math.round(raw.vote_average * 10) / 10 : null,
    votes: raw.vote_count || 0,
    genreIds: raw.genre_ids || [],
    originalLanguage: raw.original_language || null,
    adult: Boolean(raw.adult),
  };
}

const normaliseList = (results = [], forcedType) =>
  results.map((r) => normaliseCard(r, forcedType)).filter((c) => c && !c.adult && c.title);

function pickLogo(images, language) {
  const logos = images?.logos || [];
  const lang = language.split('-')[0];
  return (
    logos.find((l) => l.iso_639_1 === lang) ||
    logos.find((l) => l.iso_639_1 === 'en') ||
    logos.find((l) => !l.iso_639_1) ||
    logos[0] ||
    null
  )?.file_path ?? null;
}

function normaliseVideos(videos, language) {
  const lang = language.split('-')[0];
  return (videos?.results || [])
    .filter((v) => v.site === 'YouTube' && ['Trailer', 'Teaser', 'Clip'].includes(v.type))
    .map((v) => ({
      key: v.key,
      site: v.site,
      name: v.name,
      type: v.type,
      language: v.iso_639_1,
      official: Boolean(v.official),
    }))
    .sort((a, b) => {
      // Russian trailers first, then official, then real trailers over teasers.
      const langScore = (v) => (v.language === lang ? 0 : v.language === 'en' ? 1 : 2);
      if (langScore(a) !== langScore(b)) return langScore(a) - langScore(b);
      if (a.official !== b.official) return a.official ? -1 : 1;
      const typeScore = (v) => ['Trailer', 'Teaser', 'Clip'].indexOf(v.type);
      return typeScore(a) - typeScore(b);
    })
    .slice(0, 8);
}

function normaliseCertification(raw, mediaType, region) {
  if (mediaType === 'movie') {
    const entry = (raw.release_dates?.results || []).find((r) => r.iso_3166_1 === region);
    const cert = (entry?.release_dates || []).map((d) => d.certification).find(Boolean);
    return cert || null;
  }
  const entry = (raw.content_ratings?.results || []).find((r) => r.iso_3166_1 === region);
  return entry?.rating || null;
}

/**
 * "Where to watch legally" for the configured region.
 * TMDB sources this from JustWatch; `link` opens the aggregator page which
 * hands off to Кинопоиск / Okko / Wink / START / etc.
 */
function normaliseProviders(raw, region) {
  const entry = raw['watch/providers']?.results?.[region];
  if (!entry) return null;
  const map = (arr, kind) =>
    (arr || []).map((p) => ({
      id: p.provider_id,
      name: p.provider_name,
      logo: p.logo_path,
      kind,
      priority: p.display_priority ?? 99,
    }));
  const offers = [
    ...map(entry.flatrate, 'subscription'),
    ...map(entry.free, 'free'),
    ...map(entry.ads, 'ads'),
    ...map(entry.rent, 'rent'),
    ...map(entry.buy, 'buy'),
  ];
  if (!offers.length) return null;
  // Deduplicate: one row per provider, keeping the most convenient offer kind.
  const rank = { subscription: 0, free: 1, ads: 2, rent: 3, buy: 4 };
  const byProvider = new Map();
  for (const offer of offers.sort((a, b) => rank[a.kind] - rank[b.kind] || a.priority - b.priority)) {
    if (!byProvider.has(offer.id)) byProvider.set(offer.id, offer);
  }
  return { link: entry.link || null, offers: [...byProvider.values()] };
}

function normalisePeople(credits) {
  const cast = (credits?.cast || []).slice(0, 24).map((p) => ({
    id: p.id,
    name: p.name,
    character: p.character || '',
    photo: p.profile_path || null,
  }));
  const jobs = (job) =>
    (credits?.crew || [])
      .filter((p) => p.job === job)
      .slice(0, 4)
      .map((p) => ({ id: p.id, name: p.name, photo: p.profile_path || null }));
  return {
    cast,
    directors: jobs('Director'),
    writers: [...jobs('Writer'), ...jobs('Screenplay')].slice(0, 4),
  };
}

function normaliseDetails(raw, mediaType, language) {
  const region = config.tmdb.region;
  const date = raw.release_date || raw.first_air_date || '';
  const people = normalisePeople(raw.credits);

  return {
    id: makeId(mediaType, raw.id),
    mediaType,
    tmdbId: raw.id,
    imdbId: raw.external_ids?.imdb_id || raw.imdb_id || null,
    title: raw.title || raw.name || '',
    originalTitle: raw.original_title || raw.original_name || '',
    tagline: raw.tagline || '',
    overview: raw.overview || '',
    year: yearOf(date),
    releaseDate: date || null,
    status: raw.status || null,
    runtime: raw.runtime || raw.episode_run_time?.[0] || null,
    genres: (raw.genres || []).map((g) => ({ id: g.id, name: g.name })),
    rating: raw.vote_average ? Math.round(raw.vote_average * 10) / 10 : null,
    votes: raw.vote_count || 0,
    popularity: raw.popularity || 0,
    poster: raw.poster_path || null,
    backdrop: raw.backdrop_path || null,
    logo: pickLogo(raw.images, language),
    certification: normaliseCertification(raw, mediaType, region),
    countries: (raw.production_countries || raw.origin_country || []).map((c) =>
      typeof c === 'string' ? c : c.iso_3166_1,
    ),
    originalLanguage: raw.original_language || null,
    spokenLanguages: (raw.spoken_languages || []).map((l) => l.iso_639_1),
    trailers: normaliseVideos(raw.videos, language),
    cast: people.cast,
    directors: people.directors,
    writers: people.writers,
    watchProviders: normaliseProviders(raw, region),
    recommendations: normaliseList(raw.recommendations?.results, mediaType).slice(0, 20),
    similar: normaliseList(raw.similar?.results, mediaType).slice(0, 20),
    ...(mediaType === 'tv'
      ? {
          seasonCount: raw.number_of_seasons || 0,
          episodeCount: raw.number_of_episodes || 0,
          inProduction: Boolean(raw.in_production),
          networks: (raw.networks || []).map((n) => ({ id: n.id, name: n.name, logo: n.logo_path })),
          seasons: (raw.seasons || [])
            .filter((s) => s.season_number > 0 || (raw.seasons.length === 1 && s.episode_count))
            .map((s) => ({
              seasonNumber: s.season_number,
              name: s.name,
              overview: s.overview || '',
              episodeCount: s.episode_count,
              poster: s.poster_path || null,
              airDate: s.air_date || null,
            })),
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const APPEND_MOVIE = 'credits,videos,images,release_dates,watch/providers,recommendations,similar,external_ids';
const APPEND_TV = 'credits,videos,images,content_ratings,watch/providers,recommendations,similar,external_ids';

/**
 * Fetch full details. TMDB's Russian catalogue is good but not complete — when a
 * synopsis is missing in Russian we transparently backfill from English rather
 * than showing an empty description.
 */
export async function getDetails(mediaType, tmdbId, language = config.tmdb.language) {
  const params = {
    language,
    append_to_response: mediaType === 'movie' ? APPEND_MOVIE : APPEND_TV,
    include_image_language: `${language.split('-')[0]},en,null`,
    include_video_language: `${language.split('-')[0]},en`,
  };
  const raw = await request(`/${mediaType}/${tmdbId}`, params, { ttlMs: config.cache.metadataTtlMs });
  const details = normaliseDetails(raw, mediaType, language);

  const needsFallback = !details.overview || !details.title || !details.trailers.length;
  if (needsFallback && language !== config.tmdb.fallbackLanguage) {
    try {
      const fb = await request(
        `/${mediaType}/${tmdbId}`,
        { ...params, language: config.tmdb.fallbackLanguage },
        { ttlMs: config.cache.metadataTtlMs },
      );
      const fallback = normaliseDetails(fb, mediaType, config.tmdb.fallbackLanguage);
      details.overview ||= fallback.overview;
      details.title ||= fallback.title;
      details.tagline ||= fallback.tagline;
      if (!details.trailers.length) details.trailers = fallback.trailers;
      if (!details.logo) details.logo = fallback.logo;
    } catch (err) {
      log.warn(`fallback metadata failed for ${mediaType}/${tmdbId}:`, err.message);
    }
  }
  return details;
}

export async function getSeason(tmdbId, seasonNumber, language = config.tmdb.language) {
  const raw = await request(
    `/tv/${tmdbId}/season/${seasonNumber}`,
    { language },
    { ttlMs: config.cache.metadataTtlMs },
  );
  return {
    seasonNumber: raw.season_number,
    name: raw.name,
    overview: raw.overview || '',
    poster: raw.poster_path || null,
    airDate: raw.air_date || null,
    episodes: (raw.episodes || []).map((e) => ({
      episodeNumber: e.episode_number,
      seasonNumber: e.season_number,
      name: e.name || '',
      overview: e.overview || '',
      still: e.still_path || null,
      airDate: e.air_date || null,
      runtime: e.runtime || null,
      rating: e.vote_average ? Math.round(e.vote_average * 10) / 10 : null,
    })),
  };
}

export async function search(query, { language = config.tmdb.language, page = 1 } = {}) {
  const raw = await request(
    '/search/multi',
    { query, language, page, include_adult: false },
    { ttlMs: 30 * 60 * 1000 },
  );
  return {
    page: raw.page,
    totalPages: Math.min(raw.total_pages || 1, 500),
    totalResults: raw.total_results || 0,
    results: normaliseList(raw.results),
  };
}

export async function discover(mediaType, options = {}) {
  const { language = config.tmdb.language, page = 1, ...rest } = options;
  const raw = await request(
    `/discover/${mediaType}`,
    {
      language,
      page,
      include_adult: false,
      'vote_count.gte': rest.minVotes ?? 50,
      sort_by: rest.sortBy || 'popularity.desc',
      with_genres: rest.genres,
      with_original_language: rest.originalLanguage,
      primary_release_year: mediaType === 'movie' ? rest.year : undefined,
      first_air_date_year: mediaType === 'tv' ? rest.year : undefined,
      'primary_release_date.gte': mediaType === 'movie' ? rest.releasedAfter : undefined,
      'primary_release_date.lte': mediaType === 'movie' ? rest.releasedBefore : undefined,
      watch_region: config.tmdb.region,
      with_watch_providers: rest.providers,
    },
    { ttlMs: config.cache.listTtlMs },
  );
  return {
    page: raw.page,
    totalPages: Math.min(raw.total_pages || 1, 500),
    totalResults: raw.total_results || 0,
    results: normaliseList(raw.results, mediaType),
  };
}

export async function trending(window = 'week', language = config.tmdb.language) {
  const raw = await request(`/trending/all/${window}`, { language }, { ttlMs: 60 * 60 * 1000 });
  return normaliseList(raw.results);
}

export async function collection(mediaType, kind, { language = config.tmdb.language, page = 1 } = {}) {
  const raw = await request(
    `/${mediaType}/${kind}`,
    { language, page, region: config.tmdb.region },
    { ttlMs: config.cache.listTtlMs },
  );
  return {
    page: raw.page,
    totalPages: Math.min(raw.total_pages || 1, 500),
    results: normaliseList(raw.results, mediaType),
  };
}

export async function genres(mediaType, language = config.tmdb.language) {
  const raw = await request(`/genre/${mediaType}/list`, { language }, { ttlMs: 7 * 24 * 60 * 60 * 1000 });
  return (raw.genres || []).map((g) => ({ id: g.id, name: g.name }));
}

/** Used by the library scanner to attach real metadata to your own files. */
export async function findByTitle(title, { year, mediaType = 'movie', language = config.tmdb.language } = {}) {
  const raw = await request(
    `/search/${mediaType}`,
    {
      query: title,
      language,
      include_adult: false,
      year: mediaType === 'movie' ? year : undefined,
      first_air_date_year: mediaType === 'tv' ? year : undefined,
    },
    { ttlMs: config.cache.metadataTtlMs },
  );
  const results = normaliseList(raw.results, mediaType);
  return results[0] || null;
}

export async function findByExternalId(externalId, source = 'imdb_id') {
  const raw = await request(
    `/find/${externalId}`,
    { external_source: source },
    { ttlMs: config.cache.metadataTtlMs },
  );
  const movie = normaliseList(raw.movie_results, 'movie')[0];
  const tv = normaliseList(raw.tv_results, 'tv')[0];
  return movie || tv || null;
}

export const metadataCache = cache;
export { TmdbError };
