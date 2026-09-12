import React, { useEffect, useState } from 'react';
import { ImageOff, MapPin } from 'lucide-react';

export type TravelImageStatus = 'loading' | 'loaded' | 'error';

interface TravelImageProps {
  /** Image URL. If missing/empty, the graceful fallback is shown. */
  src?: string;
  /** Alt text — required for accessibility. */
  alt: string;
  /**
   * Sizing + rounding classes for the image frame (e.g. "h-24 w-36 rounded-xl").
   * The frame clips content, so object-cover images keep your corner radius.
   */
  className?: string;
  iconClassName?: string;
  title?: string;
  /**
   * Short label shown inside the fallback (e.g. the destination name), so a
   * failed image still communicates *what* the place is.
   */
  fallbackLabel?: string;
  /** Skeleton tint while the photo is in flight. */
  skeletonClassName?: string;
  /** Set true for above-the-fold imagery such as a hero photo. */
  eager?: boolean;
}

/**
 * The single image primitive for the app.
 * Guarantees a polished experience in all four states:
 *   1. loading → soft skeleton  2. loaded → photo fades in
 *   3. failed  → neutral placeholder + location icon (never a broken image)
 *   4. missing URL → same graceful fallback
 */
export const TravelImage: React.FC<TravelImageProps> = ({
  src,
  alt,
  className = '',
  iconClassName = 'h-5 w-5',
  title,
  fallbackLabel,
  skeletonClassName = 'bg-slate-200/70',
  eager = false,
}) => {
  const [status, setStatus] = useState<TravelImageStatus>(src ? 'loading' : 'error');

  // Reset state when the source changes (e.g. switching days/hero images).
  useEffect(() => {
    setStatus(src ? 'loading' : 'error');
  }, [src]);

  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`} title={title}>
      {src && status !== 'error' && (
        <img
          src={src}
          alt={alt}
          title={title}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className={`h-full w-full object-cover transition-opacity duration-500 ${
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {status === 'loading' && (
        <div className={`absolute inset-0 animate-pulse ${skeletonClassName}`} aria-hidden="true" />
      )}

      {status === 'error' && (
        <div
          role="img"
          aria-label={alt}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
        >
          {fallbackLabel ? <MapPin className={iconClassName} /> : <ImageOff className={iconClassName} />}
          {fallbackLabel && (
            <span className="max-w-full truncate px-2 text-center text-[10px] font-bold leading-tight">
              {fallbackLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
