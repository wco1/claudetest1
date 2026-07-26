import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(here, '..', '..');

// Minimal .env loader so the project has no dotenv dependency.
function loadEnvFile() {
  const file = path.join(rootDir, '.env');
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadEnvFile();

const bool = (v, fallback = false) =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
const int = (v, fallback) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};
const list = (v) =>
  String(v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const dataDir = path.resolve(rootDir, process.env.DATA_DIR || './data');
fs.mkdirSync(dataDir, { recursive: true });

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  // Persist a generated secret so sessions survive restarts in casual setups.
  const secretFile = path.join(dataDir, '.session-secret');
  if (fs.existsSync(secretFile)) {
    sessionSecret = fs.readFileSync(secretFile, 'utf8').trim();
  } else {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, sessionSecret, { mode: 0o600 });
  }
}

export const config = {
  port: int(process.env.PORT, 8080),
  host: process.env.HOST || '0.0.0.0',
  dataDir,
  webDist: path.join(rootDir, 'web', 'dist'),

  tmdb: {
    apiKey: (process.env.TMDB_API_KEY || '').trim(),
    language: process.env.DEFAULT_LANGUAGE || 'ru-RU',
    fallbackLanguage: process.env.FALLBACK_LANGUAGE || 'en-US',
    region: (process.env.DEFAULT_REGION || 'RU').toUpperCase(),
    imageBase: 'https://image.tmdb.org/t/p',
  },

  auth: {
    accessCode: (process.env.ACCESS_CODE || '').trim(),
    sessionSecret,
    // 180 days — TVs should not ask for a code every week.
    sessionMaxAgeMs: 180 * 24 * 60 * 60 * 1000,
  },

  library: {
    roots: list(process.env.MEDIA_ROOTS).map((p) => path.resolve(p)),
    scanIntervalMin: int(process.env.LIBRARY_SCAN_INTERVAL, 60),
    ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
    videoExtensions: ['.mkv', '.mp4', '.m4v', '.avi', '.mov', '.webm', '.ts', '.m2ts', '.wmv'],
    subtitleExtensions: ['.srt', '.ass', '.ssa', '.vtt', '.sub'],
  },

  cache: {
    metadataTtlMs: int(process.env.METADATA_TTL_MIN, 720) * 60 * 1000,
    listTtlMs: int(process.env.LIST_TTL_MIN, 60) * 60 * 1000,
    maxEntries: int(process.env.CACHE_MAX_ENTRIES, 4000),
  },

  trustProxy: bool(process.env.TRUST_PROXY, false),
};

export const hasMetadata = () => config.tmdb.apiKey.length > 0;
