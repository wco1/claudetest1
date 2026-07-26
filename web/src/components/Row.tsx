import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card as CardModel } from '../api/types';
import { cardsPerScreen } from '../device';
import { Card } from './Card';

interface Props {
  id: string;
  title: string;
  items: CardModel[];
  onSelect: (item: CardModel) => void;
  wide?: boolean;
  autoFocusFirst?: boolean;
  action?: React.ReactNode;
}

/**
 * Horizontal carousel with progressive rendering.
 *
 * Rows are windowed rather than fully virtualised: cards mount as the viewer
 * approaches the end and never unmount. Unmounting behind the cursor is what
 * breaks D-pad navigation — the engine needs the previous card to still exist to
 * find its way back.
 */
export function Row({ id, title, items, onSelect, wide, autoFocusFirst, action }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const chunk = Math.max(6, Math.ceil(cardsPerScreen() * (wide ? 1.2 : 2)));
  const [visible, setVisible] = useState(() => Math.min(items.length, chunk));

  useEffect(() => {
    setVisible(Math.min(items.length, chunk));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, id]);

  const extend = useCallback(() => {
    setVisible((current) => (current >= items.length ? current : Math.min(items.length, current + chunk)));
  }, [items.length, chunk]);

  // Touch/mouse scrolling reaches the end without focus ever moving.
  const onScroll = useCallback(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const remaining = element.scrollWidth - element.scrollLeft - element.clientWidth;
    if (remaining < element.clientWidth) extend();
  }, [extend]);

  if (!items.length) return null;

  return (
    <section className="row" aria-label={title}>
      <div className="row__head">
        <h2 className="row__title">{title}</h2>
        {action}
      </div>
      <div className="row__scroller" ref={scrollerRef} onScroll={onScroll}>
        {items.slice(0, visible).map((item, index) => (
          <Card
            key={`${item.id}-${index}`}
            item={item}
            group={id}
            wide={wide}
            autoFocus={autoFocusFirst && index === 0}
            onSelect={onSelect}
          />
        ))}
        {/* A sentinel keeps the row growing as the remote walks right. */}
        {visible < items.length && <RowSentinel onReach={extend} />}
      </div>
    </section>
  );
}

function RowSentinel({ onReach }: { onReach: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      onReach();
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReach();
      },
      { rootMargin: '0px 900px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [onReach]);

  return <div ref={ref} style={{ flex: 'none', width: 1 }} aria-hidden="true" />;
}
