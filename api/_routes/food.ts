// The Food tab — Halal Radar near you (or near a stop on the timeline):
//   food/nearby  restaurants around a point, bucketed Halal / Pork-free / Not checked
//   food/check   run the full Halal Radar on one of them (cached for everyone 14 days)
//   food/wait    "how long is the queue right now" — member reports, gone after an hour
//   food/prescreen  one AI guess per batch of unchecked places from name & cuisine (cached 30 days)
//   food/autocheck  full Halal Radar on the nearest few / a whole tab (capped per day for the app)
//   food/report     "I ate here" community report straight from a food card
import { z } from 'zod';
import {
  estimateTravelMin,
  foodVerdict,
  HalalReport,
  HalalTier,
  type FoodGuess,
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
import { Type } from '@google/genai';
import { extractJson } from '../_lib/gemini.js';
import { optionalEnv } from '../_lib/env.js';
import { recomputeSummary } from './ideas.js';

/** AI guesses per place are kept this long (shared by every trip). */
const GUESS_TTL_MS = 30 * 86_400_000;
const guessRef = (placeKey: string) => adminDb().doc(`foodGuess/${placeKey}`);
/**
 * Full checks started automatically or for a whole tab, for the whole app per
 * day. Each needs a Google Place Details call with reviews (~1,000 free a
 * month), which idea checks and manual checks also use — so keep ~450/month here.
 */
const AUTO_CHECKS_PER_DAY = 15;
const AUTO_PER_REQUEST = 10;

/** Takes `n` from today's app-wide allowance (Upstash, else a Firestore counter). Returns how many you got. */
async function takeAutoChecks(n: number): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const url = optionalEnv('UPSTASH_REDIS_REST_URL');
  const token = optionalEnv('UPSTASH_REDIS_REST_TOKEN');
  if (url && token) {
    const key = `food:autocheck:${day}`;
    const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify([['INCRBY', key, n], ['EXPIRE', key, 2 * 86400]]),
      signal: AbortSignal.timeout(1500),
    }).catch(() => null);
    if (res?.ok) {
      const used = Number(((await res.json()) as { result: number }[])[0]?.result ?? 0);
      return Math.max(0, Math.min(n, AUTO_CHECKS_PER_DAY - (used - n)));
    }
  }
  const ref = adminDb().doc(`apiUsage/foodAutocheck_${day}`);
  return adminDb().runTransaction(async (tx) => {
    const used = Number((await tx.get(ref)).get('count') ?? 0);
    const got = Math.max(0, Math.min(n, AUTO_CHECKS_PER_DAY - used));
    if (got) tx.set(ref, { count: used + got, updatedAt: Date.now() }, { merge: true });
    return got;
  });
}

/** Today's use of the automatic checks (for the usage card). */
export async function autoCheckUsage(): Promise<{ used: number; cap: number }> {
  const day = new Date().toISOString().slice(0, 10);
  const url = optionalEnv('UPSTASH_REDIS_REST_URL');
  const token = optionalEnv('UPSTASH_REDIS_REST_TOKEN');
  let used = 0;
  if (url && token) {
    const res = await fetch(`${url.replace(/\/$/, '')}/get/food:autocheck:${day}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1500) }).catch(() => null);
    used = res?.ok ? Number(((await res.json()) as { result: string | null }).result ?? 0) : 0;
  } else used = Number((await adminDb().doc(`apiUsage/foodAutocheck_${day}`).get()).get('count') ?? 0);
  return { used: Math.min(used, AUTO_CHECKS_PER_DAY), cap: AUTO_CHECKS_PER_DAY };
}

async function cachedGuesses(keys: string[]): Promise<Map<string, FoodGuess>> {
  if (!keys.length) return new Map();
  const snaps = await adminDb().getAll(...keys.map(guessRef));
  const out = new Map<string, FoodGuess>();
  snaps.forEach((s, i) => {
    const d = s.data();
    if (d && Date.now() - Number(d.at) < GUESS_TTL_MS) out.set(keys[i], { verdict: d.verdict, reason: d.reason });
  });
  return out;
}

/** The full Halal Radar result for one place as a food-card update. */
async function checkOne(placeId: string) {
  const placeKey = paths.placeKey({ placeId });
  const result = (await cachedAnalysis(placeKey)) ?? (await runAnalysis(placeId, placeKey));
  const summary = (await adminDb().doc(paths.halalSummary(placeKey)).get()).data();
  const community = summary ? HalalSummary.safeParse(summary) : null;
  const listed = result.halal.source === 'google' ? 'google' : result.halal.source === 'osm' ? 'osm' : null;
  return {
    placeId,
    verdict: foodVerdict({ community: community?.success ? community.data : null, analysis: result.halal, listed }),
    pork: result.halal.flags.servesPork,
    alcohol: result.halal.flags.servesAlcohol,
  };
}

const RADIUS_M = 1200;
/** Text-search results can come from further away (it's only a bias) — keep what's reachable. */
const MAX_TEXT_M = 3000;
/** Same area (~110 m grid) within this long reuses the last search — saves Maps quota for the group. */
const CACHE_MS = 30 * 60_000;
/** A place's photo link, resolved once (one billed call) and reused. */
const PHOTO_TTL_MS = 7 * 86_400_000;
const PHOTOS_PER_SEARCH = 12;
const PHOTOS_PER_REQUEST = 30;
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
async function photosFor(items: { placeKey: string; photoName?: string }[], max = PHOTOS_PER_SEARCH): Promise<Map<string, string>> {
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
    missing.slice(0, max).map(async (i) => {
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
  /** The AI pre-screen already looked at it. */
  guessed: boolean;
  /** Direct photo link (cached). */
  photo?: string;
}

function toItem(p: NearbyFood, at: GeoPoint, ctx: { analysis?: HalalAssessment; community?: HalalSummary; listed: 'google' | 'osm' | 'name' | null; guess?: FoodGuess; wait?: FoodItem['wait']; ideaId?: string }): FoodItem {
  const flags = { ...(ctx.analysis?.flags ?? {}), ...(ctx.community?.flags ?? {}) };
  return {
    ...p,
    placeKey: paths.placeKey({ placeId: p.placeId }),
    distanceM: Math.round(metersBetween(at, p.location)),
    walkMin: estimateTravelMin(at, p.location),
    verdict: foodVerdict({ community: ctx.community ?? null, analysis: ctx.analysis ?? null, listed: ctx.listed, guess: ctx.guess ?? null }),
    guessed: !!ctx.guess,
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
      const [analyses, summaries, waits, guesses] = await Promise.all([
        cachedAnalyses(keys),
        db.getAll(...keys.map((k) => db.doc(paths.halalSummary(k)))),
        Promise.all(keys.map((k) => waitRef(k).where('at', '>', Date.now() - WAIT_TTL_MS).orderBy('at', 'desc').limit(1).get())),
        cachedGuesses(keys),
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
          ...(guesses.get(keys[i]) ? { guess: guesses.get(keys[i]) } : {}),
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

  /** Photos for the cards on screen (cached ones free; new ones resolved once and cached 7 days). */
  'POST food/photos': withTrip(
    async (req) => {
      const { items } = await readJson(req, z.object({ items: z.array(z.object({ placeKey: z.string().max(320), photoName: z.string().max(500) })).max(PHOTOS_PER_REQUEST) }));
      const valid = items.filter((i) => /^places\/[^/]+\/photos\/[^/]+$/.test(i.photoName));
      const photos = await photosFor(valid, PHOTOS_PER_REQUEST);
      return json({ photos: Object.fromEntries(photos) });
    },
    { perMinute: 20 },
  ),

  /**
   * AI pre-screen: for places nobody has checked, one request guesses from
   * the name and cuisine — likely halal / likely serves pork / can't tell.
   * Shown as "Likely halal — not verified", never as Halal. Cached 30 days.
   */
  'POST food/prescreen': withTrip(
    async (req) => {
      const body = await readJson(
        req,
        z.object({
          country: z.string().max(60).optional(),
          items: z.array(z.object({ placeKey: z.string().max(320), name: z.string().max(200), typeLabel: z.string().max(80).optional(), types: z.array(z.string().max(60)).max(20).default([]) })).max(100),
        }),
      );
      const known = await cachedGuesses(body.items.map((i) => i.placeKey));
      const todo = body.items.filter((i) => !known.has(i.placeKey)).slice(0, 60);
      if (todo.length) {
        try {
          const out = await extractJson({
            system:
              'You pre-screen restaurants for Muslim travellers from ONLY their name and cuisine. For each, answer likely_halal (e.g. Malay / Muslim / nasi kandar / mamak / Middle Eastern / Turkish / Pakistani / "halal" / Muslim names, or a cuisine that is normally halal in that country), likely_pork (the name or cuisine itself says pork, char siu, siew yuk, bak kut teh, pork noodles, BBQ pork, izakaya-style pork, etc.) or unknown (anything else — most places). Be conservative: when unsure say unknown. reason: max 12 words, naming the clue.',
            parts: [{ text: JSON.stringify({ country: body.country ?? null, places: todo.map((t, i) => ({ i, name: t.name, cuisine: t.typeLabel ?? null, types: t.types.slice(0, 6) })) }) }],
            responseSchema: {
              type: Type.OBJECT,
              properties: { guesses: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { i: { type: Type.INTEGER }, verdict: { type: Type.STRING, enum: ['likely_halal', 'likely_pork', 'unknown'] }, reason: { type: Type.STRING } }, required: ['i', 'verdict', 'reason'] } } },
              required: ['guesses'],
            },
            validate: z.object({ guesses: z.array(z.object({ i: z.number().int(), verdict: z.enum(['likely_halal', 'likely_pork', 'unknown']), reason: z.string() })) }),
            budgetMs: 20_000,
          });
          const batch = adminDb().batch();
          for (const g of out.guesses) {
            const t = todo[g.i];
            if (!t) continue;
            const guess: FoodGuess = { verdict: g.verdict, reason: g.reason.slice(0, 120) };
            known.set(t.placeKey, guess);
            batch.set(guessRef(t.placeKey), { ...guess, name: t.name, at: Date.now() });
          }
          await batch.commit();
        } catch {
          // Guesses are a bonus; the list works without them.
        }
      }
      return json({ guesses: Object.fromEntries(known) });
    },
    { perMinute: 10 },
  ),

  /**
   * Full Halal Radar on several places (the nearest unchecked ones after a
   * search, or "Check this tab"). Shares an app-wide daily allowance; places
   * already checked by anyone cost nothing.
   */
  'POST food/autocheck': withTrip(
    async (req, { member }) => {
      const { placeIds } = await readJson(req, z.object({ placeIds: z.array(z.string().min(3).max(300)).min(1).max(AUTO_PER_REQUEST) }));
      const cached = await cachedAnalyses(placeIds.map((id) => paths.placeKey({ placeId: id })));
      const fresh = placeIds.filter((id) => cached.has(paths.placeKey({ placeId: id })));
      const need = placeIds.filter((id) => !fresh.includes(id));
      const allowed = need.length ? await takeAutoChecks(need.length) : 0;
      for (let k = 0; k < allowed; k++) await useDailyQuota(member.uid, 'analyze').catch(() => {});
      const run = [...fresh, ...need.slice(0, allowed)];
      const results = (await Promise.allSettled(run.map(checkOne))).flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      return json({ results, skipped: need.length - allowed, limitReached: allowed < need.length });
    },
    { perMinute: 6 },
  ),

  /** "I ate here": a community halal report straight from a food card (one per person per place). */
  'POST food/report': withTrip(
    async (req, { member }) => {
      const body = await readJson(req, z.object({ placeId: z.string().min(3).max(300), name: z.string().min(1).max(200), tier: HalalTier, flags: HalalReport.shape.flags.default({}) }));
      const placeKey = paths.placeKey({ placeId: body.placeId });
      const ref = adminDb().doc(paths.halalReport(placeKey, member.uid));
      const prev = await ref.get();
      const now = Date.now();
      await ref.set(
        HalalReport.parse({
          uid: member.uid,
          tier: body.tier,
          flags: body.flags,
          ...(prev.get('countedAs') ? { countedAs: prev.get('countedAs') } : {}),
          createdAt: prev.exists ? Number(prev.get('createdAt')) : now,
          updatedAt: now,
        }),
      );
      const summary = await recomputeSummary({ placeKey, place: { name: body.name } });
      const analysis = await cachedAnalysis(placeKey);
      return json({ summary, verdict: foodVerdict({ community: summary.tier ? summary : null, analysis: analysis?.halal ?? null }) });
    },
    { perMinute: 10 },
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
