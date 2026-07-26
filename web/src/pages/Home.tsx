import { api } from '../api/client';
import type { Card } from '../api/types';
import { Hero } from '../components/Hero';
import { Row } from '../components/Row';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { useAsync } from '../hooks/useAsync';
import { t } from '../i18n';
import { navigate, routes } from '../router';

export function Home() {
  const { data, loading, error, reload } = useAsync(() => api.home(), []);

  const open = (item: Card) => navigate(routes.title(item.id));

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;

  if (data.degraded === 'no_metadata_key' && !data.rows.length) {
    return (
      <EmptyState title={t('error.noMetadataKey')} hint={t('error.noMetadataKeyHint')} />
    );
  }

  return (
    <div className="page">
      {data.hero && data.hero.length > 0 && <Hero items={data.hero} onOpen={open} />}

      {data.rows.map((row, index) => (
        <Row
          key={row.id}
          id={row.id}
          title={t(row.titleKey)}
          items={row.items}
          wide={row.kind === 'continue'}
          onSelect={open}
          // With no hero to take focus, the first row must claim it.
          autoFocusFirst={index === 0 && !data.hero?.length}
        />
      ))}

      {!data.rows.length && (
        <EmptyState title={t('search.empty')} hint={t('error.noMetadataKeyHint')} />
      )}
    </div>
  );
}
