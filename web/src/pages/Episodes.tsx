import { useState } from 'react';
import { api, imageUrl } from '../api/client';
import type { Episode, Source, TitleDetails } from '../api/types';
import { Image } from '../components/Image';
import { Loading } from '../components/States';
import { stillSize } from '../device';
import { useAsync } from '../hooks/useAsync';
import { formatRuntime, t } from '../i18n';
import { useFocusable } from '../nav/useFocusable';

interface Props {
  title: TitleDetails;
  onPlay: (source: Source) => void;
}

export function Episodes({ title, onPlay }: Props) {
  const seasons = title.seasons ?? [];
  const [active, setActive] = useState(() => seasons[0]?.seasonNumber ?? 1);

  const { data, loading } = useAsync(
    () => api.season(title.id, active),
    [title.id, active],
  );

  if (!seasons.length) return null;

  return (
    <section className="detail__section">
      <h3>{t('title.episodes')}</h3>

      {seasons.length > 1 && (
        <div className="season-tabs">
          {seasons.map((season) => (
            <SeasonTab
              key={season.seasonNumber}
              label={season.name || t('title.season', { n: season.seasonNumber })}
              active={season.seasonNumber === active}
              onSelect={() => setActive(season.seasonNumber)}
            />
          ))}
        </div>
      )}

      {loading && !data ? (
        <Loading />
      ) : (
        <div className="episodes">
          {data?.episodes.map((episode) => (
            <EpisodeRow key={episode.episodeNumber} episode={episode} onPlay={onPlay} />
          ))}
        </div>
      )}
    </section>
  );
}

function SeasonTab({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  const { props } = useFocusable<HTMLButtonElement>({ group: 'seasons', onSelect });
  return (
    <button {...props} className={`season-tab${active ? ' season-tab--active' : ''}`}>
      {label}
    </button>
  );
}

function EpisodeRow({ episode, onPlay }: { episode: Episode; onPlay: (source: Source) => void }) {
  const available = episode.sources && episode.sources.length > 0;

  const { props } = useFocusable<HTMLButtonElement>({
    group: 'episodes',
    onSelect: () => {
      if (available) onPlay(episode.sources![0]);
    },
  });

  const percent =
    episode.progress && episode.progress.duration > 0
      ? Math.min(100, (episode.progress.position / episode.progress.duration) * 100)
      : 0;

  return (
    <button {...props} className={`episode${available ? '' : ' episode--missing'}`}>
      <div className="episode__still">
        <Image
          src={imageUrl(episode.still, stillSize())}
          alt={episode.name}
          fallback={<div className="card__fallback">{episode.episodeNumber}</div>}
        />
        {percent > 0 && (
          <div className="card__progress">
            <i style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>

      <div className="episode__body">
        <div className="episode__title">
          <span className="episode__num">{episode.episodeNumber}.</span>
          <span className="clamp-2">{episode.name}</span>
        </div>

        <div className="card__sub" style={{ marginTop: 4 }}>
          {[
            episode.runtime ? formatRuntime(episode.runtime) : null,
            episode.rating ? `★ ${episode.rating}` : null,
            available ? t('title.inLibrary') : t('title.notInLibrary'),
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </div>

        {episode.overview && <p className="episode__overview clamp-2">{episode.overview}</p>}
      </div>
    </button>
  );
}
