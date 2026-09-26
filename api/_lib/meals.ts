// Halal restaurants for a meal slot (AI Arrange's lunch / dinner, and the
// timeline's "no lunch planned" suggestions): Google's halal-typed places and
// a "halal restaurant" text search around where the group is, ranked by what
// every Safar trip has learnt about them (community reports + cached Halal
// Radar results), then listing, rating and distance. Cached per ~110 m cell.
import { estimateTravelMin, foodVerdict, HalalSummary, metersBetween, nameSaysHalal, paths, type FoodVerdict, type GeoPoint } from '../../src/domain/index.js';
import { cachedAnalyses } from './analysis.js';
import { adminDb } from './firebaseAdmin.js';
import { searchFoodText, searchNearbyFood, type NearbyFood } from './places.js';

const CACHE_MS = 7 * 86_400_000;
const RADIUS_M = 1500;
const BUCKET_RANK: Record<FoodVerdict['bucket'], number> = { certified: 0, halal: 1, likely: 2, friendly: 3, pork_free: 4, unknown: 5, not_halal: 9 };

export interface MealPlace {
  placeId: string;
  name: string;
  location: GeoPoint;
  typeLabel?: string;
  rating?: number;
  ratingCount?: number;
  phone?: string;
  walkMin: number;
  verdict: FoodVerdict;
}

async function candidates(at: GeoPoint): Promise<NearbyFood[]> {
  const ref = adminDb().doc(`mealCache/${at.lat.toFixed(3)}_${at.lng.toFixed(3)}`);
  const cached = (await ref.get()).data();
  if (cached && Date.now() - Number(cached.at) < CACHE_MS) return cached.places as NearbyFood[];
  const [typed, text] = await Promise.all([searchNearbyFood(at, ['halal_restaurant'], RADIUS_M, 10), searchFoodText(at, 'halal restaurant', RADIUS_M, 10)]);
  const all = new Map<string, NearbyFood>();
  for (const p of [...(typed ?? []), ...(text ?? [])]) if (metersBetween(at, p.location) <= RADIUS_M * 1.5 && !all.has(p.placeId)) all.set(p.placeId, p);
  const places = [...all.values()];
  if (typed || text) await ref.set({ at: Date.now(), places }).catch(() => {});
  return places;
}

/** The best halal places to eat near `at`, best first (never ones reported as not halal). */
export async function mealPlaces(at: GeoPoint, max = 5): Promise<MealPlace[]> {
  const places = await candidates(at);
  if (!places.length) return [];
  const db = adminDb();
  const keys = places.map((p) => paths.placeKey({ placeId: p.placeId }));
  const [analyses, summaries] = await Promise.all([cachedAnalyses(keys), db.getAll(...keys.map((k) => db.doc(paths.halalSummary(k))))]);
  return places
    .map((p, i) => {
      const s = summaries[i].exists ? HalalSummary.safeParse(summaries[i].data()) : null;
      const listed = p.types.includes('halal_restaurant') ? 'google' : nameSaysHalal(p.name) ? 'name' : null;
      const verdict = foodVerdict({ community: s?.success ? s.data : null, analysis: analyses.get(keys[i])?.halal ?? null, listed });
      return {
        placeId: p.placeId,
        name: p.name,
        location: p.location,
        ...(p.typeLabel ? { typeLabel: p.typeLabel } : {}),
        ...(p.rating !== undefined ? { rating: p.rating } : {}),
        ...(p.ratingCount !== undefined ? { ratingCount: p.ratingCount } : {}),
        ...(p.phone ? { phone: p.phone } : {}),
        walkMin: estimateTravelMin(at, p.location),
        verdict,
      };
    })
    .filter((m) => m.verdict.bucket !== 'not_halal' && m.verdict.bucket !== 'pork_free')
    .sort(
      (a, b) =>
        BUCKET_RANK[a.verdict.bucket] - BUCKET_RANK[b.verdict.bucket] ||
        // Good and well-reviewed, but not a long way off.
        (b.rating ?? 3.5) * Math.log10(10 + (b.ratingCount ?? 0)) - b.walkMin / 10 - ((a.rating ?? 3.5) * Math.log10(10 + (a.ratingCount ?? 0)) - a.walkMin / 10),
    )
    .slice(0, max);
}
