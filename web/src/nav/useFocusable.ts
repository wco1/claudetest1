import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { device } from '../device';
import * as focusEngine from './focus';
import type { FocusableOptions } from './focus';

interface UseFocusableResult<T extends HTMLElement> {
  ref: React.RefObject<T>;
  focused: boolean;
  /** Spread onto the element: handles mouse and touch alongside the D-pad. */
  props: {
    ref: React.RefObject<T>;
    onClick: (event: React.MouseEvent) => void;
    onMouseEnter: () => void;
    'data-focused'?: string;
  };
}

interface Options extends FocusableOptions {
  autoFocus?: boolean;
  disabled?: boolean;
}

/**
 * Makes an element reachable by the remote, the mouse and touch at once, so the
 * same component works on a television and on an iPad without a second code path.
 */
export function useFocusable<T extends HTMLElement = HTMLElement>(
  options: Options = {},
): UseFocusableResult<T> {
  const ref = useRef<T>(null);
  const [focused, setFocused] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handleFocus = useCallback(() => {
    setFocused(true);
    optionsRef.current.onFocus?.();
  }, []);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || options.disabled) return undefined;

    const unregister = focusEngine.register(element, {
      group: optionsRef.current.group,
      priority: optionsRef.current.priority,
      noScroll: optionsRef.current.noScroll,
      onSelect: () => optionsRef.current.onSelect?.(),
      onFocus: handleFocus,
    });

    // Reflect focus loss when the engine moves elsewhere.
    const observer = new MutationObserver(() => {
      setFocused(element.hasAttribute('data-focused'));
    });
    observer.observe(element, { attributes: true, attributeFilter: ['data-focused'] });

    return () => {
      unregister();
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.disabled, options.group, handleFocus]);

  useEffect(() => {
    if (!options.autoFocus || options.disabled) return;
    const element = ref.current;
    if (!element) return;
    // Wait a frame: on mount the row may still be laying out.
    const id = requestAnimationFrame(() => focusEngine.focus(element));
    return () => cancelAnimationFrame(id);
  }, [options.autoFocus, options.disabled]);

  const onClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    if (ref.current) focusEngine.focus(ref.current, { scroll: false });
    optionsRef.current.onSelect?.();
  }, []);

  const onMouseEnter = useCallback(() => {
    // Hover-to-focus is right on a desktop but would fight the remote on a TV.
    if (device.pointerless) return;
    if (ref.current) focusEngine.focus(ref.current, { scroll: false });
  }, []);

  return {
    ref,
    focused,
    props: { ref, onClick, onMouseEnter, ...(focused ? { 'data-focused': 'true' } : {}) },
  };
}

/** Focus the first item of a group once its contents exist. */
export function useAutoFocusGroup(group: string, ready: boolean) {
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    const id = requestAnimationFrame(() => {
      if (focusEngine.focusGroup(group)) done.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [group, ready]);
}
