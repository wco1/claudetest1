import { ru } from './ru';
import { en } from './en';

export type Locale = 'ru' | 'en';
export type TranslationKey = keyof typeof ru;

const DICTIONARIES: Record<Locale, Record<string, string>> = { ru, en };
const STORAGE_KEY = 'kt.locale';

function detect(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'ru' || stored === 'en') return stored;
  } catch {
    /* private mode */
  }
  const lang = (navigator.language || 'ru').toLowerCase();
  return lang.startsWith('en') ? 'en' : 'ru';
}

let locale: Locale = detect();

export const getLocale = () => locale;

export function setLocale(next: Locale) {
  locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* private mode */
  }
  document.documentElement.lang = next;
  location.reload();
}

/** `t('row.trending')`, with `{name}`-style interpolation. */
export function t(key: TranslationKey | string, vars?: Record<string, string | number>): string {
  const dict = DICTIONARIES[locale];
  let value = dict[key] ?? DICTIONARIES.ru[key] ?? key;
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{${name}\\}`, 'g'), String(replacement));
    }
  }
  return value;
}

/** Russian needs three plural forms; English needs two. */
export function plural(count: number, forms: [string, string, string]): string {
  if (locale === 'en') return count === 1 ? forms[0] : forms[1];
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

export function formatRuntime(minutes: number | null | undefined): string {
  if (!minutes) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} ${t('unit.min')}`;
  return rest ? `${hours} ${t('unit.hour')} ${rest} ${t('unit.min')}` : `${hours} ${t('unit.hour')}`;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return h ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} ${t('unit.gb')}`;
  return `${Math.round(bytes / 1024 ** 2)} ${t('unit.mb')}`;
}
