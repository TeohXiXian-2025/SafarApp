import type { GeoPoint } from '../../src/domain/index.js';
import { requireEnv } from './env.js';
import { HttpError } from './http.js';

/** IANA timezone for a coordinate, via Google Time Zone API (server key). */
export async function lookupTimezone({ lat, lng }: GeoPoint): Promise<string> {
  const url = new URL('https://maps.googleapis.com/maps/api/timezone/json');
  url.searchParams.set('location', `${lat},${lng}`);
  url.searchParams.set('timestamp', String(Math.floor(Date.now() / 1000)));
  url.searchParams.set('key', requireEnv('GOOGLE_MAPS_SERVER_KEY'));

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  const body = res?.ok ? ((await res.json()) as { status: string; timeZoneId?: string }) : null;
  if (body?.status !== 'OK' || !body.timeZoneId) {
    // A wrong timezone would silently shift every prayer time — fail loudly instead.
    throw new HttpError(502, 'Could not look up the destination timezone. Please try again.');
  }
  return body.timeZoneId;
}
