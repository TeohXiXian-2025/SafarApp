// Halal Radar: combine worldwide signals + one Gemini pass into a
// HalalAssessment and a review Sentiment for a place.
import { Type } from '@google/genai';
import { z } from 'zod';
import type { HalalAssessment, HalalSource, Sentiment } from '../../src/domain/index.js';
import { optionalEnv } from './env.js';
import { extractJson } from './gemini.js';
import type { PlaceDetails } from './places.js';

interface Signal {
  source: Extract<HalalSource, 'google' | 'foursquare' | 'osm'>;
  reason: string;
}

const HALAL_WORD = /\bhalal\b|حلال|ハラル|할랄|清真|halaal/i;
const nameTokens = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2);
const similarName = (a: string, b: string) => {
  const bt = new Set(nameTokens(b));
  return nameTokens(a).some((t) => bt.has(t));
};

function googleSignal(d: PlaceDetails): Signal | null {
  if (d.primaryType === 'halal_restaurant' || d.place.types.includes('halal_restaurant')) {
    return { source: 'google', reason: 'Listed as a halal restaurant on Google Maps' };
  }
  if (HALAL_WORD.test(d.place.name)) return { source: 'google', reason: `"Halal" is in the restaurant's name` };
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
  return hit ? { source: 'foursquare', reason: 'Listed as halal on Foursquare' } : null;
}

async function osmSignal(d: PlaceDetails): Promise<Signal | null> {
  const { lat, lng } = d.place.location;
  const q = `[out:json][timeout:6];nwr(around:80,${lat},${lng})["diet:halal"~"yes|only"];out tags 10;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(q)}`,
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'User-Agent': 'Safar/1.0 (group travel planner)' },
    signal: AbortSignal.timeout(7000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as { elements?: { tags?: Record<string, string> }[] } | null;
  const hit = body?.elements?.find((e) => e.tags?.name && similarName(e.tags.name, d.place.name));
  if (!hit) return null;
  return { source: 'osm', reason: hit.tags!['diet:halal'] === 'only' ? 'Tagged "halal only" on OpenStreetMap' : 'Tagged halal on OpenStreetMap' };
}

// ─── Gemini pass ────────────────────────────────────────────────────────────

const SYSTEM = `You help Muslim travellers judge places. Given a place's details, reviews and any halal listings found elsewhere, return:
1) halal: for FOOD places (restaurants, cafes, food courts, bakeries…):
   - tier: "certified" ONLY if reviews/website explicitly name a halal certification body (e.g. JAKIM, MUIS, JHA, IFANCA, HFA) for this place; "muslim_owned" if Muslim-owned/fully halal kitchen is stated; "pork_free" if no pork but not halal; "not_halal" if pork is served or halal is clearly absent; otherwise "unknown".
   - servesAlcohol / servesPork / halalMenuOptions / prayerSpaceOnSite: "yes", "no" or "unknown" — only from evidence.
   For NON-food places set tier "unknown" and judge Muslim-friendliness: alcohol-centred venues, bars/nightclubs, casinos/gambling, mixed nude bathing (e.g. onsen), pork-focused food events, or strict modest-dress requirements at religious sites.
   verdict: "friendly", "caution" (some concerns / check first), "not_friendly", or "unknown".
   reasons: up to 5 short, concrete, user-facing reasons (e.g. "Reviewers mention a halal menu", "Bar area serves alcohol"). No generic filler — if a non-food place raises no concerns, return an empty list.
   confidence: 0..1.
2) reviews: judge from the reviews and rating whether it's worth visiting: verdict "highly_recommended", "mixed" or "skip"; score 0..1; up to 3 pros and 3 cons, each under 12 words, specific (food, queues, price, staff, cleanliness, crowding, views…).
Never invent facts. Unknown is fine.`;

const tri = { type: Type.STRING, enum: ['yes', 'no', 'unknown'] };
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    halal: {
      type: Type.OBJECT,
      properties: {
        tier: { type: Type.STRING, enum: ['certified', 'muslim_owned', 'pork_free', 'not_halal', 'unknown'] },
        verdict: { type: Type.STRING, enum: ['friendly', 'caution', 'not_friendly', 'unknown'] },
        reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
        servesAlcohol: tri,
        servesPork: tri,
        halalMenuOptions: tri,
        prayerSpaceOnSite: tri,
        confidence: { type: Type.NUMBER },
      },
      required: ['tier', 'verdict', 'reasons', 'confidence'],
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
    reasons: z.array(z.string()).max(8),
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

const flag = (v?: 'yes' | 'no' | 'unknown') => (v === 'yes' ? true : v === 'no' ? false : undefined);
const clip = (xs: string[], n: number, len: number) => xs.map((x) => x.trim().slice(0, len)).filter(Boolean).slice(0, n);

export async function analyzePlace(d: PlaceDetails): Promise<{ halal: HalalAssessment; sentiment?: Sentiment }> {
  const isFood = d.place.category === 'food';
  const signals = (
    await Promise.all([Promise.resolve(googleSignal(d)), isFood ? foursquareSignal(d) : null, isFood ? osmSignal(d) : null])
  ).filter((s): s is Signal => !!s);

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

  // Listings from Google/Foursquare/OSM outrank the AI's estimate.
  const top = signals[0];
  const alcohol = flag(ai.halal.servesAlcohol) ?? (d.servesBeer || d.servesWine ? true : undefined);
  const pork = flag(ai.halal.servesPork);
  let verdict = ai.halal.verdict;
  if (isFood && top && verdict === 'unknown') verdict = 'friendly';
  if (isFood && top && pork) verdict = 'caution'; // listed halal but reviews mention pork — flag it

  const halal: HalalAssessment = {
    ...(isFood && ai.halal.tier !== 'unknown' ? { tier: ai.halal.tier } : {}),
    verdict,
    reasons: clip([...signals.map((s) => s.reason), ...ai.halal.reasons], 6, 200),
    flags: {
      ...(alcohol !== undefined ? { servesAlcohol: alcohol } : {}),
      ...(pork !== undefined ? { servesPork: pork } : {}),
      ...(flag(ai.halal.halalMenuOptions) !== undefined ? { halalMenuOptions: flag(ai.halal.halalMenuOptions) } : {}),
      ...(flag(ai.halal.prayerSpaceOnSite) !== undefined ? { prayerSpaceOnSite: flag(ai.halal.prayerSpaceOnSite) } : {}),
    },
    source: top?.source ?? 'ai_estimate',
    confidence: top ? Math.max(ai.halal.confidence, 0.7) : ai.halal.confidence,
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
