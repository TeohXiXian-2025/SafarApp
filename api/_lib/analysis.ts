// The Halal Radar result for a place, cached for everyone (all trips) for 30
// days in placesCache/{placeKey} (the longest Google allows place content to be
// kept). Used by Idea Board analysis and the Food tab.
//
// A full check reads the place's Google reviews (Place Details, Enterprise +
// Atmosphere SKU: ~1,000 free a month, then about US$20–40 per 1,000). Every
// full check — idea, Food tab, automatic — is counted against one monthly
// budget, HALAL_CHECKS_PER_MONTH (default 900: inside the free tier, leaving
// room for the other Place Details calls).
import { FieldValue } from 'firebase-admin/firestore';
import type { HalalAssessment, Sentiment } from '../../src/domain/index.js';
import { optionalEnv } from './env.js';
import { adminDb } from './firebaseAdmin.js';
import { analyzePlace } from './halal.js';
import { placeDetails } from './places.js';

export const ANALYSIS_TTL = 30 * 86_400_000;
/** Bump when the analysis format changes so cached results are redone. 5: reads the place's own website too. */
export const ANALYSIS_VERSION = 5;

export interface Analysis {
  halal: HalalAssessment;
  sentiment?: Sentiment;
  /** Picked up on analysis so places added before phone numbers were fetched get one too. */
  phone?: string;
  /** The AI's pick among DURATION_RANGES. */
  visitMin?: number;
}

const cacheRef = (placeKey: string) => adminDb().doc(`placesCache/${placeKey}`);

export async function cachedAnalysis(placeKey: string): Promise<Analysis | null> {
  const c = (await cacheRef(placeKey).get()).data();
  if (!c || c.v !== ANALYSIS_VERSION || Date.now() - Number(c.at) >= ANALYSIS_TTL) return null;
  return { halal: c.halal, ...(c.sentiment ? { sentiment: c.sentiment } : {}), ...(c.phone ? { phone: c.phone } : {}), ...(c.visitMin ? { visitMin: c.visitMin } : {}) };
}

/** Cached results for many places at once (missing / stale ones are left out). */
export async function cachedAnalyses(placeKeys: string[]): Promise<Map<string, Analysis>> {
  if (!placeKeys.length) return new Map();
  const snaps = await adminDb().getAll(...placeKeys.map(cacheRef));
  const out = new Map<string, Analysis>();
  for (const s of snaps) {
    const c = s.data();
    if (c && c.v === ANALYSIS_VERSION && Date.now() - Number(c.at) < ANALYSIS_TTL) out.set(s.id, { halal: c.halal, ...(c.sentiment ? { sentiment: c.sentiment } : {}), ...(c.phone ? { phone: c.phone } : {}) });
  }
  return out;
}

/** Full checks this month may use (the owner can raise it in Vercel — above ~1,000 Google bills). */
export const monthlyCheckBudget = () => Math.max(0, Number(optionalEnv('HALAL_CHECKS_PER_MONTH')) || 900);
const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
const monthRef = (m = monthKey()) => adminDb().doc(`apiUsage/halalChecks_${m}`);

/** Full checks run so far this month (all trips). */
export async function monthlyChecksUsed(): Promise<number> {
  return Number((await monthRef().get()).get('count') ?? 0);
}

/** Checks left this month, spread over the days left (so the month doesn't run dry early). */
export async function checksLeftToday(): Promise<{ today: number; month: number; used: number; budget: number }> {
  const budget = monthlyCheckBudget();
  const used = await monthlyChecksUsed();
  const month = Math.max(0, budget - used);
  const now = new Date();
  const daysLeft = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate() - now.getUTCDate() + 1;
  return { today: Math.min(month, Math.ceil(month / daysLeft)), month, used, budget };
}

/** Fetches details + reviews, runs the Halal Radar, and caches it. Counts against the monthly budget. */
export async function runAnalysis(placeId: string, placeKey: string): Promise<Analysis> {
  await monthRef()
    .set({ count: FieldValue.increment(1), updatedAt: Date.now() }, { merge: true })
    .catch(() => {});
  const details = await placeDetails(placeId, { forAnalysis: true });
  const result = await analyzePlace(details);
  const phone = details.place.phone;
  await cacheRef(placeKey).set({ ...result, ...(phone ? { phone } : {}), v: ANALYSIS_VERSION, at: Date.now() });
  return { ...result, ...(phone ? { phone } : {}) };
}
