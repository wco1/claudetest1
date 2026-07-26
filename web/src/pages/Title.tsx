import { useCallback, useState } from 'react';
import { api, imageUrl, withToken } from '../api/client';
import type { Card, Source, TitleDetails, WatchOffer } from '../api/types';
import { Button } from '../components/Button';
import { CheckIcon, DownloadIcon, ExternalIcon, PlayIcon, PlusIcon } from '../components/Icons';
import { Image } from '../components/Image';
import { Row } from '../components/Row';
import { ErrorState, Loading } from '../components/States';
import { backdropSize, posterSize } from '../device';
import { useAsync } from '../hooks/useAsync';
import { formatBytes, formatRuntime, t } from '../i18n';
import { useFocusable } from '../nav/useFocusable';
import { navigate, routes } from '../router';
import { Episodes } from './Episodes';

const OFFER_LABEL: Record<WatchOffer['kind'], string> = {
  subscription: 'sources.subscription',
  free: 'sources.free',
  ads: 'sources.ads',
  rent: 'sources.rent',
  buy: 'sources.buy',
};

export function TitlePage({ id }: { id: string }) {
  const { data, loading, error, reload } = useAsync(() => api.title(id), [id]);
  const [watchlisted, setWatchlisted] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const toggleWatchlist = useCallback(async () => {
    if (!data) return;
    const result = await api.toggleWatchlist(data.id, data as Card);
    setWatchlisted(result.inWatchlist);
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error) {
    return (
      <ErrorState
        title={error.message.includes('404') ? t('error.notFound') : undefined}
        message={error.message}
        onRetry={reload}
      />
    );
  }
  if (!data) return null;

  const inWatchlist = watchlisted ?? Boolean(data.inWatchlist);
  const best = data.sources?.[0];
  const isSeries = data.mediaType === 'tv';
  const resumeAt = data.progress?.position ?? 0;

  const play = (source?: Source) => {
    const target = source || best;
    if (!target) return;
    navigate(
      routes.player(data.id, {
        source: target.id,
        season: target.season ?? undefined,
        episode: target.episode ?? undefined,
      }),
    );
  };

  return (
    <div className="page detail">
      <div className="detail__backdrop">
        <Image src={imageUrl(data.backdrop, backdropSize())} alt="" eager />
        <div className="detail__scrim" />
      </div>

      <div className="detail__top">
        <div className="detail__poster">
          <Image
            src={imageUrl(data.poster, posterSize())}
            alt={data.title}
            fallback={<div className="card__fallback">{data.title}</div>}
          />
        </div>

        <div className="detail__info">
          <h1 className="detail__title">{data.title}</h1>
          {data.originalTitle && data.originalTitle !== data.title && (
            <div className="detail__original">{data.originalTitle}</div>
          )}

          <div className="detail__meta">
            {data.year && <span>{data.year}</span>}
            {data.rating ? <span className="chip chip--rating">★ {data.rating}</span> : null}
            {data.runtime ? <span>{formatRuntime(data.runtime)}</span> : null}
            {isSeries && data.seasonCount ? (
              <span>
                {data.seasonCount} {t('title.seasons').toLowerCase()}
              </span>
            ) : null}
            {data.certification && <span className="chip">{data.certification}+</span>}
            {data.genres?.slice(0, 3).map((genre) => (
              <span key={genre.id}>{genre.name}</span>
            ))}
            {data.inLibrary && <span className="chip chip--owned">{t('title.inLibrary')}</span>}
          </div>

          {data.tagline && <p className="muted">{data.tagline}</p>}
          {data.overview && <p className="detail__overview clamp-4">{data.overview}</p>}

          <div className="detail__actions">
            {best && !isSeries && (
              <Button variant="primary" group="actions" autoFocus priority={10} onSelect={() => play()}>
                <PlayIcon />
                {resumeAt > 60 ? t('action.resume') : t('action.play')}
              </Button>
            )}

            {data.trailers?.length > 0 && (
              <Button
                group="actions"
                autoFocus={!best || isSeries}
                onSelect={() => {
                  // YouTube is the only place trailers live; opening the native
                  // app is the reliable path on a TV.
                  window.open(`https://www.youtube.com/watch?v=${data.trailers[0].key}`, '_blank');
                }}
              >
                <PlayIcon />
                {t('action.trailer')}
              </Button>
            )}

            <Button group="actions" onSelect={toggleWatchlist}>
              {inWatchlist ? <CheckIcon /> : <PlusIcon />}
              {inWatchlist ? t('action.watchlist.remove') : t('action.watchlist.add')}
            </Button>

            {best && (
              <Button
                group="actions"
                onSelect={() => {
                  window.location.href = withToken(best.downloadUrl);
                  notify(t('action.download'));
                }}
              >
                <DownloadIcon />
                {t('action.download')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {isSeries && <Episodes title={data} onPlay={play} />}

      {!isSeries && data.sources?.length > 0 && (
        <section className="detail__section">
          <h3>{t('sources.pickFile')}</h3>
          <div className="sources">
            {data.sources.map((source) => (
              <SourceRow key={source.id} source={source} onPlay={() => play(source)} onNotify={notify} />
            ))}
          </div>
        </section>
      )}

      {!data.inLibrary && data.watchProviders && data.watchProviders.offers.length > 0 && (
        <section className="detail__section">
          <h3>{t('sources.legal')}</h3>
          <p className="settings__hint">{t('sources.legalHint')}</p>
          <div className="providers">
            {data.watchProviders.offers.map((offer) => (
              <ProviderButton
                key={`${offer.id}-${offer.kind}`}
                offer={offer}
                link={data.watchProviders!.link}
              />
            ))}
          </div>
        </section>
      )}

      {!data.inLibrary && !data.watchProviders && !isSeries && (
        <section className="detail__section">
          <p className="muted">{t('sources.none')}</p>
        </section>
      )}

      <Facts title={data} />

      {data.cast?.length > 0 && (
        <section className="detail__section">
          <h3>{t('row.cast')}</h3>
          <div className="row__scroller" style={{ padding: '10px 0 16px' }}>
            {data.cast.slice(0, 20).map((person) => (
              <div key={person.id} className="card" style={{ width: 'calc(var(--card-w) * .7)' }}>
                <div className="card__art" style={{ aspectRatio: '1', borderRadius: '50%' }}>
                  <Image
                    src={imageUrl(person.photo, 'w185')}
                    alt={person.name}
                    fallback={<div className="card__fallback">{person.name.slice(0, 1)}</div>}
                  />
                </div>
                <div className="card__label clamp-2">{person.name}</div>
                <div className="card__sub clamp-2">{person.character}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.recommendations?.length > 0 && (
        <Row
          id="recommendations"
          title={t('row.recommended')}
          items={data.recommendations}
          onSelect={(item) => navigate(routes.title(item.id))}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Facts({ title }: { title: TitleDetails }) {
  const facts: { label: string; value: string }[] = [];
  if (title.directors?.length) {
    facts.push({ label: t('title.director'), value: title.directors.map((p) => p.name).join(', ') });
  }
  if (title.writers?.length) {
    facts.push({ label: t('title.writer'), value: title.writers.map((p) => p.name).join(', ') });
  }
  if (title.countries?.length) {
    facts.push({ label: t('title.country'), value: title.countries.join(', ') });
  }
  if (title.originalTitle && title.originalTitle !== title.title) {
    facts.push({ label: t('title.original'), value: title.originalTitle });
  }
  if (!facts.length) return null;

  return (
    <section className="detail__section">
      <dl className="detail__facts">
        {facts.map((fact) => (
          <div key={fact.label} className="detail__fact">
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SourceRow({
  source,
  onPlay,
  onNotify,
}: {
  source: Source;
  onPlay: () => void;
  onNotify: (message: string) => void;
}) {
  const { props } = useFocusable<HTMLButtonElement>({ group: 'sources', onSelect: onPlay });

  const audio = source.audioTracks.map((track) => track.label).join(' · ');

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
      <button {...props} className="source">
        <PlayIcon className="" />
        <div className="source__main">
          <div className="source__title">
            <span>{source.label || source.filename}</span>
            {source.hasRussianAudio && (
              <span className="chip chip--owned">{t('sources.russianAudio')}</span>
            )}
            {source.quality.hdr && <span className="chip chip--hdr">{source.quality.hdr}</span>}
          </div>
          <div className="source__sub truncate">
            {[
              source.container?.toUpperCase(),
              formatBytes(source.size),
              audio,
              source.subtitles.length ? `${t('sources.subtitles')}: ${source.subtitles.length}` : null,
            ]
              .filter(Boolean)
              .join('  ·  ')}
          </div>
        </div>
      </button>

      <Button
        group="sources"
        variant="ghost"
        onSelect={() => {
          window.location.href = withToken(source.downloadUrl);
          onNotify(t('action.download'));
        }}
        title={t('action.download')}
      >
        <DownloadIcon />
      </Button>
    </div>
  );
}

function ProviderButton({ offer, link }: { offer: WatchOffer; link: string | null }) {
  const { props } = useFocusable<HTMLButtonElement>({
    group: 'providers',
    onSelect: () => {
      if (link) window.open(link, '_blank');
    },
  });

  return (
    <button {...props} className="provider">
      {offer.logo && <img src={imageUrl(offer.logo, 'w92') || ''} alt="" />}
      <div>
        <div className="provider__name">{offer.name}</div>
        <div className="provider__kind">{t(OFFER_LABEL[offer.kind])}</div>
      </div>
      <ExternalIcon />
    </button>
  );
}
