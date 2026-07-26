import { useEffect, useRef } from 'react';
import * as focusEngine from './focus';
import { isTextEntry, resolveAction } from './keys';
import type { NavAction } from './keys';

type Handler = (action: NavAction, event: KeyboardEvent) => boolean | void;

const stack: Handler[] = [];

/**
 * Register a key handler that takes priority over navigation — used by the
 * player, dialogs and the search field. Returning `true` consumes the key.
 */
export function useKeyHandler(handler: Handler, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    const wrapped: Handler = (action, event) => ref.current(action, event);
    stack.push(wrapped);
    return () => {
      const index = stack.indexOf(wrapped);
      if (index !== -1) stack.splice(index, 1);
    };
  }, [enabled]);
}

/**
 * The single global key listener. Everything the remote does passes through
 * here: overlay handlers first (last registered wins), then spatial navigation.
 */
export function NavProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const action = resolveAction(event);
      if (!action) return;

      // Let people type. Escape still escapes.
      if (isTextEntry(event.target) && !['back', 'up', 'down'].includes(action)) {
        if (action === 'select') {
          (event.target as HTMLElement).blur();
        }
        return;
      }

      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i](action, event) === true) {
          event.preventDefault();
          return;
        }
      }

      switch (action) {
        case 'up':
        case 'down':
        case 'left':
        case 'right':
          if (focusEngine.move(action)) event.preventDefault();
          break;
        case 'select':
          if (focusEngine.select()) event.preventDefault();
          break;
        case 'back':
          // Browser history is the natural back stack; TVs send this on their
          // dedicated Back button and Escape does the same on a keyboard.
          if (location.hash && location.hash !== '#/') {
            event.preventDefault();
            history.back();
          }
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // If nothing holds focus (first paint, or a route with no cards yet), grab it.
  useEffect(() => {
    const id = setInterval(() => {
      const focused = focusEngine.getFocused();
      if (!focused || !focused.isConnected) focusEngine.focusFirst();
    }, 700);
    return () => clearInterval(id);
  }, []);

  return <>{children}</>;
}

export { focusEngine };
