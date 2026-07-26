import { useEffect, useState } from 'react';
import { imageUrl } from '../api/client';
import type { Card } from '../api/types';
import { backdropSize, device } from '../device';
import { t } from '../i18n';
import { Button } from './Button';
import { Image } from './Image';
import { PlayIcon } from './Icons';

interface Props {
  items: Card[];
  onOpen: (item: Card) => void;
}

const ROTATE_MS = 12_000;

/**
 * Full-bleed hero that cycles through a handful of titles.
 *
 * Rotation pauses as soon as anything is focused inside it — a carousel that
 * moves while you are reading it is the single most annoying thing on a TV.
 */
export function Hero({ items, onOpen }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length < 2) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [paused, items.length]);

  if (!items.length) return null;
  const item = items[index % items.length];

  return (
    <section className="hero" onMouseEnter={() => setPaused(true)}>
      <div className="hero__media">
        <Image src={imageUrl(item.backdrop, backdropSize())} alt="" eager />
      </div>
      <div className="hero__scrim" />

      <div className="hero__body">
        <h1 className="hero__title">{item.title}</h1>

        <div className="hero__meta">
          {item.year && <span>{item.year}</span>}
          {item.rating ? <span className="chip chip--rating">★ {item.rating}</span> : null}
          {item.inLibrary && <span className="chip chip--owned">{t('title.inLibrary')}</span>}
          <span className="chip">{item.mediaType === 'tv' ? t('nav.series') : t('nav.movies')}</span>
        </div>

        {item.overview && device.kind !== 'phone' && (
          <p className="hero__overview clamp-3">{item.overview}</p>
        )}

        <div className="hero__actions">
          <Button
            variant="primary"
            group="hero"
            priority={10}
            autoFocus
            onSelect={() => {
              setPaused(true);
              onOpen(item);
            }}
          >
            <PlayIcon />
            {t('action.more')}
          </Button>

          {items.length > 1 && (
            <div className="hero__dots" aria-hidden="true">
              {items.slice(0, 8).map((dot, i) => (
                <span
                  key={dot.id}
                  style={{
                    display: 'inline-block',
                    width: i === index ? 22 : 8,
                    height: 8,
                    marginRight: 6,
                    borderRadius: 4,
                    background: i === index ? 'var(--text)' : 'rgba(255,255,255,.28)',
                    transition: 'width 200ms ease',
                    verticalAlign: 'middle',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
