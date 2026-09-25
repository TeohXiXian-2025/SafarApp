// The Food tab — Halal Radar near you (or near a stop on the timeline):
//   food/nearby  restaurants around a point, bucketed Halal / Pork-free / Not checked
//   food/check   run the full Halal Radar on one of them (cached for everyone 14 days)
//   food/wait    "how long is the queue right now" — member reports, gone after an hour
import { z } from 'zod';
import {
  estimateTravelMin,
  foodVerdict,
  GeoPoint,
  HalalSummary,
  metersBetween,
  nameSaysHalal,
  paths,
  WAIT_TTL_MS,
  type FoodVerdict,
  type HalalAssessment,
} from '../../src/domain/index.js';
import { cachedAnalyses, cachedAnalysis, runAnalysis } from '../_lib/analysis.js';
import { withTrip } from '../_lib/auth.js';
import { adminDb } from '../_lib/firebaseAdmin.js';
import { osmPoint, overpass, similarName } from '../_lib/halal.js';
import { HttpError, json, readJson } from '../_lib/http.js';
import { photoUrl, searchFoodText, searchNearbyFood, type NearbyFood } from '../_lib/places.js';
import { useDailyQuota } from '../_lib/quota.js';
import type { RouteTable } from '../_lib/routes.js';

const RADIUS_M = 1200;
/** Text-search results can come from further away (it's only a bias) — keep what's reachable. */
const MAX_TEXT_M = 3000;
/** Same area (~110 m grid) within this long reuses the last search — saves Maps quota for the group. */
const CACHE_MS = 30 * 60_000;
/** A place's photo link, resolved once (one billed call) and reused. */
const PHOTO_TTL_MS = 7 * 86_400_000;
const PHOTOS_PER_SEARCH = 24;
const waitRef = (placeKey: string) => adminDb().collection(`waitReports/${placeKey}/reports`);

/** Restaurants around a point from several angles: nearest, most popular, halal-typed, and "halal" by name / cuisine. */
async function findFood(at: GeoPoint): Promise<{ places: NearbyFood[]; halalIds: string[] } | null> {
  const cell = `${at.lat.toFixed(3)}_${at.lng.toFixed(3)}`;
  const ref = adminDb().doc(`foodSearchCache/${cell}`);
  const cached = (await ref.get()).data();
  if (cached && Date.now() - Number(cached.at) < CACHE_MS) return { places: cached.places as NearbyFood[], halalIds: cached.halalIds as string[] };
  const MEALS = ['restaurant', 'fast_food_restaurant', 'food_court'];
  const [nearest, popular, snacks, halalTyped, halalNamed, cuisines] = await Promise.all([
    searchNearbyFood(at, MEALS, RADIUS_M, 20),
    searchNearbyFood(at, MEALS, RADIUS_M * 1.5, 20, 'POPULARITY'),
    searchNearbyFood(at, ['cafe', 'bakery'], RADIUS_M, 10),
    searchNearbyFood(at, ['halal_restaurant'], RADIUS_M * 2, 20),
    searchFoodText(at, 'halal food', MAX_TEXT_M, 20),
    // Cuisines that are usually halal (Middle Eastern, Turkish, Pakistani, Indonesian, …).
    searchNearbyFood(at, ['middle_eastern_restaurant', 'turkish_restaurant', 'lebanese_restaurant', 'afghani_restaurant', 'indonesian_restaurant', 'indian_restaurant'], RADIUS_M * 2, 20),
  ]);
  if (!nearest && !popular && !halalTyped) return null;
  // Only Google's own halal type counts as a listing; name / cuisine matches are just candidates to check.
  const halalIds = (halalTyped ?? []).map((p) => p.placeId);
  const all = new Map<string, NearbyFood>();
  for (const p of [...(halalTyped ?? []), ...(halalNamed ?? []).filter((x) => metersBetween(at, x.location) <= MAX_TEXT_M), ...(nearest ?? []), ...(popular ?? []), ...(cuisines ?? []), ...(snacks ?? [])]) {
    if (!all.has(p.placeId)) all.set(p.placeId, p);
  }
  const places = [...all.values()];
  await ref.set({ at: Date.now(), places, halalIds }).catch(() => {});
  return { places, halalIds };
}

/** Direct photo links for the list (cached per place; a few new ones resolved per search). */
async function photosFor(items: { placeKey: string; photoName?: string }[]): Promise<Map<string, string>> {
  const db = adminDb();
  const withPhoto = items.filter((i) => i.photoName);
  if (!withPhoto.length) return new Map();
  const snaps = await db.getAll(...withPhoto.map((i) => db.doc(`placePhotos/${i.placeKey}`)));
  const out = new Map<string, string>();
  const missing: typeof withPhoto = [];
  snaps.forEach((snap, k) => {
    const url = snap.get('url') as string | undefined;
    if (url && Date.now() - Number(snap.get('at')) < PHOTO_TTL_MS) out.set(withPhoto[k].placeKey, url);
    else missing.push(withPhoto[k]);
  });
  await Promise.all(
    missing.slice(0, PHOTOS_PER_SEARCH).map(async (i) => {
      const url = await photoUrl(i.photoName!, 400);
      if (!url) return;
      out.set(i.placeKey, url);
      await db.doc(`placePhotos/${i.placeKey}`).set({ url, at: Date.now() }).catch(() => {});
    }),
  );
  return out;
}

export interface FoodItem extends NearbyFood {
  placeKey: string;
  distanceM: number;
  walkMin: number;
  verdict: FoodVerdict;
  pork?: boolean;
  alcohol?: boolean;
  /** Latest queue report within the hour. */
  wait?: { minutes: number; agoMin: number };
  /** Already on this trip's Idea Board. */
  ideaId?: string;
  checked: boolean;
  /** Direct photo link (cached). */
  photo?: string;
}

function toItem(p: NearbyFood, at: GeoPoint, ctx: { analysis?: HalalAssessment; community?: HalalSummary; listed: 'google' | 'osm' | 'name' | null; wait?: FoodItem['wait']; ideaId?: string }): FoodItem {
  const flags = { ...(ctx.analysis?.flags ?? {}), ...(ctx.community?.flags ?? {}) };
  return {
    ...p,
    placeKey: paths.placeKey({ placeId: p.placeId }),
    distanceM: Math.round(metersBetween(at, p.location)),
    walkMin: estimateTravelMin(at, p.location),
    verdict: foodVerdict({ community: ctx.community ?? null, analysis: ctx.analysis ?? null, listed: ctx.listed }),
    ...(flags.servesPork !== undefined ? { pork: flags.servesPork } : {}),
    ...(flags.servesAlcohol !== undefined ? { alcohol: flags.servesAlcohol } : {}),
    ...(ctx.wait ? { wait: ctx.wait } : {}),
    ...(ctx.ideaId ? { ideaId: ctx.ideaId } : {}),
    checked: !!ctx.analysis,
  };
}

export const foodRoutes: RouteTable = {
  'POST food/nearby': withTrip(
    async (req, { tripId, member }) => {
      const at = await readJson(req, GeoPoint);
      await useDailyQuota(member.uid, 'food');
      const db = adminDb();
      const [found, osm, ideas] = await Promise.all([
        findFood(at),
        // OpenStreetMap is a bonus source — don't let a slow Overpass server hold up the list.
        Promise.race([overpass(at), new Promise<null>((r) => setTimeout(() => r(null), 3500))]),
        db.collection(paths.ideas(tripId)).select('place.placeId').get(),
      ]);
      if (!found) throw new HttpError(502, "Couldn't search Google Maps right now — try again in a moment.");
      const places = found.places;
      const halalIds = new Set(found.halalIds);
      const osmHalal = (osm ?? []).filter((e) => /yes|only/.test(e.tags?.['diet:halal'] ?? '') && e.tags?.name);
      const onBoard = new Map(ideas.docs.map((d) => [d.get('place.placeId') as string, d.id]));

      const keys = places.map((p) => paths.placeKey({ placeId: p.placeId }));
      const [analyses, summaries, waits] = await Promise.all([
        cachedAnalyses(keys),
        db.getAll(...keys.map((k) => db.doc(paths.halalSummary(k)))),
        Promise.all(keys.map((k) => waitRef(k).where('at', '>', Date.now() - WAIT_TTL_MS).orderBy('at', 'desc').limit(1).get())),
      ]);
      const items = places.map((p, i) => {
        const osmHit = osmHalal.some((e) => {
          const loc = osmPoint(e);
          return loc && metersBetween(loc, p.location) < 120 && similarName(e.tags!.name!, p.name);
        });
        const listed = halalIds.has(p.placeId) || p.types.includes('halal_restaurant') ? 'google' : osmHit ? 'osm' : nameSaysHalal(p.name) ? 'name' : null;
        const summary = summaries[i].exists ? HalalSummary.safeParse(summaries[i].data()) : null;
        const w = waits[i].docs[0]?.data();
        return toItem(p, at, {
          analysis: analyses.get(keys[i])?.halal,
          ...(summary?.success ? { community: summary.data } : {}),
          listed,
          ...(w ? { wait: { minutes: Number(w.minutes), agoMin: Math.round((Date.now() - Number(w.at)) / 60_000) } } : {}),
          ...(onBoard.has(p.placeId) ? { ideaId: onBoard.get(p.placeId) } : {}),
        });
      });
      items.sort((a, b) => a.distanceM - b.distanceM);
      const photos = await photosFor(items);
      return json({ items: items.map((i) => (photos.has(i.placeKey) ? { ...i, photo: photos.get(i.placeKey) } : i)) });
    },
    { perMinute: 12 },
  ),

  /** Full Halal Radar for one restaurant (reviews, website, listings, nearby mosques). */
  'POST food/check': withTrip(
    async (req, { member }) => {
      const { placeId } = await readJson(req, z.object({ placeId: z.string().min(3).max(300) }));
      const placeKey = paths.placeKey({ placeId });
      let result = await cachedAnalysis(placeKey);
      if (!result) {
        await useDailyQuota(member.uid, 'analyze');
        result = await runAnalysis(placeId, placeKey);
      }
      const summary = (await adminDb().doc(paths.halalSummary(placeKey)).get()).data();
      const community = summary ? HalalSummary.safeParse(summary) : null;
      const listed = result.halal.source === 'google' ? 'google' : result.halal.source === 'osm' ? 'osm' : null;
      return json({
        verdict: foodVerdict({ community: community?.success ? community.data : null, analysis: result.halal, listed }),
        halal: result.halal,
        ...(result.sentiment ? { sentiment: result.sentiment } : {}),
      });
    },
    { perMinute: 10 },
  ),

  /** "The queue is about N minutes right now" (0 = walk right in). */
  'POST food/wait': withTrip(
    async (req, { member }) => {
      const { placeId, minutes } = await readJson(req, z.object({ placeId: z.string().min(3).max(300), minutes: z.number().int().min(0).max(180) }));
      await waitRef(paths.placeKey({ placeId })).doc(member.uid).set({ minutes, at: Date.now() });
      return json({ ok: true });
    },
    { perMinute: 20 },
  ),
};
