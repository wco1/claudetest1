export type DeviceKind = 'tv' | 'tablet' | 'phone' | 'desktop';
export type PerfTier = 'low' | 'medium' | 'high';

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;

const TV_SIGNATURES = [
  'smart-tv', 'smarttv', 'tizen', 'web0s', 'webos', 'netcast', 'hbbtv',
  'viera', 'bravia', 'aquos', 'philipstv', 'appletv', 'crkey',
  'googletv', 'android tv', 'aft', 'firetv', 'dtv', 'nettv',
];

function detectKind(): DeviceKind {
  const lower = ua.toLowerCase();
  if (TV_SIGNATURES.some((sig) => lower.includes(sig))) return 'tv';

  const touchPoints = navigator.maxTouchPoints || 0;

  // iPadOS reports itself as a Mac; the touch points give it away.
  const isIpad = /ipad/.test(lower) || (/macintosh/.test(lower) && touchPoints > 1);
  if (isIpad) return 'tablet';
  if (/tablet|playbook|silk/.test(lower) || (/android/.test(lower) && !/mobile/.test(lower))) {
    return 'tablet';
  }
  if (/iphone|ipod|android|blackberry|windows phone/.test(lower)) return 'phone';

  // A pointer-less, keyboard-driven, very wide screen is almost certainly a TV
  // browser that did not identify itself.
  const noPointer =
    typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
  if (!noPointer && touchPoints === 0 && window.innerWidth >= 1900 && window.devicePixelRatio === 1) {
    return 'tv';
  }
  return 'desktop';
}

function detectPerf(kind: DeviceKind): PerfTier {
  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency || 0;

  if (memory && memory <= 2) return 'low';
  if (cores && cores <= 2) return 'low';

  // Television SoCs are consistently weak at compositing: blur and large
  // shadows drop a 60fps carousel to single digits even on 2022 models.
  if (kind === 'tv') return memory && memory >= 4 && cores >= 4 ? 'medium' : 'low';
  if (kind === 'phone') return 'medium';
  return 'high';
}

const STORAGE_KEY = 'kt.deviceOverride';

function readOverride(): DeviceKind | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'tv' || value === 'tablet' || value === 'phone' || value === 'desktop'
      ? value
      : null;
  } catch {
    return null;
  }
}

export function setDeviceOverride(kind: DeviceKind | null) {
  try {
    if (kind) localStorage.setItem(STORAGE_KEY, kind);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
  location.reload();
}

const detectedKind = detectKind();
export const device = {
  detectedKind,
  kind: readOverride() ?? detectedKind,
  perf: 'high' as PerfTier,
  /** D-pad navigation is the only input on a TV. */
  get pointerless() {
    return this.kind === 'tv';
  },
  get touch() {
    return this.kind === 'tablet' || this.kind === 'phone';
  },
};
device.perf = detectPerf(device.kind);

/** How many cards fit in one screen-width of a row — drives virtualisation. */
export function cardsPerScreen(): number {
  const width = window.innerWidth;
  if (device.kind === 'tv') return width >= 3000 ? 9 : 7;
  if (width >= 1600) return 7;
  if (width >= 1200) return 6;
  if (width >= 900) return 4.5;
  if (width >= 600) return 3.5;
  return 2.4;
}

/**
 * Pick the smallest artwork that still looks sharp. A TV grid of `original`
 * posters is tens of megabytes and will stall the whole interface.
 */
export function posterSize(): string {
  if (device.kind === 'tv') return 'w342';
  if (device.perf === 'low') return 'w185';
  return window.devicePixelRatio > 1.5 ? 'w500' : 'w342';
}

export function backdropSize(): string {
  if (device.kind === 'tv') return window.innerWidth >= 3000 ? 'w1280' : 'w1280';
  if (device.kind === 'phone') return 'w780';
  return 'w1280';
}

export function stillSize(): string {
  return device.perf === 'low' ? 'w185' : 'w300';
}

/** Applied to <html> so CSS can adapt without media-query guesswork. */
export function applyDeviceClasses() {
  const root = document.documentElement;
  root.setAttribute('data-device', device.kind);
  root.setAttribute('data-perf', device.perf);
  if (device.pointerless) root.setAttribute('data-pointerless', 'true');
}
