// Travel time between two stops via the Routes API (computeRoutes).
// Short hops are walked; longer ones use public transport, falling back to
// driving where there's no transit route. When Google is out (quota, error,
// or Safar's daily Google budget is used up), openrouteservice measures it
// instead (OPENROUTESERVICE_API_KEY): walking exactly; a longer trip from its
// road route, turned into a public-transport estimate.
import { metersBetween, WALK_MAX_M, type GeoPoint, type TransitLeg } from '../../src/domain/index.js';
import { optionalEnv, requireEnv } from './env.js';
import { googleRefused, takeGoogle } from './openPlaces.js';
import { adminDb } from './firebaseAdmin.js';

type Mode = TransitLeg['mode'];
const TRAVEL_MODE: Record<Mode, string> = { walk: 'WALK', transit: 'TRANSIT', drive: 'DRIVE' };

async function route(a: GeoPoint, b: GeoPoint, mode: Mode): Promise<{ minutes: number; meters: number } | null> {
  const point = (p: GeoPoint) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': requireEnv('GOOGLE_MAPS_SERVER_KEY'),
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify({ origin: point(a), destination: point(b), travelMode: TRAVEL_MODE[mode] }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (res?.status === 429) await googleRefused('routes');
  if (!res?.ok) return null;
  const r = ((await res.json()) as { routes?: { duration?: string; distanceMeters?: number }[] }).routes?.[0];
  if (!r?.duration) return null;
  return { minutes: Math.max(1, Math.round(parseInt(r.duration, 10) / 60)), meters: r.distanceMeters ?? 0 };
}

/** Best leg from a to b: Google while today's budget lasts and it answers, else openrouteservice; null if neither can. */
export async function travelLeg(a: GeoPoint, b: GeoPoint): Promise<Omit<TransitLeg, 'fromId' | 'at'> | null> {
  if (metersBetween(a, b) < 50) return { mode: 'walk', minutes: 0, meters: 0 };
  if (await takeGoogle('routes')) {
    const modes: Mode[] = metersBetween(a, b) <= WALK_MAX_M ? ['walk', 'transit', 'drive'] : ['transit', 'drive'];
    for (const mode of modes) {
      const r = await route(a, b, mode);
      if (r) return { mode, ...r, source: 'google' };
    }
  }
  return orsLeg(a, b);
}

/** openrouteservice: walking for short hops; for longer ones its road route → a public-transport estimate. */
async function orsLeg(a: GeoPoint, b: GeoPoint): Promise<Omit<TransitLeg, 'fromId' | 'at'> | null> {
  const key = optionalEnv('OPENROUTESERVICE_API_KEY');
  if (!key) return null;
  const walk = metersBetween(a, b) <= WALK_MAX_M;
  const url = `https://api.openrouteservice.org/v2/directions/${walk ? 'foot-walking' : 'driving-car'}?api_key=${encodeURIComponent(key)}&start=${a.lng},${a.lat}&end=${b.lng},${b.lat}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return null;
  const sum = ((await res.json().catch(() => null)) as { features?: { properties?: { summary?: { duration?: number; distance?: number } } }[] } | null)?.features?.[0]?.properties?.summary;
  if (!sum?.duration) return null;
  const meters = Math.round(sum.distance ?? 0);
  const minutes = Math.round(sum.duration / 60);
  // Trains and buses: the road time + waiting and walking at both ends (a fair city average).
  return walk ? { mode: 'walk', minutes: Math.max(1, minutes), meters, source: 'ors' } : { mode: 'transit', minutes: Math.round(minutes * 1.3 + 10), meters, source: 'ors' };
}

/** Google allows caching route results for up to 30 days. */
const ROUTE_TTL = 30 * 86_400_000;
const pointKey = (p: GeoPoint) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;

/**
 * travelLeg, remembered for 30 days per pair of places (~10 m apart counts as
 * the same) — AI plans and day refreshes ask for the same legs again and again.
 */
export async function cachedLeg(a: GeoPoint, b: GeoPoint): Promise<Omit<TransitLeg, 'fromId' | 'at'> | null> {
  if (metersBetween(a, b) < 50) return { mode: 'walk', minutes: 0, meters: 0 };
  const ref = adminDb().doc(`routeCache/${pointKey(a)}_${pointKey(b)}`);
  const hit = (await ref.get().catch(() => null))?.data() as (Omit<TransitLeg, 'fromId' | 'at'> & { cachedAt: number }) | undefined;
  // A backup (openrouteservice) answer is asked of Google again the next day.
  if (hit && Date.now() - hit.cachedAt < (hit.source === 'ors' ? 86_400_000 : ROUTE_TTL)) {
    const { cachedAt: _c, ...leg } = hit;
    return leg;
  }
  const leg = await travelLeg(a, b);
  if (leg) await ref.set({ ...leg, cachedAt: Date.now() }).catch(() => {});
  return leg;
}
