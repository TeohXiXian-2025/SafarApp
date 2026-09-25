// Hotel search for a stay.
// Main source: Google Hotels through SerpApi — real hotels with live prices for
// the exact dates. The free plan is ~250 searches a month, so every search is
// cached for 24 h and counted against SERPAPI_MONTHLY_CAP (default 200).
// Fallback when that runs out: LiteAPI (sandbox = real hotels, sample prices).
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import type { GeoPoint } from '../../src/domain/index.js';
import { optionalEnv } from './env.js';
import { adminDb } from './firebaseAdmin.js';
import { searchNearby, searchNearbyFood } from './places.js';

const CACHE_MS = 24 * 3_600_000;
const OFFERS_MS = 12 * 3_600_000;

export interface RawHotel {
  key: string;
  name: string;
  kind: 'hotel' | 'rental';
  location: GeoPoint;
  address?: string;
  stars?: number;
  rating?: number;
  reviews?: number;
  /** Major units of the requested currency. */
  nightly?: number;
  total?: number;
  link?: string;
  token?: string;
  images: string[];
  amenities: string[];
  checkInTime?: string;
  checkOutTime?: string;
  transit?: { name: string; walkMin: number };
}

export interface SearchQuery {
  near: string;
  center: GeoPoint;
  checkIn: string;
  checkOut: string;
  adults: number;
  currency: string;
}

export const hotelKey = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 24);
const monthKey = () => new Date().toISOString().slice(0, 7);

/** Takes one search from this month's SerpApi allowance; false when it's used up. */
async function takeSerpSearch(): Promise<boolean> {
  const cap = Number(process.env.SERPAPI_MONTHLY_CAP) || 200;
  const ref = adminDb().doc(`apiUsage/serpapi_${monthKey()}`);
  return adminDb().runTransaction(async (tx) => {
    const used = Number((await tx.get(ref)).get('count') ?? 0);
    if (used >= cap) return false;
    tx.set(ref, { count: FieldValue.increment(1), updatedAt: Date.now() }, { merge: true });
    return true;
  });
}

export async function serpUsage(): Promise<{ used: number; cap: number }> {
  const used = Number((await adminDb().doc(`apiUsage/serpapi_${monthKey()}`).get()).get('count') ?? 0);
  return { used, cap: Number(process.env.SERPAPI_MONTHLY_CAP) || 200 };
}

async function serp(params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const key = optionalEnv('SERPAPI_KEY');
  if (!key || !(await takeSerpSearch())) return null;
  const url = new URL('https://serpapi.com/search.json');
  for (const [k, v] of Object.entries({ engine: 'google_hotels', hl: 'en', ...params, api_key: key })) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const body = (await res.json()) as Record<string, unknown>;
    return res.ok && !body.error ? body : null;
  } catch {
    return null;
  }
}

type SerpProperty = {
  type?: string;
  name?: string;
  link?: string;
  property_token?: string;
  gps_coordinates?: { latitude: number; longitude: number };
  check_in_time?: string;
  check_out_time?: string;
  rate_per_night?: { extracted_lowest?: number };
  total_rate?: { extracted_lowest?: number };
  extracted_hotel_class?: number;
  overall_rating?: number;
  reviews?: number;
  images?: { thumbnail?: string; original_image?: string }[];
  amenities?: string[];
  nearby_places?: { name: string; transportations?: { type: string; duration: string }[] }[];
};

const TRANSIT = /station|mrt|lrt|monorail|subway|metro|train|bts|mtr|line\b/i;

function fromSerp(p: SerpProperty): RawHotel | null {
  if (!p.name || !p.gps_coordinates) return null;
  const transit = (p.nearby_places ?? [])
    .filter((n) => TRANSIT.test(n.name))
    .map((n) => {
      const walk = n.transportations?.find((t) => /walk/i.test(t.type));
      return walk ? { name: n.name.slice(0, 200), walkMin: parseInt(walk.duration, 10) || 0 } : null;
    })
    .filter((x): x is { name: string; walkMin: number } => !!x)
    .sort((a, b) => a.walkMin - b.walkMin)[0];
  const httpUrl = (u?: string) => (u && /^https?:\/\//.test(u) ? u.slice(0, 2000) : undefined);
  return {
    key: hotelKey(p.property_token ?? `${p.name}|${p.gps_coordinates.latitude.toFixed(4)}`),
    name: p.name.slice(0, 200),
    kind: /rental|apartment/i.test(p.type ?? '') ? 'rental' : 'hotel',
    location: { lat: p.gps_coordinates.latitude, lng: p.gps_coordinates.longitude },
    ...(p.extracted_hotel_class ? { stars: Math.min(5, p.extracted_hotel_class) } : {}),
    ...(p.overall_rating ? { rating: Math.min(5, p.overall_rating) } : {}),
    ...(p.reviews ? { reviews: p.reviews } : {}),
    ...(p.rate_per_night?.extracted_lowest ? { nightly: p.rate_per_night.extracted_lowest } : {}),
    ...(p.total_rate?.extracted_lowest ? { total: p.total_rate.extracted_lowest } : {}),
    ...(httpUrl(p.link) ? { link: httpUrl(p.link) } : {}),
    ...(p.property_token ? { token: p.property_token.slice(0, 500) } : {}),
    images: (p.images ?? []).map((i) => httpUrl(i.thumbnail ?? i.original_image)).filter((u): u is string => !!u).slice(0, 4),
    amenities: (p.amenities ?? []).map((a) => a.slice(0, 80)).slice(0, 20),
    ...(p.check_in_time ? { checkInTime: p.check_in_time.slice(0, 20) } : {}),
    ...(p.check_out_time ? { checkOutTime: p.check_out_time.slice(0, 20) } : {}),
    ...(transit ? { transit } : {}),
  };
}

async function googleHotels(q: SearchQuery): Promise<RawHotel[] | null> {
  const body = await serp({
    q: `hotels near ${q.near}`,
    check_in_date: q.checkIn,
    check_out_date: q.checkOut,
    adults: String(q.adults),
    currency: q.currency,
  });
  if (!body) return null;
  // A very specific query can return a single property page instead of a list.
  const list = (body.properties as SerpProperty[] | undefined) ?? (body.name ? [body as SerpProperty] : []);
  return list.map(fromSerp).filter((h): h is RawHotel => !!h);
}

async function liteHotels(q: SearchQuery): Promise<RawHotel[] | null> {
  const key = optionalEnv('LITEAPI_KEY');
  if (!key) return null;
  const headers = { 'X-API-Key': key, accept: 'application/json', 'content-type': 'application/json' };
  try {
    const list = (await (
      await fetch(`https://api.liteapi.travel/v3.0/data/hotels?latitude=${q.center.lat}&longitude=${q.center.lng}&radius=3000&limit=20`, { headers, signal: AbortSignal.timeout(10_000) })
    ).json()) as { data?: { id: string; name: string; latitude: number; longitude: number; address?: string; stars?: number; rating?: number; reviewCount?: number; main_photo?: string }[] };
    const hotels = list.data ?? [];
    if (!hotels.length) return [];
    const rates = (await (
      await fetch('https://api.liteapi.travel/v3.0/hotels/rates', {
        method: 'POST',
        headers,
        body: JSON.stringify({ hotelIds: hotels.map((h) => h.id), checkin: q.checkIn, checkout: q.checkOut, currency: q.currency, guestNationality: 'MY', occupancies: [{ adults: q.adults }], maxRatesPerHotel: 1 }),
        signal: AbortSignal.timeout(15_000),
      })
    ).json()) as { data?: { hotelId: string; roomTypes?: { offerRetailRate?: { amount: number } }[] }[] };
    const nights = Math.max(1, (Date.parse(q.checkOut) - Date.parse(q.checkIn)) / 86_400_000);
    const total = new Map((rates.data ?? []).map((r) => [r.hotelId, r.roomTypes?.[0]?.offerRetailRate?.amount]));
    return hotels.map((h) => {
      const t = total.get(h.id);
      return {
        key: hotelKey(`lite:${h.id}`),
        name: h.name.slice(0, 200),
        kind: 'hotel' as const,
        location: { lat: h.latitude, lng: h.longitude },
        ...(h.address ? { address: h.address.slice(0, 300) } : {}),
        ...(h.stars ? { stars: Math.min(5, h.stars) } : {}),
        ...(h.rating ? { rating: Math.min(5, h.rating / 2) } : {}),
        ...(h.reviewCount ? { reviews: h.reviewCount } : {}),
        ...(t ? { total: t, nightly: Math.round(t / nights) } : {}),
        link: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name} ${h.address ?? ''}`.trim())}`,
        images: h.main_photo && /^https:\/\//.test(h.main_photo) ? [h.main_photo] : [],
        amenities: [],
      };
    });
  } catch {
    return null;
  }
}

/** Live Google Hotels results (cached 24 h), else LiteAPI sample prices. */
export async function searchHotels(q: SearchQuery, opts: { refresh?: boolean } = {}): Promise<{ hotels: RawHotel[]; source: 'google' | 'sample' } | null> {
  const id = hotelKey(JSON.stringify([q.near.toLowerCase(), q.checkIn, q.checkOut, q.adults, q.currency]));
  const ref = adminDb().doc(`hotelSearchCache/${id}`);
  const cached = (await ref.get()).data();
  if (!opts.refresh && cached && Date.now() - Number(cached.at) < CACHE_MS) return { hotels: cached.hotels as RawHotel[], source: 'google' };
  const google = await googleHotels(q);
  if (google?.length) {
    await ref.set({ at: Date.now(), hotels: google });
    return { hotels: google, source: 'google' };
  }
  if (cached) return { hotels: cached.hotels as RawHotel[], source: 'google' }; // yesterday's live prices beat sample ones
  const lite = await liteHotels(q);
  return lite?.length ? { hotels: lite, source: 'sample' } : null;
}

export interface Offer {
  source: string;
  nightly?: number;
  link: string;
  official: boolean;
}

/** Per-site prices and booking links for one hotel (1 search). */
export async function hotelOffers(token: string, q: Omit<SearchQuery, 'near' | 'center'>): Promise<Offer[] | null> {
  const body = await serp({
    q: 'hotel',
    property_token: token,
    check_in_date: q.checkIn,
    check_out_date: q.checkOut,
    adults: String(q.adults),
    currency: q.currency,
  });
  if (!body) return null;
  type P = { source?: string; link?: string; official?: boolean; rate_per_night?: { extracted_lowest?: number } };
  const all = [...((body.featured_prices as P[]) ?? []), ...((body.prices as P[]) ?? [])];
  const seen = new Set<string>();
  return all
    .filter((p): p is P & { source: string; link: string } => !!p.source && !!p.link && /^https?:\/\//.test(p.link))
    .filter((p) => !seen.has(p.source) && !!seen.add(p.source))
    .map((p) => ({ source: p.source.slice(0, 80), link: p.link.slice(0, 2000), official: !!p.official, ...(p.rate_per_night?.extracted_lowest ? { nightly: p.rate_per_night.extracted_lowest } : {}) }))
    .sort((a, b) => (a.nightly ?? Infinity) - (b.nightly ?? Infinity))
    .slice(0, 12);
}

export const offersFresh = (at?: number) => !!at && Date.now() - at < OFFERS_MS;

/** Nearest mosque (m) and halal places within 800 m. Undefined when the lookup failed. */
export async function muslimNearby(at: GeoPoint, meters: (a: GeoPoint, b: GeoPoint) => number): Promise<{ mosqueM?: number; halalNearby?: number }> {
  const [mosques, halal] = await Promise.all([searchNearby(at, ['mosque'], 3000, 1), searchNearbyFood(at, ['halal_restaurant'], 800, 20)]);
  return {
    ...(mosques?.[0] ? { mosqueM: Math.round(meters(at, mosques[0].location)) } : {}),
    ...(halal ? { halalNearby: halal.length } : {}),
  };
}
