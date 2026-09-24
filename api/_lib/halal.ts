// Halal Radar: combine worldwide signals + one AI pass into a HalalAssessment
// and a review Sentiment for a place.
// - Restaurants: is it Muslim-friendly (halal tier, pork, alcohol)?
// - Everything else: can you pray nearby, is there halal food around, and is
//   the activity itself a concern (bar, casino, mixed bathing…)?
// Every verdict carries evidence, each point naming where it came from.
import { Type } from '@google/genai';
import { z } from 'zod';
import type { EvidenceSource, GeoPoint, HalalAssessment, HalalSource, NearbyPlace, PrayerAccess, Sentiment } from '../../src/domain/index.js';
import { optionalEnv } from './env.js';
import { extractJson } from './gemini.js';
import { distanceKm, searchNearby, type PlaceDetails } from './places.js';

interface Signal {
  source: Extract<HalalSource, 'google' | 'foursquare' | 'osm'>;
  reason: string;
}
type Evidence = HalalAssessment['evidence'][number];

const HALAL_WORD = /\bhalal\b|حلال|ハラル|할랄|清真|halaal/i;
const nameTokens = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2);
const similarName = (a: string, b: string) => {
  const bt = new Set(nameTokens(b));
  return nameTokens(a).some((t) => bt.has(t));
};

/** How far we look for somewhere to pray / eat halal. */
const PRAYER_RADIUS_M = 2000;
const FOOD_RADIUS_M = 1500;
/** Walking ≈ 80 m/min, streets ≈ 1.3× the straight line. */
const walkMin = (m: number) => Math.max(1, Math.ceil((m * 1.3) / 80));
const BAR_NAME = /\b(bar|pub|lounge|brewery|izakaya)\b/i;
const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

function googleSignal(d: PlaceDetails): Signal | null {
  if (d.primaryType === 'halal_restaurant' || d.place.types.includes('halal_restaurant')) {
    return { source: 'google', reason: 'Google Maps lists it as a halal restaurant' };
  }
  if (HALAL_WORD.test(d.place.name)) return { source: 'google', reason: `"Halal" is part of the restaurant's name` };
  return null;
}

async function foursquareSignal(d: PlaceDetails): Promise<Signal | null> {
  const key = optionalEnv('FOURSQUARE_API_KEY');
  if (!key) return null;
  const { lat, lng } = d.place.location;
  const url = `https://places-api.foursquare.com/places/search?ll=${lat},${lng}&radius=120&query=${encodeURIComponent(d.place.name.slice(0, 60))}&limit=3`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, 'X-Places-Api-Version': '2025-06-17', Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json()) as { results?: { name: string; categories?: { name: string }[] }[] };
  const hit = body.results?.find((r) => similarName(r.name, d.place.name) && (r.categories?.some((c) => /halal/i.test(c.name)) || HALAL_WORD.test(r.name)));
  return hit ? { source: 'foursquare', reason: 'Foursquare lists it in a halal category' } : null;
}

// ─── OpenStreetMap (one Overpass call for everything) ──────────────────────

interface OsmElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function overpass(at: GeoPoint): Promise<OsmElement[] | null> {
  const { lat, lng } = at;
  const q = `[out:json][timeout:8];(
nwr(around:${PRAYER_RADIUS_M},${lat},${lng})["amenity"="place_of_worship"]["religion"="muslim"];
nwr(around:${PRAYER_RADIUS_M},${lat},${lng})["amenity"="prayer_room"];
nwr(around:${FOOD_RADIUS_M},${lat},${lng})["diet:halal"~"yes|only"]["name"]["amenity"!~"bar|pub|nightclub|biergarten"];
);out center tags 60;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(q)}`,
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'User-Agent': 'Safar/1.0 (group travel planner)' },
    signal: AbortSignal.timeout(9000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as { elements?: OsmElement[] } | null;
  return body?.elements ?? null;
}

const osmPoint = (e: OsmElement): GeoPoint | null => {
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  return lat === undefined || lon === undefined ? null : { lat, lng: lon };
};
const isPrayer = (e: OsmElement) => e.tags?.amenity === 'prayer_room' || e.tags?.religion === 'muslim';

function osmSignal(d: PlaceDetails, osm: OsmElement[] | null): Signal | null {
  const hit = osm?.find((e) => {
    const at = osmPoint(e);
    return !isPrayer(e) && e.tags?.name && at && distanceKm(at, d.place.location) <= 0.12 && similarName(e.tags.name, d.place.name);
  });
  if (!hit) return null;
  return { source: 'osm', reason: hit.tags!['diet:halal'] === 'only' ? 'OpenStreetMap tags it "halal only"' : 'OpenStreetMap tags it as serving halal food' };
}

/** Merges candidate lists, drops duplicates (same spot, ≤ 40 m apart) and the place itself, nearest first. */
function nearest(from: PlaceDetails, lists: (Omit<NearbyPlace, 'distanceM' | 'walkMin'> | null)[][], max = 3): NearbyPlace[] {
  const out: NearbyPlace[] = [];
  const all = lists
    .flat()
    .filter((p): p is Omit<NearbyPlace, 'distanceM' | 'walkMin'> => !!p)
    .map((p) => ({ ...p, distanceM: Math.round(distanceKm(from.place.location, p.location) * 1000) }))
    .sort((a, b) => a.distanceM - b.distanceM);
  for (const p of all) {
    if (from.place.placeId && p.placeId === from.place.placeId) continue;
    if (out.some((o) => distanceKm(o.location, p.location) < 0.04 || o.name === p.name)) continue;
    out.push({ ...p, name: p.name.slice(0, 200), walkMin: walkMin(p.distanceM) });
    if (out.length === max) break;
  }
  return out;
}

async function nearbySpots(d: PlaceDetails, isFood: boolean) {
  const at = d.place.location;
  const [mosques, halalFood, osm] = await Promise.all([
    searchNearby(at, ['mosque'], PRAYER_RADIUS_M, 5),
    searchNearby(at, ['halal_restaurant'], FOOD_RADIUS_M, 5),
    overpass(at),
  ]);
  const fromOsm = (want: (e: OsmElement) => boolean, label: string) =>
    (osm ?? []).filter(want).map((e) => {
      const loc = osmPoint(e);
      return loc ? { name: e.tags?.name || e.tags?.['name:en'] || label, location: loc } : null;
    });

  const prayerPlaces = nearest(d, [
    (mosques ?? []).map((m) => ({ name: m.name, placeId: m.placeId, location: m.location })),
    fromOsm(isPrayer, 'Prayer room (musalla)'),
  ]);
  const foodPlaces = nearest(d, [
    (halalFood ?? []).filter((m) => !BAR_NAME.test(m.name)).map((m) => ({ name: m.name, placeId: m.placeId, location: m.location })),
    fromOsm((e) => !isPrayer(e) && !!e.tags?.name && !BAR_NAME.test(e.tags.name), ''),
  ]);

  const lookedUp = mosques !== null || osm !== null;
  const selfIsMosque = d.place.types.includes('mosque');
  const closest = prayerPlaces[0];
  const access: PrayerAccess = selfIsMosque
    ? 'onsite'
    : !lookedUp
      ? 'unknown'
      : !closest
        ? 'far'
        : closest.distanceM <= 60
          ? 'onsite'
          : closest.walkMin <= 10
            ? 'walkable'
            : closest.walkMin <= 25
              ? 'nearby'
              : 'far';

  return {
    osm,
    prayer: { access, places: prayerPlaces },
    halalFood: halalFood !== null || osm !== null ? { places: foodPlaces } : undefined,
    isFood,
  };
}

// ─── AI pass ────────────────────────────────────────────────────────────────

const SYSTEM = `You help Muslim travellers judge places. You get a place's details, Google reviews, and facts we already found (halal listings, nearby mosques). Return:
1) halal:
   FOOD places (restaurants, cafes, food courts, bakeries…) — decide whether it is Muslim-friendly:
   - tier: "certified" ONLY if reviews/website explicitly name a halal certification body (e.g. JAKIM, MUIS, JHA, IFANCA, HFA) for this place; "muslim_owned" if Muslim-owned / fully halal kitchen is stated; "pork_free" if no pork but not halal; "not_halal" if pork is served or halal is clearly absent; otherwise "unknown".
   - verdict: "friendly" (halal or clearly Muslim-friendly), "caution" (e.g. no pork but alcohol served, halal status unconfirmed, pork served elsewhere in the same food court), "not_friendly" (pork / not halal), "unknown".
   NON-food places — set tier "unknown"; judge only whether the ACTIVITY is a concern: alcohol-centred venues, bars/nightclubs, casinos/gambling, mixed or nude bathing (e.g. onsen), pork-focused food events, strict modest-dress rules. verdict "not_friendly" for clear concerns, "caution" for partial ones, "friendly" if none are evident. Prayer access is judged separately — do not mention mosques.
   - servesAlcohol / servesPork / halalMenuOptions / prayerSpaceOnSite: "yes", "no" or "unknown" — only from evidence.
   - evidence: 1–5 short, concrete points that JUSTIFY the verdict, each with its source:
     "reviews" (quote or paraphrase a specific review, e.g. 'A reviewer says the chicken is from a halal supplier'),
     "website", "place_details" (e.g. Google says it serves beer), or "ai" (well-known general fact, e.g. 'Onsen are communal baths where bathers are nude').
     Only points that actually support the verdict. Do NOT repeat the halal listings, the place's name, beer/wine from the listing or nearby facts — we already show them.
     No filler and no "absence" points like "no pork is advertised" / "no certification is listed". A non-food place with no concerns needs at most 1 point.
   - confidence: 0..1.
2) reviews: from the reviews and rating, is it worth visiting? verdict "highly_recommended", "mixed" or "skip"; score 0..1; up to 3 pros and 3 cons, each under 12 words, specific (food, queues, price, staff, cleanliness, crowding, views…).
Never invent facts. "unknown" is fine.`;

const tri = { type: Type.STRING, enum: ['yes', 'no', 'unknown'] };
const AI_SOURCES = ['reviews', 'website', 'place_details', 'ai'] as const;
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    halal: {
      type: Type.OBJECT,
      properties: {
        tier: { type: Type.STRING, enum: ['certified', 'muslim_owned', 'pork_free', 'not_halal', 'unknown'] },
        verdict: { type: Type.STRING, enum: ['friendly', 'caution', 'not_friendly', 'unknown'] },
        evidence: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { text: { type: Type.STRING }, source: { type: Type.STRING, enum: [...AI_SOURCES] } },
            required: ['text', 'source'],
          },
        },
        servesAlcohol: tri,
        servesPork: tri,
        halalMenuOptions: tri,
        prayerSpaceOnSite: tri,
        confidence: { type: Type.NUMBER },
      },
      required: ['tier', 'verdict', 'evidence', 'confidence'],
    },
    reviews: {
      type: Type.OBJECT,
      properties: {
        verdict: { type: Type.STRING, enum: ['highly_recommended', 'mixed', 'skip'] },
        score: { type: Type.NUMBER },
        pros: { type: Type.ARRAY, items: { type: Type.STRING } },
        cons: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['verdict', 'score', 'pros', 'cons'],
    },
  },
  required: ['halal', 'reviews'],
};

const TriState = z.enum(['yes', 'no', 'unknown']).optional();
const AiResult = z.object({
  halal: z.object({
    tier: z.enum(['certified', 'muslim_owned', 'pork_free', 'not_halal', 'unknown']),
    verdict: z.enum(['friendly', 'caution', 'not_friendly', 'unknown']),
    evidence: z.array(z.object({ text: z.string(), source: z.enum(AI_SOURCES).catch('ai') })).max(8),
    servesAlcohol: TriState,
    servesPork: TriState,
    halalMenuOptions: TriState,
    prayerSpaceOnSite: TriState,
    confidence: z.number().min(0).max(1),
  }),
  reviews: z.object({
    verdict: z.enum(['highly_recommended', 'mixed', 'skip']),
    score: z.number().min(0).max(1),
    pros: z.array(z.string()).max(6),
    cons: z.array(z.string()).max(6),
  }),
});

/** Two evidence lines saying the same thing (most words shared). */
function sameFact(a: string, b: string) {
  const ta = new Set(nameTokens(a));
  const tb = nameTokens(b);
  if (!ta.size || !tb.length) return false;
  const shared = tb.filter((t) => ta.has(t)).length;
  return shared / Math.min(ta.size, tb.length) >= 0.6;
}

const flag = (v?: 'yes' | 'no' | 'unknown') => (v === 'yes' ? true : v === 'no' ? false : undefined);
const clip = (xs: string[], n: number, len: number) => xs.map((x) => x.trim().slice(0, len)).filter(Boolean).slice(0, n);
const SIGNAL_SOURCE: Record<Signal['source'], EvidenceSource> = { google: 'google', foursquare: 'foursquare', osm: 'openstreetmap' };

export async function analyzePlace(d: PlaceDetails): Promise<{ halal: HalalAssessment; sentiment?: Sentiment }> {
  const isFood = d.place.category === 'food';
  const [nearby, fsq] = await Promise.all([nearbySpots(d, isFood), isFood ? foursquareSignal(d) : null]);
  const signals = [googleSignal(d), fsq, isFood ? osmSignal(d, nearby.osm) : null].filter((s): s is Signal => !!s);
  const { prayer, halalFood } = nearby;

  const facts = {
    name: d.place.name,
    kind: d.place.typeLabel,
    types: d.place.types,
    isFood,
    website: d.place.website,
    summary: d.editorialSummary,
    servesBeer: d.servesBeer,
    servesWine: d.servesWine,
    rating: d.place.rating,
    ratingCount: d.place.ratingCount,
    halalListings: signals.map((s) => s.reason),
    reviews: d.reviews.slice(0, 5),
  };
  const ai = await extractJson({
    system: SYSTEM,
    parts: [{ text: `Place:\n${JSON.stringify(facts)}` }],
    responseSchema,
    validate: AiResult,
  });

  const alcohol = flag(ai.halal.servesAlcohol) ?? (d.servesBeer || d.servesWine ? true : undefined);
  const pork = flag(ai.halal.servesPork);
  const prayerOnSite = flag(ai.halal.prayerSpaceOnSite);
  if (prayerOnSite && prayer.access !== 'onsite') prayer.access = 'onsite';

  // ── Evidence: facts we looked up ourselves come first, then the AI's points.
  const evidence: Evidence[] = signals.map((s) => ({ text: s.reason, source: SIGNAL_SOURCE[s.source] }));
  if (d.servesBeer || d.servesWine) {
    const what = [d.servesBeer && 'beer', d.servesWine && 'wine'].filter(Boolean).join(' and ');
    evidence.push({ text: `Google's listing says it serves ${what}`, source: 'place_details' });
  }
  const closest = prayer.places[0];
  if (d.place.types.includes('mosque')) evidence.push({ text: 'This place is itself a mosque', source: 'google' });
  else if (prayerOnSite) evidence.push({ text: 'Visitors mention a prayer room on site', source: 'reviews' });
  else if (closest) {
    evidence.push({ text: `Nearest place to pray: ${closest.name} — ${fmtDist(closest.distanceM)}, about ${closest.walkMin} min walk`, source: 'nearby' });
  } else if (prayer.access === 'far') {
    evidence.push({ text: `No mosque or prayer room found within ${PRAYER_RADIUS_M / 1000} km`, source: 'nearby' });
  }
  if (!isFood && halalFood) {
    const f = halalFood.places[0];
    evidence.push(
      f
        ? { text: `Halal food nearby: ${f.name} — ${fmtDist(f.distanceM)}${halalFood.places.length > 1 ? ` (+${halalFood.places.length - 1} more)` : ''}`, source: 'nearby' }
        : { text: `No halal-listed restaurant found within ${FOOD_RADIUS_M / 1000} km — bring snacks or eat before`, source: 'nearby' },
    );
  }
  for (const e of ai.halal.evidence) {
    const text = e.text.trim().slice(0, 240);
    if (text && !evidence.some((x) => sameFact(x.text, text))) evidence.push({ text, source: e.source });
  }

  // ── Verdict
  const top = signals[0];
  let verdict = ai.halal.verdict;
  if (isFood) {
    if (top && verdict === 'unknown') verdict = 'friendly';
    if (top && pork) verdict = 'caution'; // listed halal but reviews mention pork — flag it
  } else if (verdict !== 'not_friendly' && verdict !== 'caution') {
    // No concern with the activity itself → it comes down to being able to pray.
    verdict = prayer.access === 'far' ? 'caution' : prayer.access === 'unknown' ? verdict : 'friendly';
  }

  const halal: HalalAssessment = {
    ...(isFood && ai.halal.tier !== 'unknown' ? { tier: ai.halal.tier } : {}),
    verdict,
    reasons: clip(
      evidence.map((e) => e.text),
      8,
      200,
    ),
    evidence: evidence.slice(0, 10),
    prayer,
    ...(halalFood ? { halalFood } : {}),
    flags: {
      ...(alcohol !== undefined ? { servesAlcohol: alcohol } : {}),
      ...(pork !== undefined ? { servesPork: pork } : {}),
      ...(flag(ai.halal.halalMenuOptions) !== undefined ? { halalMenuOptions: flag(ai.halal.halalMenuOptions) } : {}),
      ...(prayer.access === 'onsite' ? { prayerSpaceOnSite: true } : prayerOnSite === false ? { prayerSpaceOnSite: false } : {}),
    },
    source: isFood && top ? top.source : 'ai_estimate',
    confidence: isFood && top ? Math.max(ai.halal.confidence, 0.7) : ai.halal.confidence,
    assessedAt: Date.now(),
  };

  const sentiment: Sentiment | undefined = d.reviews.length
    ? {
        verdict: ai.reviews.verdict,
        score: ai.reviews.score,
        pros: clip(ai.reviews.pros, 3, 160),
        cons: clip(ai.reviews.cons, 3, 160),
        basedOn: `${d.reviews.length} Google reviews${d.place.rating ? ` · ${d.place.rating}★` : ''}${d.place.ratingCount ? ` (${d.place.ratingCount.toLocaleString('en')})` : ''}`.slice(0, 120),
        analyzedAt: Date.now(),
      }
    : undefined;

  return { halal, ...(sentiment ? { sentiment } : {}) };
}
