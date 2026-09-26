// Backup place sources for when Google says no (quota, error, Safar's own
// daily Google budget used up): Geoapify (OpenStreetMap-based, has a halal
// filter; GEOAPIFY_API_KEY) → OpenStreetMap Overpass (no key). Everything any
// source finds is remembered in Firestore (knownPlaces) — the last resort, so
// an outage never shows an empty screen. Results keep Google's shape; their
// placeId is "osm_node_123" / "geo_…" (see isGooglePlaceId), with `source`.
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { metersBetween, type GeoPoint } from '../../src/domain/index.js';
import { optionalEnv } from './env.js';
import { adminDb } from './firebaseAdmin.js';

export type PlaceSource = 'google' | 'geoapify' | 'osm' | 'memory' | 'traveller';

export interface OpenPlace {
  placeId: string;
  name: string;
  location: GeoPoint;
  types: string[];
  source: PlaceSource;
  osmId?: string;
}

/** Google place ids are opaque; backup sources use prefixed ones. */
export const isGooglePlaceId = (id?: string) => !!id && !/^(osm|geo|mem)_/.test(id);

type Tags = Record<string, string>;
interface Kind {
  /** What Safar calls it (knownPlaces). */
  memory: string;
  /** Overpass filters (each becomes nwr<filter>(around…)). */
  osm: string[];
  /** Tells an Overpass result belongs to this kind. */
  is: (t: Tags) => boolean;
  /** Geoapify categories. */
  geo: string;
}

const HALAL_OSM = '["diet:halal"~"yes|only"]';
const eatery = (t: Tags) => /restaurant|fast_food|food_court|cafe/.test(t.amenity ?? '');
export const KINDS: Record<string, Kind> = {
  mosque: { memory: 'mosque', osm: ['["amenity"="place_of_worship"]["religion"="muslim"]', '["amenity"="prayer_room"]', '["room"="prayer"]["religion"="muslim"]'], is: (t) => t.religion === 'muslim' || t.amenity === 'prayer_room', geo: 'religion.place_of_worship.islam' },
  halal_restaurant: { memory: 'halal', osm: [`["amenity"~"restaurant|fast_food|food_court"]${HALAL_OSM}`], is: (t) => eatery(t) && /yes|only/.test(t['diet:halal'] ?? ''), geo: 'catering.restaurant,catering.fast_food' },
  restaurant: { memory: 'food', osm: ['["amenity"~"restaurant|fast_food|food_court"]'], is: (t) => /restaurant|fast_food|food_court/.test(t.amenity ?? ''), geo: 'catering.restaurant,catering.fast_food' },
  cafe: { memory: 'cafe', osm: ['["amenity"="cafe"]'], is: (t) => t.amenity === 'cafe', geo: 'catering.cafe' },
  bakery: { memory: 'cafe', osm: ['["shop"~"bakery|pastry|confectionery"]'], is: (t) => /bakery|pastry|confectionery/.test(t.shop ?? ''), geo: 'commercial.food_and_drink.bakery' },
  ice_cream_shop: { memory: 'cafe', osm: ['["amenity"="ice_cream"]'], is: (t) => t.amenity === 'ice_cream', geo: 'catering.ice_cream' },
  book_store: { memory: 'shop', osm: ['["shop"="books"]'], is: (t) => t.shop === 'books', geo: 'commercial.books' },
  gift_shop: { memory: 'shop', osm: ['["shop"~"gift|souvenir"]'], is: (t) => /gift|souvenir/.test(t.shop ?? ''), geo: 'commercial.gift_and_souvenir' },
  museum: { memory: 'indoor', osm: ['["tourism"="museum"]'], is: (t) => t.tourism === 'museum', geo: 'entertainment.museum' },
  art_gallery: { memory: 'indoor', osm: ['["tourism"="gallery"]'], is: (t) => t.tourism === 'gallery', geo: 'entertainment.culture.gallery' },
  aquarium: { memory: 'indoor', osm: ['["tourism"="aquarium"]'], is: (t) => t.tourism === 'aquarium', geo: 'entertainment.aquarium' },
  shopping_mall: { memory: 'indoor', osm: ['["shop"="mall"]'], is: (t) => t.shop === 'mall', geo: 'commercial.shopping_mall' },
  movie_theater: { memory: 'indoor', osm: ['["amenity"="cinema"]'], is: (t) => t.amenity === 'cinema', geo: 'entertainment.cinema' },
  bowling_alley: { memory: 'indoor', osm: ['["leisure"="bowling_alley"]'], is: (t) => t.leisure === 'bowling_alley', geo: 'entertainment.bowling_alley' },
  library: { memory: 'indoor', osm: ['["amenity"="library"]'], is: (t) => t.amenity === 'library', geo: 'education.library' },
  train_station: { memory: 'station', osm: ['["railway"="station"]'], is: (t) => t.railway === 'station', geo: 'public_transport.train' },
  subway_station: { memory: 'station', osm: ['["railway"="station"]["station"="subway"]'], is: (t) => t.station === 'subway', geo: 'public_transport.subway' },
  tourist_attraction: { memory: 'sight', osm: ['["tourism"="attraction"]'], is: (t) => t.tourism === 'attraction', geo: 'tourism.attraction' },
  park: { memory: 'sight', osm: ['["leisure"="park"]'], is: (t) => t.leisure === 'park', geo: 'leisure.park' },
};
// Google's food types with the same meaning.
for (const t of ['coffee_shop', 'tea_house', 'juice_shop']) KINDS[t] = KINDS.cafe;
KINDS.dessert_shop = KINDS.ice_cream_shop;
for (const t of ['fast_food_restaurant', 'meal_takeaway', 'middle_eastern_restaurant', 'turkish_restaurant', 'lebanese_restaurant', 'afghani_restaurant', 'indonesian_restaurant', 'indian_restaurant']) KINDS[t] = KINDS.restaurant;

/** The backup kinds for some Google types (unknown types are skipped). */
const kindsFor = (googleTypes: string[]) => [...new Set(googleTypes.map((t) => KINDS[t]).filter(Boolean))];

/** What a text search asked for, when a backup can answer it ("halal food", "prayer room"). */
export function textKinds(query: string): string[] {
  if (/pray|musal|musholl?a|surau|masjid|mosque/i.test(query)) return ['mosque'];
  if (/halal|muslim/i.test(query)) return ['halal_restaurant'];
  return [];
}

const sortNear = (at: GeoPoint, list: OpenPlace[]) => list.sort((a, b) => metersBetween(at, a.location) - metersBetween(at, b.location));

// ─── Geoapify ────────────────────────────────────────────────────────────────

async function geoapify(at: GeoPoint, kinds: Kind[], radiusM: number, max: number, halal: boolean): Promise<OpenPlace[] | null> {
  const key = optionalEnv('GEOAPIFY_API_KEY');
  if (!key || !kinds.length) return null;
  const url = new URL('https://api.geoapify.com/v2/places');
  url.searchParams.set('categories', [...new Set(kinds.flatMap((k) => k.geo.split(',')))].join(','));
  url.searchParams.set('filter', `circle:${at.lng},${at.lat},${Math.round(radiusM)}`);
  url.searchParams.set('bias', `proximity:${at.lng},${at.lat}`);
  url.searchParams.set('limit', String(Math.min(50, max * 2)));
  if (halal) url.searchParams.set('conditions', 'halal');
  url.searchParams.set('apiKey', key);
  const res = await fetch(url, { signal: AbortSignal.timeout(7000) }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as { features?: { properties?: { name?: string; lat?: number; lon?: number; place_id?: string; categories?: string[]; datasource?: { raw?: { osm_type?: string; osm_id?: number } } } }[] } | null;
  if (!body?.features) return null;
  const out: OpenPlace[] = [];
  for (const f of body.features) {
    const p = f.properties;
    if (!p?.name || p.lat === undefined || p.lon === undefined) continue;
    const raw = p.datasource?.raw;
    const osmId = raw?.osm_type && raw.osm_id ? `${{ n: 'node', w: 'way', r: 'relation' }[raw.osm_type] ?? raw.osm_type}/${raw.osm_id}` : undefined;
    const types = Object.entries(KINDS)
      .filter(([, k]) => kinds.includes(k) && k.geo.split(',').some((c) => p.categories?.includes(c)))
      .map(([t]) => t);
    out.push({
      placeId: osmId ? `osm_${osmId.replace('/', '_')}` : `geo_${createHash('sha1').update(p.place_id ?? p.name).digest('hex').slice(0, 20)}`,
      name: p.name.slice(0, 200),
      location: { lat: p.lat, lng: p.lon },
      types: halal ? [...new Set([...types, 'halal_restaurant'])] : types,
      source: 'geoapify',
      ...(osmId ? { osmId } : {}),
    });
  }
  return sortNear(at, out).slice(0, max);
}

// ─── OpenStreetMap Overpass ─────────────────────────────────────────────────

/** The main Overpass server, then a mirror (both need a User-Agent, or they answer 406). */
export const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
export const OVERPASS_HEADERS = { 'content-type': 'application/x-www-form-urlencoded', 'User-Agent': 'Safar/1.0 (group travel planner)' };

export async function overpassKinds(at: GeoPoint, kinds: Kind[], radiusM: number, max: number): Promise<OpenPlace[] | null> {
  if (!kinds.length) return null;
  const r = Math.round(Math.min(radiusM, 5000));
  const filters = [...new Set(kinds.flatMap((k) => k.osm))];
  const q = `[out:json][timeout:12];(${filters.map((f) => `nwr${f}(around:${r},${at.lat},${at.lng});`).join('')});out center tags ${Math.min(80, max * 4)};`;
  for (const endpoint of OVERPASS) {
    const res = await fetch(endpoint, { method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: OVERPASS_HEADERS, signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!res?.ok) continue;
    const body = (await res.json().catch(() => null)) as { elements?: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Tags }[] } | null;
    if (!body?.elements) continue;
    const out: OpenPlace[] = [];
    for (const e of body.elements) {
      const t = e.tags ?? {};
      const name = t['name:en'] || t.name;
      const lat = e.lat ?? e.center?.lat;
      const lng = e.lon ?? e.center?.lon;
      if (!name || lat === undefined || lng === undefined) continue;
      const types = Object.entries(KINDS)
        .filter(([, k]) => kinds.includes(k) && k.is(t))
        .map(([gt]) => gt);
      out.push({ placeId: `osm_${e.type}_${e.id}`, name: name.slice(0, 200), location: { lat, lng }, types, source: 'osm', osmId: `${e.type}/${e.id}` });
    }
    return sortNear(at, out).slice(0, max);
  }
  return null;
}

// ─── Remembered places (every source feeds it; the last resort) ─────────────

/** Google content may only be kept 30 days (its place IDs longer); open data and traveller reports much longer. */
const KEEP_MS: Record<PlaceSource, number> = { google: 30 * 86_400_000, geoapify: 180 * 86_400_000, osm: 180 * 86_400_000, memory: 0, traveller: 3650 * 86_400_000 };
/** ~2.2 km grid cells; a lookup reads the cells around it. */
const CELL = 0.02;
const cellOf = (p: GeoPoint) => `${Math.floor(p.lat / CELL)}_${Math.floor(p.lng / CELL)}`;

export async function rememberPlaces(googleTypes: string[], places: OpenPlace[], source: PlaceSource) {
  const kinds = kindsFor(googleTypes);
  if (!kinds.length || !places.length || source === 'memory') return;
  const db = adminDb();
  const batch = db.batch();
  const now = Date.now();
  for (const p of places.slice(0, 30)) {
    for (const k of new Set(kinds.map((x) => x.memory))) {
      const id = `${k}_${createHash('sha1').update(`${p.name}|${p.location.lat.toFixed(4)}|${p.location.lng.toFixed(4)}`).digest('hex').slice(0, 24)}`;
      batch.set(
        db.doc(`knownPlaces/${id}`),
        { kind: k, name: p.name, location: p.location, cell: cellOf(p.location), source, types: p.types, ...(p.osmId ? { osmId: p.osmId } : {}), ...(source === 'google' ? { placeId: p.placeId } : {}), seenAt: now, expiresAt: now + KEEP_MS[source], count: FieldValue.increment(1) },
        { merge: true },
      );
    }
  }
  await batch.commit().catch(() => {});
}

export async function recallPlaces(googleTypes: string[], at: GeoPoint, radiusM: number, max: number): Promise<OpenPlace[]> {
  const kinds = [...new Set(kindsFor(googleTypes).map((k) => k.memory))];
  if (!kinds.length) return [];
  const span = Math.min(2, Math.ceil(radiusM / 2200));
  const [ci, cj] = cellOf(at).split('_').map(Number);
  const cells: string[] = [];
  for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) cells.push(`${ci + i}_${cj + j}`);
  const snap = await adminDb().collection('knownPlaces').where('cell', 'in', cells.slice(0, 30)).get().catch(() => null);
  if (!snap) return [];
  const now = Date.now();
  const out: OpenPlace[] = [];
  for (const d of snap.docs) {
    const v = d.data() as { kind: string; name: string; location: GeoPoint; types?: string[]; osmId?: string; placeId?: string; expiresAt?: number; source?: PlaceSource };
    if (!kinds.includes(v.kind) || (v.expiresAt && v.expiresAt < now) || metersBetween(at, v.location) > radiusM) continue;
    out.push({ placeId: v.placeId ?? `mem_${d.id}`, name: v.name, location: v.location, types: v.types ?? [], source: v.source === 'traveller' ? 'traveller' : 'memory', ...(v.osmId ? { osmId: v.osmId } : {}) });
  }
  return sortNear(at, out).slice(0, max);
}

/**
 * The backup chain for a nearby search: Geoapify → Overpass → remembered
 * places. null only when every source failed (nothing known either).
 */
export async function openNearby(at: GeoPoint, googleTypes: string[], radiusM: number, max: number): Promise<OpenPlace[] | null> {
  const kinds = kindsFor(googleTypes);
  if (!kinds.length) return null;
  const halal = googleTypes.includes('halal_restaurant');
  for (const source of [() => geoapify(at, kinds, radiusM, max, halal), () => overpassKinds(at, kinds, radiusM, max)]) {
    const found = await source().catch(() => null);
    if (found?.length) {
      await rememberPlaces(googleTypes, found, found[0].source);
      return found;
    }
  }
  const known = await recallPlaces(googleTypes, at, radiusM, max);
  return known.length ? known : null;
}

// ─── Daily Google budget (app-wide) ─────────────────────────────────────────

const BUDGET_ENV = { nearby: 'GOOGLE_DAILY_NEARBY', text: 'GOOGLE_DAILY_TEXT', routes: 'GOOGLE_DAILY_ROUTES' } as const;
const BUDGET_DEFAULT = { nearby: 250, text: 120, routes: 250 } as const;
export type GoogleBudget = keyof typeof BUDGET_ENV;
export const googleDailyCap = (kind: GoogleBudget) => Number(process.env[BUDGET_ENV[kind]]) || BUDGET_DEFAULT[kind];
const budgetDoc = (kind: GoogleBudget) => adminDb().doc(`apiUsage/google_${kind}_${new Date().toISOString().slice(0, 10)}`);

/** Google's daily quotas reset at midnight Pacific time (08:00 UTC in winter, 07:00 in summer — 08:00 is safe). */
const nextGoogleReset = (now = Date.now()) => {
  const d = new Date(now);
  const reset = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8);
  return reset > now ? reset : reset + 86_400_000;
};
/** Until when Google refused each kind (quota exceeded) — remembered here and in Firestore, so nobody waits for it again. */
const refusedUntil = new Map<GoogleBudget, number>();
const refusedDoc = (kind: GoogleBudget) => adminDb().doc(`apiUsage/google_refused_${kind}`);

/** Google said "quota exceeded": skip it until its quota resets. */
export async function googleRefused(kind: GoogleBudget) {
  const until = nextGoogleReset();
  refusedUntil.set(kind, until);
  await refusedDoc(kind).set({ until, at: Date.now() }).catch(() => {});
}

/** Whether Google already refused this kind until its next reset (no request needed to find out). */
export async function googleOut(kind: GoogleBudget): Promise<boolean> {
  const known = refusedUntil.get(kind);
  if (known !== undefined) return known > Date.now();
  const until = Number((await refusedDoc(kind).get().catch(() => null))?.get('until') ?? 0);
  refusedUntil.set(kind, until);
  return until > Date.now();
}

/**
 * Takes one Google request from today's budget; false when it's used up or
 * Google refused until its reset (the backup sources answer instead — before
 * Google would bill or refuse).
 */
export async function takeGoogle(kind: GoogleBudget): Promise<boolean> {
  if (await googleOut(kind)) return false;
  const ref = budgetDoc(kind);
  return adminDb()
    .runTransaction(async (tx) => {
      const used = Number((await tx.get(ref)).get('count') ?? 0);
      if (used >= googleDailyCap(kind)) return false;
      tx.set(ref, { count: FieldValue.increment(1), updatedAt: Date.now() }, { merge: true });
      return true;
    })
    .catch(() => true); // counting failed: don't block Google over it
}

export async function googleUsageToday(): Promise<Record<GoogleBudget, { used: number; cap: number }>> {
  const kinds = Object.keys(BUDGET_ENV) as GoogleBudget[];
  const snaps = await Promise.all(kinds.map((k) => budgetDoc(k).get()));
  return Object.fromEntries(kinds.map((k, i) => [k, { used: Number(snaps[i].get('count') ?? 0), cap: googleDailyCap(k) }])) as Record<GoogleBudget, { used: number; cap: number }>;
}
