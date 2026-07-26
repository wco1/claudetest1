import { useEffect, useRef, useState } from 'react';
import { device } from '../device';

interface Props {
  src: string | null;
  alt: string;
  className?: string;
  /** Rendered when there is no artwork or it fails to load. */
  fallback?: React.ReactNode;
  eager?: boolean;
}

/**
 * Lazy image.
 *
 * A home screen holds a few hundred posters. Decoding them all at once locks up
 * a television for seconds, so images only load once they are near the viewport
 * and fade in when decoded. `loading="lazy"` alone is not enough — most TV
 * browsers ignore it.
 */
export function Image({ src, alt, className, fallback, eager }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(Boolean(eager));
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (visible || !ref.current) return undefined;

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // Generous margin so a fast scroll along a row never shows empty boxes.
      { rootMargin: device.kind === 'tv' ? '600px 1200px' : '300px 600px' },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);

  const showFallback = !src || failed;

  return (
    <div ref={ref} className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {showFallback
        ? fallback ?? null
        : visible && (
            <img
              src={src}
              alt={alt}
              className="img-fade"
              data-loaded={loaded ? 'true' : 'false'}
              decoding="async"
              loading={eager ? 'eager' : 'lazy'}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
          )}
    </div>
  );
}
