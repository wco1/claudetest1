import { useCallback, useEffect, useRef, useState } from 'react';

interface State<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Load-on-mount with a manual `reload`, guarding against out-of-order responses
 * when the viewer moves between titles faster than the network answers.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): State<T> & { reload: () => void } {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });
  const generation = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(() => {
    const current = ++generation.current;
    setState((prev) => ({ data: prev.data, loading: true, error: null }));

    loaderRef.current().then(
      (data) => {
        if (current === generation.current) setState({ data, loading: false, error: null });
      },
      (error: Error) => {
        if (current === generation.current) setState({ data: null, loading: false, error });
      },
    );
  }, []);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: run };
}

/** Debounced value — used by the search field so every keystroke is not a request. */
export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
