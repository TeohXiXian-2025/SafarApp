import type { EvidenceSource, HalalSummary, Idea } from '../../domain';

export type Tone = 'good' | 'ok' | 'warn' | 'bad' | 'muted';

export interface HalalLabel {
  text: string;
  tone: Tone;
  /** Where the verdict comes from — always shown so people can judge trust. */
  basis: string;
  /** Why — each point says where it came from. */
  evidence: { text: string; source: EvidenceSource }[];
  /** Food: the second axis — pork and alcohol, apart from halal status. */
  axes?: { pork: 'none' | 'served' | 'unknown'; alcohol?: boolean };
}

/** Pork / alcohol answers, community reports first. */
function axesOf(idea: Idea, community?: HalalSummary | null): HalalLabel['axes'] {
  if (idea.place.category !== 'food') return undefined;
  const f = { ...(idea.halal?.flags ?? {}), ...(community?.flags ?? {}) };
  return { pork: f.servesPork === true ? 'served' : f.servesPork === false ? 'none' : 'unknown', ...(f.servesAlcohol !== undefined ? { alcohol: f.servesAlcohol } : {}) };
}

export const EVIDENCE_SOURCE: Record<EvidenceSource, string> = {
  google: 'Google Maps',
  foursquare: 'Foursquare',
  openstreetmap: 'OpenStreetMap',
  reviews: 'Reviews',
  website: 'Website',
  place_details: 'Google listing',
  nearby: 'Nearby search',
  community: 'Travellers',
  ai: 'General knowledge',
};

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
  const label = baseLabel(idea, community);
  return label && idea.place.category === 'food' ? { ...label, axes: axesOf(idea, community) } : label;
}

function baseLabel(idea: Idea, community?: HalalSummary | null): HalalLabel | null {
  const food = idea.place.category === 'food';
  const h = idea.halal;
  // Older analyses only have plain reasons.
  const evidence = h?.evidence.length ? h.evidence : (h?.reasons ?? []).map((text) => ({ text, source: 'ai' as const }));
  if (community?.tier === 'certified' && community.certificate) {
    return {
      text: `Certified halal · ${community.certificate.certifier}`,
      tone: 'good',
      basis: `Certificate photo checked${community.certificate.expiresOn ? ` (valid until ${community.certificate.expiresOn})` : ''} · ${community.reportCount} traveller reports across Safar trips`,
      evidence: [{ text: `A traveller photographed the ${community.certificate.certifier} certificate; ${community.reportCount} reports agree`, source: 'community' }, ...evidence],
    };
  }
  if (community?.tier) {
    return {
      text: TIER_TEXT[community.tier],
      tone: TIER_TONE[community.tier],
      basis: `${community.reportCount} traveller report${community.reportCount === 1 ? '' : 's'} across Safar trips`,
      evidence: [{ text: `${community.reportCount} traveller${community.reportCount === 1 ? '' : 's'} reported it as ${TIER_TEXT[community.tier].toLowerCase()}`, source: 'community' }, ...evidence],
    };
  }
  if (community?.disputed) {
    return { text: 'Disputed — check before you go', tone: 'warn', basis: `${community.reportCount} reports disagree`, evidence };
  }
  if (!h) return null;
  const basis = SOURCE_TEXT[h.source] ?? h.source;

  if (!food) {
    // For sights & activities the question is "can we pray, and is the activity OK?"
    const access = h.prayer?.access;
    const nb = { basis: h.prayer ? 'Mosques from Google Maps & OpenStreetMap · reviews checked by AI' : basis, evidence };
    if (h.verdict === 'not_friendly') return { text: 'Not Muslim-friendly', tone: 'bad', ...nb };
    if (h.verdict === 'caution') return { text: access === 'far' ? 'No prayer space close by' : 'Check before you go', tone: 'warn', ...nb };
    if (access === 'onsite') return { text: 'Muslim-friendly · prayer space on site', tone: 'good', ...nb };
    if (access === 'walkable') return { text: 'Muslim-friendly · mosque within walking distance', tone: 'good', ...nb };
    if (access === 'nearby') return { text: 'Muslim-friendly · mosque a short trip away', tone: 'ok', ...nb };
    if (h.verdict === 'friendly') return { text: 'Muslim-friendly', tone: 'ok', ...nb };
    return { text: 'No known concerns', tone: 'muted', ...nb };
  }

  if (h.verdict === 'not_friendly' || h.tier === 'not_halal') return { text: 'Not halal', tone: 'bad', basis, evidence };
  if (h.source !== 'ai_estimate' && h.verdict === 'friendly' && !h.flags.servesPork) return { text: 'Listed as halal', tone: 'ok', basis, evidence };
  if (h.tier === 'certified' || h.tier === 'muslim_owned') return { text: `Likely ${TIER_TEXT[h.tier].toLowerCase()}`, tone: 'ok', basis, evidence };
  // Not halal-listed: say what we DO know (pork) instead of just "unclear".
  if (h.tier === 'pork_free' || h.flags.servesPork === false) return { text: 'No pork reported · not halal-certified', tone: 'warn', basis, evidence };
  if (h.flags.servesPork) return { text: 'Serves pork', tone: 'bad', basis, evidence };
  return { text: 'Halal not confirmed — ask the restaurant', tone: h.verdict === 'caution' ? 'warn' : 'muted', basis, evidence };
}

export const placePhotoUrl = (photoName: string, width = 640) =>
  `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${width}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;
