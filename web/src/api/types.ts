export type MediaType = 'movie' | 'tv';

export interface Card {
  id: string;
  mediaType: MediaType;
  tmdbId: number | null;
  title: string;
  originalTitle: string;
  year: number | null;
  poster: string | null;
  backdrop: string | null;
  overview: string;
  rating: number | null;
  votes: number;
  genreIds?: number[];
  inLibrary?: boolean;
  matched?: boolean;
  bestQuality?: string | null;
  fileCount?: number;
  progress?: { position: number; duration: number };
}

export interface Person {
  id: number;
  name: string;
  character?: string;
  photo: string | null;
}

export interface Trailer {
  key: string;
  site: string;
  name: string;
  type: string;
  language: string | null;
  official: boolean;
}

export interface WatchOffer {
  id: number;
  name: string;
  logo: string | null;
  kind: 'subscription' | 'free' | 'ads' | 'rent' | 'buy';
}

export interface AudioTrack {
  index: number;
  streamIndex: number | null;
  language: string | null;
  label: string;
  default: boolean;
}

export interface SubtitleTrack {
  index: number;
  streamIndex: number | null;
  language: string | null;
  label: string;
  external: boolean;
  forced?: boolean;
  url?: string;
}

export interface Source {
  id: string;
  providerId: string;
  providerName: string;
  titleId: string;
  kind: string;
  label: string;
  filename: string;
  container: string;
  size: number;
  duration: number | null;
  quality: {
    resolution: string | null;
    height: number | null;
    hdr: string | null;
    source: string | null;
    videoCodec: string | null;
    bitrate: number | null;
  };
  audioTracks: AudioTrack[];
  hasRussianAudio: boolean;
  subtitles: SubtitleTrack[];
  season: number | null;
  episode: number | null;
  compatibility: 'universal' | 'most' | 'tv-only' | 'limited';
  playUrl: string;
  downloadUrl: string;
  score: number;
}

export interface Season {
  seasonNumber: number;
  name: string;
  overview: string;
  episodeCount: number;
  poster: string | null;
  airDate: string | null;
}

export interface Episode {
  episodeNumber: number;
  seasonNumber: number;
  name: string;
  overview: string;
  still: string | null;
  airDate: string | null;
  runtime: number | null;
  rating: number | null;
  sources?: Source[];
  inLibrary?: boolean;
  progress?: { position: number; duration: number } | null;
}

export interface TitleDetails extends Card {
  imdbId: string | null;
  tagline: string;
  releaseDate: string | null;
  status: string | null;
  runtime: number | null;
  genres: { id: number; name: string }[];
  logo: string | null;
  certification: string | null;
  countries: string[];
  originalLanguage: string | null;
  trailers: Trailer[];
  cast: Person[];
  directors: Person[];
  writers: Person[];
  watchProviders: { link: string | null; offers: WatchOffer[] } | null;
  recommendations: Card[];
  similar: Card[];
  sources: Source[];
  ownedEpisodes?: Record<string, number[]>;
  inWatchlist?: boolean;
  unidentified?: boolean;
  seasonCount?: number;
  episodeCount?: number;
  seasons?: Season[];
  networks?: { id: number; name: string; logo: string | null }[];
}

export interface HomeRow {
  id: string;
  titleKey: string;
  kind: 'continue' | 'library' | 'catalog';
  items: Card[];
}

export interface HomePayload {
  rows: HomeRow[];
  hero?: Card[];
  degraded?: string;
  region?: string;
}

export interface Profile {
  id: string;
  name: string;
  colour: string;
}

export interface AuthState {
  gated: boolean;
  authenticated: boolean;
  profile: Profile | null;
  profiles: Profile[];
}
