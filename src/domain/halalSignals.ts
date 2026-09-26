// Halal evidence without asking a person: every independent signal we can
// read for free (listings, the place's own website, review text, its name,
// certification directories) is scored, and the tier follows the weight of
// evidence. The AI's reading is one more signal, not the judge; community
// reports override everything (a person on site is the last safety net).
// Pure functions — shared by the server and tests.
import type { HalalTier } from './common.js';

/** "Halal" in the languages our travellers meet it in. */
export const HALAL_WORDS = /\bhalal\b|\bhalaal\b|\bhallal\b|حلال|ハラール|ハラル|할랄|清真|ฮาลาล|\bhalel\b/i;
/** Said about the food: pork-free, Muslim-friendly. */
const NO_PORK = /\b(no|without|free of|zero)\s+(pork|lard|babi)\b|\bpork[- ]?free\b|\bno pork no lard\b|ポークフリー|豚肉不使用|무돼지|돼지고기 없|无猪肉|不含猪肉|\btanpa babi\b|\btiada babi\b/i;
const MUSLIM_FRIENDLY = /\bmuslim[- ]?friendly\b|ムスリムフレンドリー|무슬림 친화|穆斯林友好|\bmuslim[- ]?owned\b|\bmuslim (chef|owner|staff)\b/i;
/** Pork on the menu / in reviews. */
const PORK = /\b(pork|bacon|ham|lard|prosciutto|pepperoni|salami|chorizo|char siu|chashu|tonkatsu|tonkotsu|babi|samgyeopsal|bossam|jokbal)\b|豚|猪|돼지|ポーク|とんかつ|豚骨/i;
const ALCOHOL = /\b(beer|wine|sake|soju|cocktail|whisky|whiskey|bar counter|happy hour|izakaya)\b|ビール|日本酒|酒吧|맥주|소주/i;

/**
 * Halal certification bodies, as printed on certificates / websites. A named
 * certifier is the strongest free signal short of a certificate photo.
 */
export const CERTIFIERS: [RegExp, string][] = [
  [/\bJAKIM\b|Jabatan Kemajuan Islam/i, 'JAKIM (Malaysia)'],
  [/\bJAIS\b|\bJAIN\b|\bMAIWP\b/i, 'Malaysian state religious council'],
  [/\bMUIS\b|Majlis Ugama Islam Singapura/i, 'MUIS (Singapore)'],
  [/\bMUI\b|\bBPJPH\b|Majelis Ulama Indonesia/i, 'MUI / BPJPH (Indonesia)'],
  [/\bMABIMS\b|\bBrunei\b.*\bhalal\b/i, 'Brunei (MUIB)'],
  [/Japan Halal Association|\bJHA\b|日本ハラール協会/i, 'Japan Halal Association'],
  [/Japan Muslim Association|日本ムスリム協会/i, 'Japan Muslim Association'],
  [/\bMPJA\b|Muslim Professional Japan/i, 'MPJA (Japan)'],
  [/Nippon Asia Halal|\bNAHA\b/i, 'Nippon Asia Halal Association'],
  [/Japan Islamic Trust|\bJIT\b/i, 'Japan Islamic Trust'],
  [/Korea Muslim Federation|\bKMF\b|한국이슬람교중앙회/i, 'Korea Muslim Federation'],
  [/Chinese Muslim Association|\bTHIDA\b|中國回教協會|中国回教协会/i, 'Chinese Muslim Association (Taiwan)'],
  [/\bCICOT\b|Central Islamic Committee of Thailand/i, 'CICOT (Thailand)'],
  [/\bHFA\b|Halal Food Authority/i, 'Halal Food Authority (UK)'],
  [/\bHMC\b|Halal Monitoring Committee/i, 'HMC (UK)'],
  [/\bIFANCA\b/i, 'IFANCA (USA)'],
  [/\bAFIC\b|Australian Federation of Islamic Councils/i, 'AFIC (Australia)'],
  [/\bICCV\b|\bHCA\b.*halal|Halal Certification Authority/i, 'Australian halal certifier'],
  [/\bESMA\b|Emirates Authority for Standardization/i, 'ESMA (UAE)'],
  [/\bGIMDES\b|\bHAK\b.*helal|Helal Akreditasyon/i, 'Turkey halal authority'],
];

export interface TextScan {
  halal: number;
  noPork: number;
  muslimFriendly: number;
  pork: number;
  alcohol: number;
  certifier?: string;
}

/** Counts each kind of mention in some pieces of text (each piece counts once per kind). */
export function scanText(pieces: (string | undefined)[]): TextScan {
  const out: TextScan = { halal: 0, noPork: 0, muslimFriendly: 0, pork: 0, alcohol: 0 };
  for (const t of pieces) {
    if (!t) continue;
    // "not halal" / "isn't halal" must not count for it.
    const denied = /\b(not|isn'?t|no longer|non)[- ]halal\b|halal\s*(ではない|아님)/i.test(t);
    if (HALAL_WORDS.test(t) && !denied) out.halal++;
    if (NO_PORK.test(t)) out.noPork++;
    else if (PORK.test(t) && !/\bno\b.{0,12}(pork|babi)/i.test(t)) out.pork++;
    if (MUSLIM_FRIENDLY.test(t)) out.muslimFriendly++;
    if (ALCOHOL.test(t)) out.alcohol++;
    if (!out.certifier && HALAL_WORDS.test(t)) out.certifier = CERTIFIERS.find(([re]) => re.test(t))?.[1];
  }
  return out;
}

export interface HalalEvidenceInput {
  /** Listed in an official certification directory (e.g. MUIS). */
  directory?: string;
  googleHalalType?: boolean;
  osmHalal?: 'yes' | 'only';
  foursquareHalal?: boolean;
  nameSaysHalal?: boolean;
  /** The place's own website. */
  website?: TextScan;
  /** Google reviews + editorial summary. */
  reviews?: TextScan;
  servesAlcoholListed?: boolean;
  /** The AI's reading of the same material. */
  ai?: { tier?: HalalTier | 'unknown'; confidence: number };
  /** Cuisine that's usually halal (Middle Eastern, Turkish, …) — a weak hint only. */
  halalLeaningCuisine?: boolean;
}

export interface HalalScore {
  /** Evidence for (positive) or against (negative) the place being halal. */
  score: number;
  tier?: HalalTier;
  confidence: number;
  certifier?: string;
}

/**
 * Weighs the evidence. Roughly: a certification directory or a named
 * certifier on the website ⇒ certified; two independent halal listings ⇒
 * halal; pork on the menu ⇒ not halal whatever the listings say.
 */
export function scoreHalal(e: HalalEvidenceInput): HalalScore {
  let score = 0;
  const w = e.website;
  const r = e.reviews;
  if (e.directory) score += 3;
  if (w?.certifier) score += 2;
  if (e.googleHalalType) score += 1.2;
  if (e.osmHalal) score += e.osmHalal === 'only' ? 1.2 : 0.9;
  if (e.foursquareHalal) score += 0.8;
  if (e.nameSaysHalal) score += 1;
  if (w?.halal) score += 0.8;
  if (w?.muslimFriendly) score += 0.5;
  if (r) score += Math.min(3, r.halal) * 0.35 + Math.min(2, r.muslimFriendly) * 0.25 + (r.certifier ? 0.6 : 0);
  if (e.halalLeaningCuisine) score += 0.2;
  const aiW = Math.max(0.3, Math.min(1, e.ai?.confidence ?? 0));
  if (e.ai?.tier === 'certified') score += 0.8 * aiW;
  if (e.ai?.tier === 'muslim_owned') score += 0.6 * aiW;
  if (e.ai?.tier === 'not_halal') score -= 1.2 * aiW;
  // Against: pork is decisive; alcohol lowers confidence in a halal kitchen.
  const porkSeen = (w?.pork ?? 0) + (r?.pork ?? 0);
  const noPork = (w?.noPork ?? 0) + (r?.noPork ?? 0);
  if (porkSeen >= 2 || (w?.pork && !w.noPork)) score -= 3;
  else if (porkSeen === 1 && !noPork) score -= 1;
  if (e.servesAlcoholListed) score -= 0.4;

  const certifier = e.directory ?? w?.certifier ?? r?.certifier;
  let tier: HalalTier | undefined;
  if (score <= -1.5) tier = 'not_halal';
  else if ((e.directory || w?.certifier) && score >= 2.5) tier = 'certified';
  else if (score >= 1.8) tier = 'muslim_owned';
  else if (noPork && score >= 0.3) tier = 'pork_free';
  const confidence = Math.max(0.2, Math.min(0.95, 0.35 + Math.abs(score) * 0.15));
  return { score: Math.round(score * 100) / 100, ...(tier ? { tier } : {}), confidence, ...(certifier ? { certifier } : {}) };
}

/** A Google address's Singapore postal code ("Singapore 188396" → "188396"). */
export const sgPostal = (address?: string) => /\bSingapore\s+(\d{6})\b/i.exec(address ?? '')?.[1] ?? null;
