import type { HalalSummary, Idea } from '../../domain';

export type Tone = 'good' | 'ok' | 'warn' | 'bad' | 'muted';

export interface HalalLabel {
  text: string;
  tone: Tone;
  /** Where the verdict comes from — always shown so people can judge trust. */
  basis: string;
  reasons: string[];
}

const TIER_TEXT = {
  certified: 'Certified halal',
  muslim_owned: 'Muslim-owned / fully halal',
  pork_free: 'Pork-free (not halal)',
  not_halal: 'Not halal',
} as const;
const TIER_TONE = { certified: 'good', muslim_owned: 'good', pork_free: 'warn', not_halal: 'bad' } as const;

const SOURCE_TEXT: Record<string, string> = {
  google: 'Listed on Google Maps',
  foursquare: 'Listed on Foursquare',
  osm: 'Tagged on OpenStreetMap',
  ai_estimate: 'AI estimate from reviews — unverified',
  community: 'Community reports',
  verified_certificate: 'Verified certificate',
};

/**
 * One label for an idea's halal status, trust-ordered:
 * community consensus > listings (Google/Foursquare/OSM) > AI estimate.
 */
export function halalLabel(idea: Idea, community?: HalalSummary | null): HalalLabel | null {
  const food = idea.place.category === 'food';
  if (community?.tier) {
    return {
      text: TIER_TEXT[community.tier],
      tone: TIER_TONE[community.tier],
      basis: `${community.reportCount} traveller report${community.reportCount === 1 ? '' : 's'}`,
      reasons: idea.halal?.reasons ?? [],
    };
  }
  if (community?.disputed) {
    return { text: 'Disputed — check before you go', tone: 'warn', basis: `${community.reportCount} reports disagree`, reasons: idea.halal?.reasons ?? [] };
  }
  const h = idea.halal;
  if (!h) return null;
  const basis = SOURCE_TEXT[h.source] ?? h.source;

  if (!food) {
    if (h.verdict === 'not_friendly') return { text: 'Not Muslim-friendly', tone: 'bad', basis, reasons: h.reasons };
    if (h.verdict === 'caution') return { text: 'Check before you go', tone: 'warn', basis, reasons: h.reasons };
    if (h.verdict === 'friendly') return { text: 'Muslim-friendly', tone: 'ok', basis, reasons: h.reasons };
    return { text: 'No known concerns', tone: 'muted', basis, reasons: h.reasons };
  }

  if (h.verdict === 'not_friendly' || h.tier === 'not_halal') return { text: 'Not halal', tone: 'bad', basis, reasons: h.reasons };
  if (h.verdict === 'caution') return { text: 'Halal unclear — check first', tone: 'warn', basis, reasons: h.reasons };
  if (h.source !== 'ai_estimate' && h.verdict === 'friendly') return { text: 'Listed as halal', tone: 'ok', basis, reasons: h.reasons };
  if (h.tier === 'pork_free') return { text: 'Likely pork-free, not halal', tone: 'warn', basis, reasons: h.reasons };
  if (h.tier) return { text: `Likely ${TIER_TEXT[h.tier].toLowerCase()}`, tone: 'ok', basis, reasons: h.reasons };
  return { text: 'Halal status unknown', tone: 'muted', basis, reasons: h.reasons };
}

export const placePhotoUrl = (photoName: string, width = 640) =>
  `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${width}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;
