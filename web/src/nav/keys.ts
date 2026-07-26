export type NavAction =
  | 'up' | 'down' | 'left' | 'right'
  | 'select' | 'back'
  | 'play' | 'pause' | 'playpause' | 'stop'
  | 'rewind' | 'forward'
  | 'search' | 'info';

/**
 * Remote controls do not agree on anything. Tizen, webOS, Fire TV and Android TV
 * each send different codes for the same button, and several of them are outside
 * the range `KeyboardEvent.key` covers, so `keyCode` is still the only way.
 */
const BY_KEY_CODE: Record<number, NavAction> = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down',
  13: 'select', 32: 'playpause',

  8: 'back',       // Backspace / Fire TV back
  27: 'back',      // Escape
  461: 'back',     // webOS
  10009: 'back',   // Tizen
  166: 'back',     // Browser back (some Android TV)

  415: 'play',
  19: 'pause',
  179: 'playpause',
  413: 'stop',
  412: 'rewind',
  417: 'forward',
  227: 'rewind',   // webOS
  228: 'forward',  // webOS

  10225: 'search',
  457: 'info',
};

const BY_KEY: Record<string, NavAction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'select', ' ': 'playpause', Spacebar: 'playpause',
  Escape: 'back', Backspace: 'back', GoBack: 'back', BrowserBack: 'back',
  MediaPlay: 'play', MediaPause: 'pause', MediaPlayPause: 'playpause', MediaStop: 'stop',
  MediaRewind: 'rewind', MediaFastForward: 'forward',
  MediaTrackPrevious: 'rewind', MediaTrackNext: 'forward',
  BrowserSearch: 'search',
};

export function resolveAction(event: KeyboardEvent): NavAction | null {
  return BY_KEY[event.key] ?? BY_KEY_CODE[event.keyCode] ?? null;
}

/** Typing in a field must not be swallowed by the navigation layer. */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}
