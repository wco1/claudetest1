import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { Card } from '../components/Card';
import { SearchIcon } from '../components/Icons';
import { EmptyState, Loading } from '../components/States';
import { device } from '../device';
import { useAsync, useDebounced } from '../hooks/useAsync';
import { t } from '../i18n';
import { useFocusable } from '../nav/useFocusable';
import { navigate, routes, useRoute } from '../router';

export function Search() {
  const route = useRoute();
  const initial = route.query.get('q') || '';
  const [query, setQuery] = useState(initial);
  const debounced = useDebounced(query, 400);
  const inputRef = useRef<HTMLInputElement>(null);

  const { props: fieldProps } = useFocusable<HTMLDivElement>({
    group: 'search-field',
    autoFocus: true,
    onSelect: () => inputRef.current?.focus(),
  });

  // On a TV the on-screen keyboard only appears once the input is really focused.
  useEffect(() => {
    if (device.kind === 'tv') return;
    inputRef.current?.focus();
  }, []);

  const { data, loading } = useAsync(
    () => (debounced.trim().length >= 2 ? api.search(debounced.trim()) : Promise.resolve(null)),
    [debounced],
  );

  useEffect(() => {
    const trimmed = query.trim();
    navigate(trimmed ? routes.search(trimmed) : routes.search(), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className="page">
      <div {...fieldProps} className="search__field">
        <SearchIcon />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search.placeholder')}
          type="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
        />
      </div>

      {loading && <Loading />}

      {!loading && !data && query.trim().length < 2 && (
        <EmptyState title={t('search.hint')} />
      )}

      {!loading && data && data.results.length === 0 && (
        <EmptyState title={t('search.empty')} />
      )}

      {data && data.results.length > 0 && (
        <>
          <p className="settings__hint safe-x">{t('search.results', { count: data.totalResults })}</p>
          <div className="grid">
            {data.results.map((item, index) => (
              <Card
                key={`${item.id}-${index}`}
                item={item}
                group="results"
                onSelect={() => navigate(routes.title(item.id))}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
