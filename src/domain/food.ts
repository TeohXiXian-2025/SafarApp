// The Food tab (Halal Radar near you): which bucket a restaurant goes in and
// the label to show, trust-ordered — community reports > photographed
// certificate > halal listings (Google / OpenStreetMap / name) > AI estimate.
import type { HalalAssessment, HalalSummary } from './idea.js';

export type FoodBucket = 'certified' | 'halal' | 'pork_free' | 'not_halal' | 'unknown';

export const FOOD_TABS: { key: 'halal' | 'pork_free' | 'unknown'; label: string; buckets: FoodBucket[] }[] = [
  { key: 'halal', label: 'Halal', buckets: ['certified', 'halal'] },
  { key: 'pork_free', label: 'Pork-free', buckets: ['pork_free'] },
  { key: 'unknown', label: 'Not checked', buckets: ['unknown'] },
];

export interface FoodVerdict {
  bucket: FoodBucket;
  text: string;
  /** Where it comes from, always shown. */
  basis: string;
}

export function foodVerdict(opts: {
  community?: Pick<HalalSummary, 'tier' | 'reportCount' | 'certificate' | 'flags'> | null;
  analysis?: Pick<HalalAssessment, 'tier' | 'verdict' | 'flags' | 'source'> | null;
  /** Google halal_restaurant type, OSM diet:halal, or "halal" in the name. */
  listed?: 'google' | 'osm' | 'name' | null;
}): FoodVerdict {
  const { community: c, analysis: a, listed } = opts;
  const reports = c ? `${c.reportCount} traveller report${c.reportCount === 1 ? '' : 's'}` : '';
  if (c?.tier === 'certified') return { bucket: 'certified', text: c.certificate ? `Certified · ${c.certificate.certifier}` : 'Certified halal', basis: c.certificate ? `Certificate photo + ${reports}` : reports };
  if (c?.tier === 'muslim_owned') return { bucket: 'halal', text: 'Muslim-owned / fully halal', basis: reports };
  if (c?.tier === 'not_halal') return { bucket: 'not_halal', text: 'Not halal', basis: reports };
  if (c?.tier === 'pork_free') return { bucket: 'pork_free', text: 'Pork-free, not halal', basis: reports };
  if (a?.flags.servesPork || a?.tier === 'not_halal') return { bucket: 'not_halal', text: 'Serves pork', basis: 'Halal Radar (reviews / website)' };
  if (a?.tier === 'certified') return { bucket: 'certified', text: 'Likely certified', basis: 'Halal Radar (named certifier in reviews / website)' };
  if (listed) return { bucket: 'halal', text: 'Listed as halal', basis: listed === 'google' ? 'Google Maps' : listed === 'osm' ? 'OpenStreetMap' : 'Name says halal' };
  if (a?.tier === 'muslim_owned') return { bucket: 'halal', text: 'Likely Muslim-owned', basis: 'Halal Radar (AI estimate)' };
  if (a?.tier === 'pork_free' || a?.flags.servesPork === false) return { bucket: 'pork_free', text: 'No pork reported', basis: 'Halal Radar (AI estimate)' };
  return { bucket: 'unknown', text: a ? 'Halal not confirmed' : 'Not checked yet', basis: a ? 'Halal Radar found no listing' : 'Tap “Check” to run the Halal Radar' };
}

const HALAL_NAME = /\bhalal\b|\bmuslim\b|清真|ハラール|할랄|حلال/i;
export const nameSaysHalal = (name: string) => HALAL_NAME.test(name);

/** Live "how long is the wait" reports expire after an hour. */
export const WAIT_TTL_MS = 60 * 60_000;
