import { device } from '../device';

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface FocusableOptions {
  /** Elements sharing a group remember the last item focused inside it. */
  group?: string;
  /** Higher wins when several candidates score alike; use for primary actions. */
  priority?: number;
  onSelect?: () => void;
  onFocus?: () => void;
  /** Skip the default scroll-into-view (the player positions itself). */
  noScroll?: boolean;
}

interface Entry extends FocusableOptions {
  element: HTMLElement;
}

const entries = new Map<HTMLElement, Entry>();
const lastInGroup = new Map<string, HTMLElement>();
let current: HTMLElement | null = null;

export function register(element: HTMLElement, options: FocusableOptions): () => void {
  entries.set(element, { element, ...options });
  element.setAttribute('tabindex', '-1');
  element.setAttribute('data-focusable', 'true');
  return () => {
    entries.delete(element);
    if (current === element) current = null;
    for (const [group, el] of lastInGroup) {
      if (el === element) lastInGroup.delete(group);
    }
  };
}

export function update(element: HTMLElement, options: FocusableOptions) {
  const existing = entries.get(element);
  if (existing) entries.set(element, { ...existing, ...options, element });
}

export function getFocused(): HTMLElement | null {
  return current;
}

const isVisible = (el: HTMLElement): boolean => {
  if (!el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  // An element inside a collapsed/hidden ancestor has no layout box.
  return el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
};

function candidates(): Entry[] {
  const out: Entry[] = [];
  for (const entry of entries.values()) {
    if (entry.element.hasAttribute('data-focus-disabled')) continue;
    if (isVisible(entry.element)) out.push(entry);
  }
  return out;
}

export function focus(element: HTMLElement | null, { scroll = true } = {}) {
  if (!element || !entries.has(element)) return;

  if (current && current !== element) {
    current.removeAttribute('data-focused');
    current.classList.remove('is-focused');
  }

  current = element;
  element.setAttribute('data-focused', 'true');
  element.classList.add('is-focused');

  const entry = entries.get(element)!;
  if (entry.group) lastInGroup.set(entry.group, element);

  // Keep native focus in sync so screen readers and text inputs behave.
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }

  if (scroll && !entry.noScroll) scrollIntoView(element);
  entry.onFocus?.();
}

/**
 * Centre the focused card without using `scrollIntoView({behavior:'smooth'})`,
 * which is unimplemented on webOS and janky on Tizen. Manual scroll maths plus
 * CSS `scroll-behavior` gives one predictable animation everywhere.
 */
function scrollIntoView(element: HTMLElement) {
  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent);
    const scrollsX = /(auto|scroll)/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth;
    const scrollsY = /(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight;

    if (scrollsX) {
      const rect = element.getBoundingClientRect();
      const box = parent.getBoundingClientRect();
      // Leave a card-width of runway so the next item is already visible.
      const margin = Math.min(rect.width * 0.6, box.width * 0.25);
      if (rect.left < box.left + margin) {
        parent.scrollLeft -= box.left + margin - rect.left;
      } else if (rect.right > box.right - margin) {
        parent.scrollLeft += rect.right - (box.right - margin);
      }
    }
    if (scrollsY) {
      const rect = element.getBoundingClientRect();
      const box = parent.getBoundingClientRect();
      const margin = Math.min(rect.height * 0.5, box.height * 0.2);
      if (rect.top < box.top + margin) {
        parent.scrollTop -= box.top + margin - rect.top;
      } else if (rect.bottom > box.bottom - margin) {
        parent.scrollTop += rect.bottom - (box.bottom - margin);
      }
    }
    parent = parent.parentElement;
  }

  // Finally the page itself.
  const rect = element.getBoundingClientRect();
  const viewport = window.innerHeight;
  const topGuard = device.kind === 'tv' ? viewport * 0.28 : viewport * 0.16;
  const bottomGuard = viewport * 0.22;
  if (rect.top < topGuard) {
    window.scrollBy({ top: rect.top - topGuard, behavior: 'auto' });
  } else if (rect.bottom > viewport - bottomGuard) {
    window.scrollBy({ top: rect.bottom - (viewport - bottomGuard), behavior: 'auto' });
  }
}

interface Rect {
  left: number; right: number; top: number; bottom: number; cx: number; cy: number;
}

const rectOf = (el: HTMLElement): Rect => {
  const r = el.getBoundingClientRect();
  return {
    left: r.left, right: r.right, top: r.top, bottom: r.bottom,
    cx: r.left + r.width / 2, cy: r.top + r.height / 2,
  };
};

const OVERLAP_BONUS = 100_000;

/**
 * Score a candidate for a directional move.
 *
 * The rule people expect: go to the nearest thing in that direction, strongly
 * preferring something that visually lines up. Cross-axis drift is penalised
 * heavily so pressing Right along a row never jumps to the row below.
 */
function score(from: Rect, to: Rect, direction: Direction): number | null {
  const TOLERANCE = 6;
  let primary: number;
  let cross: number;
  let overlaps: boolean;

  switch (direction) {
    case 'right':
      if (to.left < from.right - TOLERANCE) return null;
      primary = to.left - from.right;
      cross = Math.abs(to.cy - from.cy);
      overlaps = to.top < from.bottom - TOLERANCE && to.bottom > from.top + TOLERANCE;
      break;
    case 'left':
      if (to.right > from.left + TOLERANCE) return null;
      primary = from.left - to.right;
      cross = Math.abs(to.cy - from.cy);
      overlaps = to.top < from.bottom - TOLERANCE && to.bottom > from.top + TOLERANCE;
      break;
    case 'down':
      if (to.top < from.bottom - TOLERANCE) return null;
      primary = to.top - from.bottom;
      cross = Math.abs(to.cx - from.cx);
      overlaps = to.left < from.right - TOLERANCE && to.right > from.left + TOLERANCE;
      break;
    case 'up':
      if (to.bottom > from.top + TOLERANCE) return null;
      primary = from.top - to.bottom;
      cross = Math.abs(to.cx - from.cx);
      overlaps = to.left < from.right - TOLERANCE && to.right > from.left + TOLERANCE;
      break;
  }

  return primary + cross * 4 - (overlaps ? OVERLAP_BONUS : 0);
}

export function move(direction: Direction): boolean {
  const all = candidates();
  if (!all.length) return false;

  if (!current || !current.isConnected) {
    focus(all[0].element);
    return true;
  }

  const from = rectOf(current);
  const currentGroup = entries.get(current)?.group;

  let best: Entry | null = null;
  let bestScore = Infinity;

  for (const entry of all) {
    if (entry.element === current) continue;
    const value = score(from, rectOf(entry.element), direction);
    if (value === null) continue;

    const adjusted = value - (entry.priority ?? 0) * 20;
    if (adjusted < bestScore) {
      bestScore = adjusted;
      best = entry;
    }
  }

  if (!best) return false;

  // Moving vertically into a different row should land on the card you were
  // last on in that row, not the one that happens to be geometrically nearest.
  const targetGroup = best.group;
  if ((direction === 'up' || direction === 'down') && targetGroup && targetGroup !== currentGroup) {
    const remembered = lastInGroup.get(targetGroup);
    if (remembered && remembered.isConnected && isVisible(remembered)) {
      focus(remembered);
      return true;
    }
  }

  focus(best.element);
  return true;
}

export function select(): boolean {
  if (!current) return false;
  const entry = entries.get(current);
  if (!entry?.onSelect) return false;
  entry.onSelect();
  return true;
}

/** Focus the first element of a group, or the item remembered inside it. */
export function focusGroup(group: string): boolean {
  const remembered = lastInGroup.get(group);
  if (remembered?.isConnected && isVisible(remembered)) {
    focus(remembered);
    return true;
  }
  const first = candidates().find((entry) => entry.group === group);
  if (!first) return false;
  focus(first.element);
  return true;
}

export function focusFirst(): boolean {
  const all = candidates();
  if (!all.length) return false;
  // Reading order is a better default than registration order.
  all.sort((a, b) => {
    const ra = rectOf(a.element);
    const rb = rectOf(b.element);
    return ra.top - rb.top || ra.left - rb.left;
  });
  focus(all[0].element);
  return true;
}

export function clearFocusMemory() {
  lastInGroup.clear();
}
