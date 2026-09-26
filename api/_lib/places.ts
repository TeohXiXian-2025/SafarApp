// Google Places (New) — place details for ideas, plus biased text search.
import type { GeoPoint, IdeaCategory, IdeaPlace, PlaceRef } from '../../src/domain/index.js';
import { optionalEnv, requireEnv } from './env.js';
import { HttpError } from './http.js';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin.js';
import { isGooglePlaceId, openNearby, rememberPlaces, takeGoogle, textKinds, type OpenPlace, type PlaceSource } from './openPlaces.js';

const BASE_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'types',
  'primaryType',
  'primaryTypeDisplayName',
  'regularOpeningHours.weekdayDescriptions',
  'rating',
  'userRatingCount',
  'priceLevel',
  'photos',
  'websiteUri',
  'internationalPhoneNumber',
];
/** Extra fields for AI analysis (reviews are a pricier SKU — only fetched when analysing). */
const ANALYSIS_FIELDS = ['reviews', 'editorialSummary', 'servesBeer', 'servesWine', 'servesVegetarianFood'];

export interface PlaceDetails {
  place: IdeaPlace;
  primaryType?: string;
  reviews: { rating?: number; text: string }[];
  editorialSummary?: string;
  servesBeer?: boolean;
  servesWine?: boolean;
}

const PRICE: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const CATEGORY_RULES: [RegExp, IdeaCategory][] = [
  [/restaurant|food|cafe|coffee|bakery|meal_|dessert|ice_cream|tea_house|food_court|juice|confectionery|deli|steak|ramen|sushi|barbecue/, 'food'],
  [/bar$|^bar|pub|night_club|wine_bar|casino|karaoke/, 'nightlife'],
  [/mosque|church|temple|shrine|hindu_temple|synagogue|place_of_worship|museum|art_gallery|historical|monument|cultural|library|performing_arts|castle/, 'culture'],
  [/park|garden|beach|hiking|natural_feature|national_park|mountain|lake|waterfall|campground|nature/, 'nature'],
  [/shopping|store|market|mall|outlet|department/, 'shopping'],
  [/amusement|theme_park|zoo|aquarium|water_park|bowling|spa|gym|sports|stadium|ski|golf|marina|tour/, 'activity'],
  [/tourist_attraction|landmark|observation|plaza|point_of_interest/, 'attraction'],
];

export function categorize(types: string[], primaryType?: string): IdeaCategory {
  for (const t of [primaryType, ...types].filter(Boolean) as string[]) {
    for (const [re, cat] of CATEGORY_RULES) if (re.test(t)) return cat;
  }
  return 'other';
}

/** Typical visit length by category (minutes) — refined later by the scheduler. */
export const DEFAULT_DURATION: Record<IdeaCategory, number> = {
  food: 60,
  attraction: 90,
  activity: 120,
  shopping: 90,
  nature: 120,
  culture: 90,
  nightlife: 90,
  other: 60,
};

interface RawPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text: string };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  photos?: { name: string; authorAttributions?: { displayName?: string }[] }[];
  websiteUri?: string;
  internationalPhoneNumber?: string;
  reviews?: { rating?: number; text?: { text?: string }; originalText?: { text?: string } }[];
  editorialSummary?: { text?: string };
  servesBeer?: boolean;
  servesWine?: boolean;
}

export async function placeDetails(placeId: string, opts: { forAnalysis?: boolean } = {}): Promise<PlaceDetails> {
  if (!isGooglePlaceId(placeId)) throw new HttpError(409, 'That place comes from OpenStreetMap, so Google has no details for it.');
  const fields = opts.forAnalysis ? [...BASE_FIELDS, ...ANALYSIS_FIELDS] : BASE_FIELDS;
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': requireEnv('GOOGLE_MAPS_SERVER_KEY'), 'X-Goog-FieldMask': fields.join(',') },
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  if (!res?.ok) throw new HttpError(res?.status === 404 ? 404 : 502, 'Could not load that place from Google Maps.');
  const p = (await res.json()) as RawPlace;
  if (!p.location) throw new HttpError(422, 'That place has no location.');

  const types = (p.types ?? []).slice(0, 20);
  const photo = p.photos?.[0];
  const place: IdeaPlace = {
    placeId: p.id,
    name: (p.displayName?.text ?? 'Place').slice(0, 200),
    ...(p.formattedAddress ? { address: p.formattedAddress.slice(0, 300) } : {}),
    location: { lat: p.location.latitude, lng: p.location.longitude },
    category: categorize(types, p.primaryType),
    ...(p.primaryTypeDisplayName?.text ? { typeLabel: p.primaryTypeDisplayName.text.slice(0, 80) } : {}),
    types,
    ...(p.regularOpeningHours?.weekdayDescriptions ? { openingHours: p.regularOpeningHours.weekdayDescriptions.slice(0, 7) } : {}),
    ...(p.priceLevel && p.priceLevel in PRICE ? { priceLevel: PRICE[p.priceLevel] } : {}),
    ...(p.rating !== undefined ? { rating: p.rating } : {}),
    ...(p.userRatingCount !== undefined ? { ratingCount: p.userRatingCount } : {}),
    ...(p.websiteUri && p.websiteUri.length <= 500 ? { website: p.websiteUri } : {}),
    ...(p.internationalPhoneNumber && p.internationalPhoneNumber.length <= 40 ? { phone: p.internationalPhoneNumber } : {}),
    ...(photo ? { photoName: photo.name.slice(0, 600) } : {}),
    ...(photo?.authorAttributions?.[0]?.displayName ? { photoAttribution: photo.authorAttributions[0].displayName.slice(0, 200) } : {}),
    fetchedAt: Date.now(),
  };
  return {
    place,
    primaryType: p.primaryType,
    reviews: (p.reviews ?? [])
      .map((r) => ({ rating: r.rating, text: (r.originalText?.text ?? r.text?.text ?? '').slice(0, 1200) }))
      .filter((r) => r.text),
    editorialSummary: p.editorialSummary?.text,
    servesBeer: p.servesBeer,
    servesWine: p.servesWine,
  };
}

/** Text search biased to an area (e.g. the trip destination). */
export async function searchPlace(query: string, near?: GeoPoint): Promise<(PlaceRef & { types?: string[] }) | null> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': requireEnv('GOOGLE_MAPS_SERVER_KEY'),
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types',
    },
    body: JSON.stringify({
      textQuery: query.slice(0, 200),
      pageSize: 1,
      ...(near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000 } } } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const p = ((await res.json()) as { places?: RawPlace[] }).places?.[0];
  if (!p?.location) return null;
  return {
    placeId: p.id,
    name: (p.displayName?.text ?? query).slice(0, 200),
    ...(p.formattedAddress ? { address: p.formattedAddress.slice(0, 300) } : {}),
    location: { lat: p.location.latitude, lng: p.location.longitude },
    types: p.types,
  };
}

/** Great-circle distance in km. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Photo lookups allowed per month, app-wide (GOOGLE_PHOTOS_MONTHLY_CAP) — keep it under Google's free allowance. */
export const photoCap = () => Number(process.env.GOOGLE_PHOTOS_MONTHLY_CAP) || 800;
const photoKey = () => `apiUsage/googlePhotos_${new Date().toISOString().slice(0, 7)}`;

/** Takes one photo lookup from this month's allowance; false when it's used up. */
async function takePhoto(): Promise<boolean> {
  const ref = adminDb().doc(photoKey());
  return adminDb()
    .runTransaction(async (tx) => {
      const used = Number((await tx.get(ref)).get('count') ?? 0);
      if (used >= photoCap()) return false;
      tx.set(ref, { count: FieldValue.increment(1), updatedAt: Date.now() }, { merge: true });
      return true;
    })
    .catch(() => false);
}

export async function photoUsage(): Promise<{ used: number; cap: number }> {
  return { used: Number((await adminDb().doc(photoKey()).get()).get('count') ?? 0), cap: photoCap() };
}

/**
 * Resolves a Places photo to its direct image URL (one billed call). The
 * media endpoint's redirect can't be cached, so linking it from <img> would
 * bill a photo call on EVERY card view; the direct URL is cacheable.
 */
export async function photoUrl(photoName: string, maxWidthPx = 640): Promise<string | null> {
  // Each call is a billed "Place Details Photos" request: past this month's allowance, no photo (cards show a placeholder).
  if (!(await takePhoto())) return null;
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`;
  const res = await fetch(url, { headers: { 'X-Goog-Api-Key': requireEnv('GOOGLE_MAPS_SERVER_KEY') }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as { photoUri?: string } | null;
  return body?.photoUri?.startsWith('https://') ? body.photoUri : null;
}

/**
 * Closest places of the given Google types around a point (nearest first):
 * Google while today's budget lasts and it answers, else the backup sources
 * (Geoapify → OpenStreetMap → remembered places). null only if all failed.
 */
export async function searchNearby(center: GeoPoint, includedTypes: string[], radiusM: number, max = 5): Promise<{ placeId: string; name: string; location: GeoPoint; types: string[]; source?: PlaceSource }[] | null> {
  return cachedSearch(['n', center, includedTypes, radiusM, max], () => liveNearby(center, includedTypes, radiusM, max));
}

/** The same search around the same spot (~110 m) within a week: answered from Firestore, no call at all. */
const SEARCH_CACHE_MS = 7 * 86_400_000;
async function cachedSearch<T>(key: [string, GeoPoint, string[], number, number], run: () => Promise<T[] | null>): Promise<T[] | null> {
  const [kind, at, types, radius, max] = key;
  const id = `${kind}_${at.lat.toFixed(3)}_${at.lng.toFixed(3)}_${Math.round(radius)}_${max}_${[...types].sort().join('.')}`.replace(/\//g, '_').slice(0, 1400);
  const ref = adminDb().doc(`searchCache/${id}`);
  const hit = (await ref.get().catch(() => null))?.data();
  if (hit && Date.now() - Number(hit.at) < SEARCH_CACHE_MS) return hit.places as T[];
  const found = await run();
  // Only real answers are kept (a failure, or nothing found, is asked again next time).
  if (found?.length) await ref.set({ at: Date.now(), places: found }).catch(() => {});
  return found;
}

async function liveNearby(center: GeoPoint, includedTypes: string[], radiusM: number, max: number) {
  if (await takeGoogle('nearby')) {
    const found = await googleNearby(center, includedTypes, radiusM, max);
    if (found) {
      await rememberPlaces(includedTypes, found.map((p) => ({ ...p, source: 'google' as const })), 'google');
      return found;
    }
  }
  return openNearby(center, includedTypes, radiusM, max);
}

async function googleNearby(
  center: GeoPoint,
  includedTypes: string[],
  radiusM: number,
  max = 5,
): Promise<{ placeId: string; name: string; location: GeoPoint; types: string[] }[] | null> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': requireEnv('GOOGLE_MAPS_SERVER_KEY'),
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.types',
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: max,
      rankPreference: 'DISTANCE',
      locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusM } },
    }),
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  if (!res?.ok) return null; // unknown, not "none nearby"
  const places = ((await res.json()) as { places?: RawPlace[] }).places ?? [];
  return places
    .filter((p) => p.location && p.displayName?.text)
    .map((p) => ({
      placeId: p.id,
      name: p.displayName!.text.slice(0, 200),
      location: { lat: p.location!.latitude, lng: p.location!.longitude },
      types: p.types ?? [],
    }));
}

export interface NearbyFood {
  placeId: string;
  name: string;
  location: GeoPoint;
  types: string[];
  typeLabel?: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: number;
  openNow?: boolean;
  phone?: string;
  photoName?: string;
  /** Where it came from when not Google (credited in the app). */
  source?: PlaceSource;
}

/** A backup-source place as a food list item (no rating / price: open data doesn't have them). */
const openToFood = (p: OpenPlace): NearbyFood => ({ placeId: p.placeId, name: p.name, location: p.location, types: p.types, source: p.source });

const FOOD_FIELDS =
  'places.id,places.displayName,places.location,places.types,places.primaryTypeDisplayName,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours.openNow,places.internationalPhoneNumber,places.photos';

type RawFood = RawPlace & { currentOpeningHours?: { openNow?: boolean } };

const toFood = (p: RawFood): NearbyFood => ({
  placeId: p.id,
  name: p.displayName!.text.slice(0, 200),
  location: { lat: p.location!.latitude, lng: p.location!.longitude },
  types: p.types ?? [],
  ...(p.primaryTypeDisplayName?.text ? { typeLabel: p.primaryTypeDisplayName.text.slice(0, 80) } : {}),
  ...(p.rating !== undefined ? { rating: p.rating } : {}),
  ...(p.userRatingCount !== undefined ? { ratingCount: p.userRatingCount } : {}),
  ...(p.priceLevel && p.priceLevel in PRICE ? { priceLevel: PRICE[p.priceLevel as keyof typeof PRICE] } : {}),
  ...(p.currentOpeningHours?.openNow !== undefined ? { openNow: p.currentOpeningHours.openNow } : {}),
  ...(p.internationalPhoneNumber ? { phone: p.internationalPhoneNumber.slice(0, 40) } : {}),
  ...(p.photos?.[0]?.name ? { photoName: p.photos[0].name } : {}),
});

async function foodRequest(endpoint: 'searchNearby' | 'searchText', body: object): Promise<NearbyFood[] | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places:${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': requireEnv('GOOGLE_MAPS_SERVER_KEY'), 'X-Goog-FieldMask': FOOD_FIELDS },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const places = ((await res.json()) as { places?: RawFood[] }).places ?? [];
  return places.filter((p) => p.location && p.displayName?.text).map(toFood);
}

/**
 * Places to eat around a point, with what a food list needs (rating, price,
 * open now, phone, photo). `rank` = nearest first or most popular. null = lookup failed.
 */
export async function searchNearbyFood(center: GeoPoint, includedTypes: string[], radiusM: number, max = 20, rank: 'DISTANCE' | 'POPULARITY' = 'DISTANCE'): Promise<NearbyFood[] | null> {
  return cachedSearch([`f${rank[0]}`, center, includedTypes, radiusM, max], () => liveNearbyFood(center, includedTypes, radiusM, max, rank));
}

async function liveNearbyFood(center: GeoPoint, includedTypes: string[], radiusM: number, max: number, rank: 'DISTANCE' | 'POPULARITY'): Promise<NearbyFood[] | null> {
  if (await takeGoogle('nearby')) {
    const found = await googleNearbyFood(center, includedTypes, radiusM, max, rank);
    if (found) {
      await rememberPlaces(includedTypes, found.map((p) => ({ ...p, source: 'google' as const })), 'google');
      return found;
    }
  }
  return (await openNearby(center, includedTypes, radiusM, max))?.map(openToFood) ?? null;
}

async function googleNearbyFood(center: GeoPoint, includedTypes: string[], radiusM: number, max: number, rank: 'DISTANCE' | 'POPULARITY'): Promise<NearbyFood[] | null> {
  return foodRequest('searchNearby', {
    includedTypes,
    maxResultCount: max,
    rankPreference: rank,
    locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusM } },
  });
}

/** Restaurants matching words ("halal", "muslim") around a point — catches places whose type doesn't say halal. */
export async function searchFoodText(center: GeoPoint, query: string, radiusM: number, max = 20): Promise<NearbyFood[] | null> {
  if (await takeGoogle('text')) {
    const found = await googleFoodText(center, query, radiusM, max);
    if (found) return found;
  }
  // "halal food" → halal restaurants, "prayer room" → mosques / prayer rooms, from the backups.
  const kinds = textKinds(query);
  return kinds.length ? ((await openNearby(center, kinds, radiusM, max))?.map(openToFood) ?? null) : null;
}

async function googleFoodText(center: GeoPoint, query: string, radiusM: number, max: number): Promise<NearbyFood[] | null> {
  return foodRequest('searchText', {
    textQuery: query,
    pageSize: max,
    locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusM } },
  });
}

// ─── Photos from open sources, when Google's are used up or missing ─────────

export interface FoundPhoto {
  url: string;
  attribution: string;
}

const similar = (a: string, b: string) => {
  // "Sensō-ji" matches "Senso-ji Temple": accents dropped, punctuation to spaces.
  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const [x, y] = [norm(a), norm(b)];
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const wa = new Set(x.split(' ').filter((w) => w.length > 2));
  return y.split(' ').filter((w) => w.length > 2 && wa.has(w)).length >= 1;
};

/** A Wikipedia / Wikimedia photo of a landmark near `at` whose article matches its name (free; credit Wikipedia). */
export async function wikipediaPhoto(name: string, at: GeoPoint, width: number): Promise<FoundPhoto | null> {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  const params: Record<string, string> = { action: 'query', format: 'json', origin: '*', generator: 'geosearch', ggscoord: `${at.lat}|${at.lng}`, ggsradius: '400', ggslimit: '10', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: String(width) };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'user-agent': 'SafarApp/1.0 (travel planner)' }, signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as { query?: { pages?: Record<string, { title: string; thumbnail?: { source: string } }> } } | null;
  const hit = Object.values(body?.query?.pages ?? {}).find((p) => p.thumbnail?.source && similar(p.title, name));
  return hit ? { url: hit.thumbnail!.source, attribution: 'Wikipedia' } : null;
}

/** A street-level photo right at the spot (Mapillary, MAPILLARY_TOKEN; credit Mapillary). */
async function mapillaryPhoto(at: GeoPoint): Promise<FoundPhoto | null> {
  const token = optionalEnv('MAPILLARY_TOKEN');
  if (!token) return null;
  const d = 0.0006;
  const url = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}&fields=id,thumb_1024_url&bbox=${at.lng - d},${at.lat - d},${at.lng + d},${at.lat + d}&limit=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!res?.ok) return null;
  const img = ((await res.json().catch(() => null)) as { data?: { thumb_1024_url?: string }[] } | null)?.data?.[0];
  return img?.thumb_1024_url ? { url: img.thumb_1024_url, attribution: 'Mapillary' } : null;
}

/**
 * A photo for a place: Google's (while this month's photo allowance lasts),
 * else Wikipedia for landmarks, else a Mapillary street photo. null → the app
 * shows a map preview of the spot instead.
 */
export async function anyPhoto(o: { photoName?: string; name: string; location: GeoPoint; width?: number }): Promise<FoundPhoto | null> {
  const width = o.width ?? 640;
  if (o.photoName) {
    const url = await photoUrl(o.photoName, width);
    if (url) return { url, attribution: 'Google' };
  }
  return (await wikipediaPhoto(o.name, o.location, width).catch(() => null)) ?? (await mapillaryPhoto(o.location).catch(() => null));
}

/**
 * An idea's place from Google (full details) when it's a Google place and
 * Google answers — else from what the backup source gave (name, spot, kind),
 * with an open photo. Never throws for a backup place.
 */
export async function ideaPlaceFrom(ref: { placeId?: string; osmId?: string; name: string; location: GeoPoint; types?: string[]; typeLabel?: string; address?: string }): Promise<IdeaPlace> {
  if (isGooglePlaceId(ref.placeId)) {
    const details = await placeDetails(ref.placeId!).catch(() => null);
    if (details) {
      const photo = await anyPhoto({ photoName: details.place.photoName, name: details.place.name, location: details.place.location });
      return { ...details.place, ...(photo ? { photoUrl: photo.url, photoUrlAt: Date.now(), ...(photo.attribution !== 'Google' ? { photoAttribution: photo.attribution } : {}) } : {}) };
    }
  }
  const types = (ref.types ?? []).slice(0, 20);
  const photo = await anyPhoto({ name: ref.name, location: ref.location });
  const osmId = ref.osmId ?? (ref.placeId?.startsWith('osm_') ? ref.placeId.slice(4).replace('_', '/') : undefined);
  return {
    name: ref.name.slice(0, 200),
    location: ref.location,
    ...(osmId ? { osmId } : {}),
    ...(ref.address ? { address: ref.address.slice(0, 300) } : {}),
    category: categorize(types),
    types,
    ...(ref.typeLabel ? { typeLabel: ref.typeLabel.slice(0, 80) } : {}),
    ...(photo ? { photoUrl: photo.url, photoUrlAt: Date.now(), photoAttribution: photo.attribution } : {}),
    fetchedAt: Date.now(),
  };
}
