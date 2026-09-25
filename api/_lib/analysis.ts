// The Halal Radar result for a place, cached for everyone (all trips) for 14
// days in placesCache/{placeKey}. Used by Idea Board analysis and the Food tab.
import type { HalalAssessment, Sentiment } from '../../src/domain/index.js';
import { adminDb } from './firebaseAdmin.js';
import { analyzePlace } from './halal.js';
import { placeDetails } from './places.js';

export const ANALYSIS_TTL = 14 * 86_400_000;
/** Bump when the analysis format changes so cached results are redone. 5: reads the place's own website too. */
export const ANALYSIS_VERSION = 5;

export interface Analysis {
  halal: HalalAssessment;
  sentiment?: Sentiment;
  /** Picked up on analysis so places added before phone numbers were fetched get one too. */
  phone?: string;
}

const cacheRef = (placeKey: string) => adminDb().doc(`placesCache/${placeKey}`);

export async function cachedAnalysis(placeKey: string): Promise<Analysis | null> {
  const c = (await cacheRef(placeKey).get()).data();
  if (!c || c.v !== ANALYSIS_VERSION || Date.now() - Number(c.at) >= ANALYSIS_TTL) return null;
  return { halal: c.halal, ...(c.sentiment ? { sentiment: c.sentiment } : {}), ...(c.phone ? { phone: c.phone } : {}) };
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

/** Fetches details + reviews, runs the Halal Radar, and caches it. */
export async function runAnalysis(placeId: string, placeKey: string): Promise<Analysis> {
  const details = await placeDetails(placeId, { forAnalysis: true });
  const result = await analyzePlace(details);
  const phone = details.place.phone;
  await cacheRef(placeKey).set({ ...result, ...(phone ? { phone } : {}), v: ANALYSIS_VERSION, at: Date.now() });
  return { ...result, ...(phone ? { phone } : {}) };
}
