// A place's picture: its photo (Google, Wikipedia or Mapillary — credited when
// not Google), or, when there's none or it fails to load, a small map of the
// exact spot (OpenStreetMap tiles, credited) — never an empty grey box.
import { useState } from 'react';
import type { GeoPoint } from '../../domain';
import { cx } from '../../ui';

const TILE = 256;

/** The tile a point is on at `zoom`, and where on it (px). */
function tileOf(at: GeoPoint, zoom: number) {
  const n = 2 ** zoom;
  const x = ((at.lng + 180) / 360) * n;
  const lat = (at.lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n;
  return { tx: Math.floor(x), ty: Math.floor(y), px: (x - Math.floor(x)) * TILE, py: (y - Math.floor(y)) * TILE, n };
}

/** A 3×3 block of map tiles centred on the spot, with a pin. Fills its box (up to ~512 px). */
export function MapSpot({ at, zoom = 16, className, credit = true, pin = 22 }: { at: GeoPoint; zoom?: number; className?: string; credit?: boolean; pin?: number }) {
  const { tx, ty, px, py, n } = tileOf(at, zoom);
  const tiles: { key: string; src: string; left: string; top: string }[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = (((tx + dx) % n) + n) % n;
      const y = ty + dy;
      if (y < 0 || y >= n) continue;
      tiles.push({ key: `${dx}_${dy}`, src: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`, left: `calc(50% + ${dx * TILE - px}px)`, top: `calc(50% + ${dy * TILE - py}px)` });
    }
  }
  return (
    <div className={cx('relative overflow-hidden bg-[#E8EEF0]', className)} aria-label="Map of the spot" role="img">
      {tiles.map((t) => (
        <img key={t.key} src={t.src} alt="" loading="lazy" draggable={false} className="absolute max-w-none select-none" style={{ width: TILE, height: TILE, left: t.left, top: t.top }} />
      ))}
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-[#B3261E] drop-shadow" aria-hidden>
        <svg width={pin} height={(pin * 28) / 22} viewBox="0 0 22 28">
          <path d="M11 0C4.9 0 0 4.9 0 11c0 8.3 11 17 11 17s11-8.7 11-17C22 4.9 17.1 0 11 0z" fill="currentColor" />
          <circle cx="11" cy="11" r="4" fill="white" />
        </svg>
      </span>
      {credit && <span className="absolute bottom-0 right-0 bg-white/80 px-1 text-[9px] leading-tight text-[#3E4947]">© OpenStreetMap</span>}
    </div>
  );
}

/**
 * A place's photo, credited unless it's Google's; falls back to a map of the
 * spot (also when the photo fails to load).
 */
export function PlaceThumb({ photoUrl, attribution, at, className, small }: { photoUrl?: string | null; attribution?: string; at?: GeoPoint; className?: string; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    const credit = attribution && !/google/i.test(attribution) ? attribution : null;
    return (
      <div className={cx('relative overflow-hidden bg-[#F3EFE9]', className)}>
        <img src={photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="w-full h-full object-cover" />
        {credit && !small && <span className="absolute bottom-1 right-1.5 text-[10px] text-white/90 bg-black/40 rounded px-1.5 py-0.5 max-w-[80%] truncate">Photo: {credit}</span>}
      </div>
    );
  }
  if (at) return <MapSpot at={at} zoom={small ? 15 : 16} className={className} credit={!small} pin={small ? 11 : 22} />;
  return <div className={cx('bg-[#F3EFE9]', className)} />;
}
