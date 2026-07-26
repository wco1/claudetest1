import { memo } from 'react';
import { imageUrl } from '../api/client';
import type { Card as CardModel } from '../api/types';
import { posterSize, stillSize } from '../device';
import { useFocusable } from '../nav/useFocusable';
import { Image } from './Image';

interface Props {
  item: CardModel;
  group: string;
  onSelect: (item: CardModel) => void;
  /** 16:9 artwork instead of a poster — used for "continue watching". */
  wide?: boolean;
  autoFocus?: boolean;
}

function CardImpl({ item, group, onSelect, wide, autoFocus }: Props) {
  const { props, focused } = useFocusable<HTMLButtonElement>({
    group,
    autoFocus,
    onSelect: () => onSelect(item),
  });

  const art = wide
    ? imageUrl(item.backdrop || item.poster, stillSize())
    : imageUrl(item.poster || item.backdrop, posterSize());

  const percent =
    item.progress && item.progress.duration > 0
      ? Math.min(100, (item.progress.position / item.progress.duration) * 100)
      : 0;

  return (
    <button {...props} className={`card${wide ? ' card--wide' : ''}`} aria-label={item.title}>
      <div className="card__art">
        <Image
          src={art}
          alt={item.title}
          fallback={<div className="card__fallback">{item.title}</div>}
        />

        {(item.inLibrary || item.bestQuality) && (
          <div className="card__badges">
            {item.inLibrary && <span className="card__badge card__badge--owned">МОЁ</span>}
            {item.bestQuality && (
              <span className="card__badge card__badge--quality">
                {item.bestQuality.split(' · ')[0]}
              </span>
            )}
          </div>
        )}

        {percent > 0 && (
          <div className="card__progress">
            <i style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>

      <div className="card__label clamp-2">{item.title}</div>
      <div className="card__sub">
        {[item.year, focused && item.rating ? `★ ${item.rating}` : null].filter(Boolean).join(' · ')}
      </div>
    </button>
  );
}

/**
 * Rows re-render on every focus change; without memoisation a television would
 * rebuild a hundred cards each time the remote moves one step.
 */
export const Card = memo(
  CardImpl,
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.wide === next.wide &&
    prev.group === next.group &&
    prev.item.progress?.position === next.item.progress?.position &&
    prev.item.inLibrary === next.item.inLibrary,
);
