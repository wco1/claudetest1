import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('probe');
const run = promisify(execFile);

let ffprobeAvailable = null;

export async function hasFfprobe() {
  if (ffprobeAvailable !== null) return ffprobeAvailable;
  try {
    await run(config.library.ffprobePath, ['-version'], { timeout: 5000 });
    ffprobeAvailable = true;
  } catch {
    ffprobeAvailable = false;
    log.warn('ffprobe not found — falling back to filename parsing for track info');
  }
  return ffprobeAvailable;
}

// ---------------------------------------------------------------------------
// Filename parsing
// ---------------------------------------------------------------------------

const RESOLUTIONS = [
  { re: /\b(4k|2160p?|uhd)\b/i, label: '4K', height: 2160 },
  { re: /\b1440p\b/i, label: '1440p', height: 1440 },
  { re: /\b1080[pi]?\b|\bfullhd\b/i, label: '1080p', height: 1080 },
  { re: /\b720[pi]?\b|\bhd\b/i, label: '720p', height: 720 },
  { re: /\b(480[pi]?|sd)\b/i, label: '480p', height: 480 },
];

const SOURCE_TAGS = [
  { re: /\bremux\b/i, label: 'Remux', score: 100 },
  { re: /\b(bluray|bdrip|brrip|bd)\b/i, label: 'BluRay', score: 90 },
  { re: /\bweb-?dl\b/i, label: 'WEB-DL', score: 80 },
  { re: /\bweb-?rip\b/i, label: 'WEBRip', score: 70 },
  { re: /\bhdtv\b/i, label: 'HDTV', score: 50 },
  { re: /\bdvd(rip)?\b/i, label: 'DVD', score: 40 },
];

const HDR_TAGS = [
  { re: /\bdolby[ .]?vision\b|\bdv\b/i, label: 'Dolby Vision' },
  { re: /\bhdr10\+\b/i, label: 'HDR10+' },
  { re: /\bhdr\b/i, label: 'HDR' },
];

const AUDIO_TAGS = [
  { re: /\b(atmos)\b/i, label: 'Atmos' },
  { re: /\bdts-?hd(\s?ma)?\b/i, label: 'DTS-HD' },
  { re: /\btrue-?hd\b/i, label: 'TrueHD' },
  { re: /\bdts\b/i, label: 'DTS' },
  { re: /\b(eac3|ddp|dd\+)\b/i, label: 'E-AC3' },
  { re: /\b(ac3|dd5\.?1)\b/i, label: 'AC3' },
  { re: /\baac\b/i, label: 'AAC' },
];

// Language markers people put in filenames of their own rips.
const LANGUAGE_TAGS = [
  { re: /\b(rus|ru|russian|дубляж|дублирован\w*|многоголос\w*|mvo|dvo|avo|licen[sc]ia)\b/i, lang: 'ru' },
  { re: /\b(eng|en|english)\b/i, lang: 'en' },
  { re: /\b(ukr|ua|ukrainian)\b/i, lang: 'uk' },
  { re: /\b(jpn|jp|japanese)\b/i, lang: 'ja' },
];

const JUNK = new RegExp(
  String.raw`\b(` +
    [
      '2160p', '1080[pi]', '720[pi]', '480[pi]', '4k', 'uhd', 'fullhd', 'hd',
      'remux', 'bluray', 'blu-ray', 'bdrip', 'brrip', 'bdremux', 'web-?dl', 'web-?rip', 'hdtv', 'dvdrip', 'dvd',
      'x264', 'x265', 'h\\.?264', 'h\\.?265', 'hevc', 'avc', 'xvid', 'divx', '10bit', '8bit',
      'hdr10\\+?', 'hdr', 'dolby ?vision', 'sdr',
      'atmos', 'dts-?hd', 'dts', 'true-?hd', 'eac3', 'ddp?5\\.1', 'ac3', 'aac', 'flac', 'mp3', '5\\.1', '7\\.1', '2\\.0',
      'rus', 'eng', 'ukr', 'jpn', 'dub', 'sub', 'subs', 'mvo', 'dvo', 'avo', 'multi', 'dual',
      'proper', 'repack', 'extended', 'unrated', 'remastered', 'imax', 'directors?.cut', 'theatrical',
      'complete', 'season', 'сезон', 'серия', 'дубляж',
    ].join('|') +
    String.raw`)\b`,
  'gi',
);

const EPISODE_PATTERNS = [
  /\bs(\d{1,2})[\s._-]?e(\d{1,3})\b/i,
  /\b(\d{1,2})x(\d{1,3})\b/i,
  /сезон[\s._-]*(\d{1,2}).*?сери[яйи][\s._-]*(\d{1,3})/i,
];

/**
 * Turn a filename into structured information.
 * Works on both `Movie.Name.2019.2160p.mkv` and `Название (2019) 4K.mkv`.
 */
export function parseFilename(filePath) {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const parentDir = path.basename(path.dirname(filePath));

  // Episode detection can also live in the parent folder ("Season 1").
  let season = null;
  let episode = null;
  for (const re of EPISODE_PATTERNS) {
    const m = base.match(re);
    if (m) {
      season = Number(m[1]);
      episode = Number(m[2]);
      break;
    }
  }
  if (season === null) {
    const dirSeason = parentDir.match(/(?:season|сезон)[\s._-]*(\d{1,2})/i);
    const epOnly = base.match(/\b(?:e|ep|серия)[\s._-]*(\d{1,3})\b/i);
    if (dirSeason && epOnly) {
      season = Number(dirSeason[1]);
      episode = Number(epOnly[1]);
    }
  }

  // Year: prefer a parenthesised year, else the last plausible standalone year.
  let year = null;
  const paren = base.match(/[([](19\d{2}|20\d{2})[)\]]/);
  if (paren) {
    year = Number(paren[1]);
  } else {
    const all = [...base.matchAll(/\b(19\d{2}|20\d{2})\b/g)];
    if (all.length) year = Number(all[all.length - 1][1]);
  }

  const resolution = RESOLUTIONS.find((r) => r.re.test(base)) || null;
  const source = SOURCE_TAGS.find((s) => s.re.test(base)) || null;
  const hdr = HDR_TAGS.find((h) => h.re.test(base)) || null;
  const audioCodecs = AUDIO_TAGS.filter((a) => a.re.test(base)).map((a) => a.label);
  const languages = LANGUAGE_TAGS.filter((l) => l.re.test(base)).map((l) => l.lang);

  // Title: cut everything from the year or the first technical tag onwards.
  let title = base;
  if (year) {
    const idx = title.search(new RegExp(String.raw`[([]?\b${year}\b`));
    if (idx > 0) title = title.slice(0, idx);
  }
  if (season !== null) {
    for (const re of EPISODE_PATTERNS) {
      const m = title.match(re);
      if (m && m.index > 0) title = title.slice(0, m.index);
    }
  }
  title = title
    .replace(JUNK, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/[[({].*?[\])}]/g, ' ')
    .replace(/\s*-\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // A bare episode file ("S01E05.mkv") gets its show name from the folder.
  if (!title || title.length < 2) {
    title = parentDir
      .replace(/(?:season|сезон)[\s._-]*\d{1,2}/gi, '')
      .replace(JUNK, ' ')
      .replace(/[._]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  return {
    title,
    year,
    season,
    episode,
    mediaType: season !== null ? 'tv' : 'movie',
    resolution: resolution?.label ?? null,
    height: resolution?.height ?? null,
    source: source?.label ?? null,
    sourceScore: source?.score ?? 0,
    hdr: hdr?.label ?? null,
    audioCodecs,
    languageHints: [...new Set(languages)],
  };
}

// ---------------------------------------------------------------------------
// ffprobe
// ---------------------------------------------------------------------------

const LANG_NAMES = {
  rus: 'ru', ru: 'ru', eng: 'en', en: 'en', ukr: 'uk', uk: 'uk',
  jpn: 'ja', ja: 'ja', fra: 'fr', fre: 'fr', deu: 'de', ger: 'de', spa: 'es', ita: 'it',
};
const normLang = (v) => LANG_NAMES[String(v || '').toLowerCase()] || (v ? String(v).toLowerCase() : null);

/**
 * Read real container information: video/audio/subtitle streams, so the player
 * can offer "Русская дорожка" as an actual track rather than a guess.
 */
export async function probeFile(absolutePath) {
  if (!(await hasFfprobe())) return null;
  try {
    const { stdout } = await run(
      config.library.ffprobePath,
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', absolutePath],
      { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
    );
    const data = JSON.parse(stdout);
    const streams = data.streams || [];
    const video = streams.find((s) => s.codec_type === 'video');

    const audio = streams
      .filter((s) => s.codec_type === 'audio')
      .map((s, i) => ({
        index: s.index,
        order: i,
        codec: s.codec_name || null,
        channels: s.channels || null,
        language: normLang(s.tags?.language),
        title: s.tags?.title || null,
        default: s.disposition?.default === 1,
      }));

    const subtitles = streams
      .filter((s) => s.codec_type === 'subtitle')
      .map((s, i) => ({
        index: s.index,
        order: i,
        codec: s.codec_name || null,
        language: normLang(s.tags?.language),
        title: s.tags?.title || null,
        forced: s.disposition?.forced === 1,
        default: s.disposition?.default === 1,
      }));

    return {
      duration: data.format?.duration ? Math.round(Number(data.format.duration)) : null,
      bitrate: data.format?.bit_rate ? Number(data.format.bit_rate) : null,
      container: data.format?.format_name || null,
      video: video
        ? {
            codec: video.codec_name || null,
            width: video.width || null,
            height: video.height || null,
            fps: video.r_frame_rate ? evalFraction(video.r_frame_rate) : null,
            hdr: detectHdr(video),
          }
        : null,
      audio,
      subtitles,
    };
  } catch (err) {
    log.debug(`ffprobe failed for ${path.basename(absolutePath)}:`, err.message);
    return null;
  }
}

function evalFraction(str) {
  const [a, b] = String(str).split('/').map(Number);
  if (!b) return null;
  return Math.round((a / b) * 100) / 100;
}

function detectHdr(video) {
  const transfer = video.color_transfer || '';
  if (/smpte2084|arib-std-b67/i.test(transfer)) return 'HDR';
  if (video.side_data_list?.some((d) => /dolby/i.test(d.side_data_type || ''))) return 'Dolby Vision';
  return null;
}

/** Quality score used to pick the best file when several copies exist. */
export function qualityScore({ height, sourceScore = 0, hdr, bitrate }) {
  let score = (height || 0) * 10;
  score += sourceScore * 20;
  if (hdr) score += 500;
  if (bitrate) score += Math.min(bitrate / 1_000_000, 100) * 5;
  return Math.round(score);
}
