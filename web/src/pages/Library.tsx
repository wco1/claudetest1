import { api } from '../api/client';
import { Card } from '../components/Card';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { useAsync } from '../hooks/useAsync';
import { plural, t } from '../i18n';
import { navigate, routes } from '../router';

interface LibraryStats {
  titles: number;
  files: number;
  scanning: boolean;
}

export function Library() {
  const { data, loading, error, reload } = useAsync(() => api.library(), []);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const stats = data?.stats as LibraryStats | null;

  if (!data?.titles.length) {
    return <EmptyState title={t('library.empty')} hint={t('library.emptyHint')} />;
  }

  return (
    <div className="page">
      <div className="row__head">
        <h2 className="row__title">{t('nav.library')}</h2>
        {stats && (
          <span className="dim">
            {stats.scanning
              ? t('library.scanning')
              : `${stats.titles} ${plural(stats.titles, ['название', 'названия', 'названий'])} · ${
                  stats.files
                } ${plural(stats.files, ['файл', 'файла', 'файлов'])}`}
          </span>
        )}
      </div>

      <div className="grid">
        {data.titles.map((item, index) => (
          <Card
            key={`${item.id}-${index}`}
            item={item}
            group="library"
            autoFocus={index === 0}
            onSelect={() => navigate(routes.title(item.id))}
          />
        ))}
      </div>
    </div>
  );
}

export function Watchlist() {
  const { data, loading, error, reload } = useAsync(() => api.watchlist(), []);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  if (!data?.items.length) {
    return <EmptyState title={t('watchlist.empty')} hint={t('watchlist.emptyHint')} />;
  }

  return (
    <div className="page">
      <div className="row__head">
        <h2 className="row__title">{t('nav.watchlist')}</h2>
      </div>
      <div className="grid">
        {data.items.map((item, index) => (
          <Card
            key={`${item.id}-${index}`}
            item={item}
            group="watchlist"
            autoFocus={index === 0}
            onSelect={() => navigate(routes.title(item.id))}
          />
        ))}
      </div>
    </div>
  );
}
