import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Card as CardModel } from '../api/types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { useAsync } from '../hooks/useAsync';
import { t } from '../i18n';
import { useFocusable } from '../nav/useFocusable';
import { navigate, routes } from '../router';

type Sort = 'popularity' | 'rating' | 'newest';

const SORTS: { value: Sort; labelKey: string }[] = [
  { value: 'popularity', labelKey: 'browse.sort.popularity' },
  { value: 'rating', labelKey: 'browse.sort.rating' },
  { value: 'newest', labelKey: 'browse.sort.newest' },
];

export function Browse({ type }: { type: 'movie' | 'tv' }) {
  const [genre, setGenre] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>('popularity');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CardModel[]>([]);

  const genres = useAsync(() => api.genres(), []);

  const { data, loading, error, reload } = useAsync(
    () => api.browse({ type, genres: genre ? String(genre) : undefined, sort, page }),
    [type, genre, sort, page],
  );

  // Filter changes reset the list; page changes append to it.
  useEffect(() => {
    setPage(1);
    setItems([]);
  }, [type, genre, sort]);

  useEffect(() => {
    if (!data) return;
    setItems((current) => (data.page === 1 ? data.results : [...current, ...data.results]));
  }, [data]);

  const genreList = (type === 'movie' ? genres.data?.movie : genres.data?.tv) ?? [];

  if (error && !items.length) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div className="page">
      <div className="filters">
        <FilterChip
          label={t('browse.allGenres')}
          active={genre === null}
          autoFocus
          onSelect={() => setGenre(null)}
        />
        {genreList.map((item) => (
          <FilterChip
            key={item.id}
            label={item.name}
            active={genre === item.id}
            onSelect={() => setGenre(item.id)}
          />
        ))}
      </div>

      <div className="filters">
        {SORTS.map((option) => (
          <FilterChip
            key={option.value}
            label={t(option.labelKey)}
            active={sort === option.value}
            onSelect={() => setSort(option.value)}
          />
        ))}
      </div>

      {loading && !items.length && <Loading />}

      {!loading && !items.length && <EmptyState title={t('browse.nothing')} />}

      {items.length > 0 && (
        <>
          <div className="grid">
            {items.map((item, index) => (
              <Card
                key={`${item.id}-${index}`}
                item={item}
                group="browse"
                onSelect={() => navigate(routes.title(item.id))}
              />
            ))}
          </div>

          {data && data.page < data.totalPages && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 36 }}>
              <Button
                group="browse-more"
                onSelect={() => setPage((current) => current + 1)}
                disabled={loading}
              >
                {loading ? t('player.loading') : t('browse.loadMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onSelect,
  autoFocus,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
  autoFocus?: boolean;
}) {
  const { props } = useFocusable<HTMLButtonElement>({ group: 'filters', onSelect, autoFocus });
  return (
    <button {...props} className={`filter${active ? ' filter--active' : ''}`}>
      {label}
    </button>
  );
}
