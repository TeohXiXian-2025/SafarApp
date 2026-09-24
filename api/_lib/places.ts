// Google Places (New) — place details for ideas, plus biased text search.
import type { GeoPoint, IdeaCategory, IdeaPlace, PlaceRef } from '../../src/domain/index.js';
import { requireEnv } from './env.js';
import { HttpError } from './http.js';

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
  food: 75,
  attraction: 90,
  activity: 120,
  shopping: 90,
  nature: 120,
  culture: 75,
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
  reviews?: { rating?: number; text?: { text?: string }; originalText?: { text?: string } }[];
  editorialSummary?: { text?: string };
  servesBeer?: boolean;
  servesWine?: boolean;
}

export async function placeDetails(placeId: string, opts: { forAnalysis?: boolean } = {}): Promise<PlaceDetails> {
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
    ...(photo ? { photoName: photo.name.slice(0, 600) } : {}),
    ...(photo?.authorAttributions?.[0]?.displayName ? { photoAttribution: photo.authorAttributions[0].displayName.slice(0, 200) } : {}),
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

/**
 * Resolves a Places photo to its direct image URL (one billed call). The
 * media endpoint's redirect can't be cached, so linking it from <img> would
 * bill a photo call on EVERY card view; the direct URL is cacheable.
 */
export async function photoUrl(photoName: string, maxWidthPx = 640): Promise<string | null> {
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`;
  const res = await fetch(url, { headers: { 'X-Goog-Api-Key': requireEnv('GOOGLE_MAPS_SERVER_KEY') }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as { photoUri?: string } | null;
  return body?.photoUri?.startsWith('https://') ? body.photoUri : null;
}

/** Closest places of the given Google types around a point (nearest first); null if the lookup failed. */
export async function searchNearby(
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
