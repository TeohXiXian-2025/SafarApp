import type { GeoPoint, PlaceRef } from '../../src/domain/index.js';
import { requireEnv } from './env.js';
import { HttpError } from './http.js';
import { AIRPORTS } from './airports.js';
import { googleOut, googleRefused } from './openPlaces.js';

interface TzResult {
  timeZoneId: string;
  /** Total UTC offset in minutes (raw + DST) at the requested moment. */
  offsetMinutes: number;
}

async function timezoneApi({ lat, lng }: GeoPoint, unixSeconds: number): Promise<TzResult> {
  const url = new URL('https://maps.googleapis.com/maps/api/timezone/json');
  url.searchParams.set('location', `${lat},${lng}`);
  url.searchParams.set('timestamp', String(Math.floor(unixSeconds)));
  url.searchParams.set('key', requireEnv('GOOGLE_MAPS_SERVER_KEY'));

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  const body = res?.ok
    ? ((await res.json()) as { status: string; timeZoneId?: string; rawOffset?: number; dstOffset?: number })
    : null;
  if (body?.status !== 'OK' || !body.timeZoneId) {
    // A wrong timezone would silently shift every time — fail loudly instead.
    throw new HttpError(502, 'Could not look up the timezone for a place. Please try again.');
  }
  return { timeZoneId: body.timeZoneId, offsetMinutes: ((body.rawOffset ?? 0) + (body.dstOffset ?? 0)) / 60 };
}

/** IANA timezone for a coordinate (as of now). */
export async function lookupTimezone(location: GeoPoint): Promise<string> {
  return (await timezoneApi(location, Date.now() / 1000)).timeZoneId;
}

/**
 * Converts a wall-clock time at a place ("2026-12-01T08:15") into an ISO
 * instant with that place's UTC offset on that date (DST-aware).
 */
export async function localToInstant(location: GeoPoint, local: string): Promise<{ iso: string; timeZoneId: string }> {
  const naiveUtc = Date.parse(`${local}:00Z`) / 1000;
  // Offset at (roughly) that moment; a second lookup corrects DST-boundary edge cases.
  let tz = await timezoneApi(location, naiveUtc);
  const corrected = await timezoneApi(location, naiveUtc - tz.offsetMinutes * 60);
  if (corrected.offsetMinutes !== tz.offsetMinutes) tz = corrected;

  const sign = tz.offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(tz.offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return { iso: `${local}:00${sign}${hh}:${mm}`, timeZoneId: tz.timeZoneId };
}

/** An airport by its IATA code, from the built-in table (instant, no API). */
export function airportByCode(code?: string): PlaceRef | null {
  const c = code?.trim().toUpperCase();
  const a = c && /^[A-Z]{3}$/.test(c) ? AIRPORTS[c] : undefined;
  if (!a) return null;
  const [name, lat, lng, city, country] = a;
  return { name, location: { lat, lng }, address: [city, country].filter(Boolean).join(', ') };
}

/** Photon (OpenStreetMap search, no key) — the backup when Google's text search is out. */
async function photonPlace(query: string): Promise<PlaceRef | null> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query.slice(0, 200))}&limit=1&lang=en`;
  const res = await fetch(url, { headers: { 'user-agent': 'Safar/1.0 (group travel planner)' }, signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!res?.ok) return null;
  const f = ((await res.json().catch(() => null)) as { features?: { geometry?: { coordinates?: [number, number] }; properties?: { name?: string; street?: string; city?: string; country?: string; osm_type?: string; osm_id?: number } }[] } | null)?.features?.[0];
  const c = f?.geometry?.coordinates;
  if (!f?.properties?.name || !c) return null;
  const p = f.properties;
  const osmId = p.osm_type && p.osm_id ? `${{ N: 'node', W: 'way', R: 'relation' }[p.osm_type] ?? p.osm_type}/${p.osm_id}` : undefined;
  const address = [p.street, p.city, p.country].filter(Boolean).join(', ');
  return { name: p.name!.slice(0, 200), location: { lat: c[1], lng: c[0] }, ...(address ? { address: address.slice(0, 300) } : {}), ...(osmId ? { osmId } : {}) };
}

/**
 * Best match for free text ("Roma Termini", "Hotel Spadai, Florence"): Google
 * Places Text Search while it answers, else Photon (OpenStreetMap).
 */
export async function findPlace(query: string): Promise<PlaceRef | null> {
  if (await googleOut('text')) return photonPlace(query);
  const google = await googleFindPlace(query);
  return google ?? (await photonPlace(query));
}

async function googleFindPlace(query: string): Promise<PlaceRef | null> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': requireEnv('GOOGLE_MAPS_SERVER_KEY'),
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({ textQuery: query.slice(0, 200), pageSize: 1 }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (res?.status === 429) await googleRefused('text');
  if (!res?.ok) return null;
  const body = (await res.json()) as {
    places?: { id: string; displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } }[];
  };
  const p = body.places?.[0];
  if (!p?.location) return null;
  return {
    placeId: p.id,
    name: (p.displayName?.text ?? query).slice(0, 200),
    ...(p.formattedAddress ? { address: p.formattedAddress.slice(0, 300) } : {}),
    location: { lat: p.location.latitude, lng: p.location.longitude },
  };
}
