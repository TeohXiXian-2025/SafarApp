// The Food tab (Halal Radar near you): which bucket a restaurant goes in and
// the label to show, trust-ordered — community reports > photographed
// certificate > halal listings (Google / OpenStreetMap / name) > Halal Radar
// check > AI pre-screen guess from the name & cuisine (never shown as "Halal").
import type { HalalAssessment, HalalSummary } from './idea.js';

export type FoodBucket = 'certified' | 'halal' | 'likely' | 'friendly' | 'pork_free' | 'not_halal' | 'unknown';

export const FOOD_TABS: { key: 'halal' | 'likely' | 'friendly' | 'pork_free' | 'unknown'; label: string; buckets: FoodBucket[] }[] = [
  { key: 'halal', label: 'Halal', buckets: ['certified', 'halal'] },
  { key: 'likely', label: 'Likely halal', buckets: ['likely'] },
  { key: 'friendly', label: 'Muslim-friendly', buckets: ['friendly'] },
  { key: 'pork_free', label: 'Pork-free', buckets: ['pork_free'] },
  { key: 'unknown', label: 'Not sure', buckets: ['unknown'] },
];

/**
 * Countries where most restaurants are halal unless they show otherwise
 * (pork, alcohol, a Chinese kitchen…). Elsewhere a restaurant with no halal
 * sign at all is taken as not halal — meat there isn't halal-slaughtered.
 */
export const MUSLIM_MAJORITY = new Set(['MY', 'ID', 'BN', 'SA', 'AE', 'QA', 'KW', 'OM', 'BH', 'TR', 'EG', 'JO', 'MA', 'TN', 'DZ', 'PK', 'BD', 'MV', 'IR', 'IQ', 'AZ', 'UZ', 'KZ', 'KG', 'TJ', 'TM', 'SN', 'LY', 'SD', 'YE', 'SO', 'DJ', 'GM', 'ML', 'NE', 'AF', 'PS', 'LB', 'AL', 'XK']);

const PORK_TYPES = ['ramen_restaurant', 'barbecue_restaurant', 'bar', 'pub', 'wine_bar', 'bar_and_grill', 'german_restaurant', 'spanish_restaurant', 'hot_pot_restaurant'];
/** Pork itself, anywhere. */
const PORK_WORDS = /豚|猪|돼지|삼겹살|족발|jokbal|bossam|보쌈|samgyeopsal|pork|\bbabi\b|bacon|\bham\b|char siu|siew yuk|bak kut teh|肉骨茶|叉烧|tonkatsu|とんかつ|tonkotsu/i;
/** Usually pork or alcohol outside Muslim countries (ramen broth, yakiniku, izakaya, gyoza…). */
const PORKISH_WORDS = /ramen|ラーメン|拉麺|yakiniku|焼肉|izakaya|居酒屋|yakitori|焼き?鳥|bbq|barbe?cue|shabu|しゃぶ|sukiyaki|すき焼|gyoza|餃子|dim sum|点心|烧肉|brewery|beer hall|\bpub\b/i;
const HALAL_LEANING_TYPES = ['middle_eastern_restaurant', 'turkish_restaurant', 'lebanese_restaurant', 'afghani_restaurant', 'indonesian_restaurant', 'indian_restaurant', 'pakistani_restaurant', 'persian_restaurant', 'malaysian_restaurant'];
const HALAL_LEANING_WORDS = /kebab|kebap|shawarma|doner|döner|falafel|biryani|biriyani|nasi|mamak|arab|persian|turkish|afghan|pakistan|bangla|uyghur|uighur|lanzhou|兰州|新疆|mandi|kabsa|tandoor|curry house|halab|istanbul|ottoman/i;
const MEAT_FREE_TYPES = ['vegetarian_restaurant', 'vegan_restaurant'];
const MEAT_FREE_WORDS = /vegan|vegetarian|ヴィーガン|ベジタリアン|채식|素食|素菜/i;
const SEAFOOD_TYPES = ['seafood_restaurant', 'sushi_restaurant'];
const SNACK_TYPES = ['cafe', 'coffee_shop', 'bakery', 'dessert_shop', 'dessert_restaurant', 'ice_cream_shop', 'confectionery', 'tea_house', 'juice_shop', 'donut_shop', 'chocolate_shop'];

/**
 * A verdict from free signals alone — the restaurant's type and name and the
 * country — for places no one has checked or reported yet. Keeps "not sure"
 * for what really is unclear (e.g. cafés: lard / gelatine are hidden).
 */
export function placeRule(place: { name: string; types?: string[]; typeLabel?: string }, country?: string | null): FoodVerdict | null {
  const types = place.types ?? [];
  const text = `${place.name} ${place.typeLabel ?? ''}`;
  const has = (list: string[]) => types.some((t) => list.includes(t));
  const muslimCountry = !!country && MUSLIM_MAJORITY.has(country.toUpperCase());
  const porky = PORK_WORDS.test(text) || (!muslimCountry && (has(PORK_TYPES) || PORKISH_WORDS.test(text)));
  if (porky) return { bucket: 'not_halal', text: 'Likely serves pork or alcohol', basis: `Its kind of food (${place.typeLabel ?? 'from the name'}) usually does — no halal sign found` };
  if (has(MEAT_FREE_TYPES) || MEAT_FREE_WORDS.test(text)) return { bucket: 'friendly', text: 'Vegetarian — no meat', basis: 'Meat-free kitchen · ask about alcohol / cooking wine (mirin)' };
  if (muslimCountry) {
    // Chinese kitchens (by type, words or a Chinese-character name) are often not halal here.
    if (types.includes('chinese_restaurant') || /chinese|dim sum|kopitiam|茶餐厅/i.test(text) || /[一-鿿]/.test(place.name)) return { bucket: 'unknown', text: 'Not sure — many aren’t halal here', basis: 'Chinese-style kitchen · look for the halal logo or ask' };
    if (has(SNACK_TYPES) || types.some((t) => t.includes('restaurant')) || types.includes('food_court') || types.includes('meal_takeaway')) {
      return { bucket: 'likely', text: 'Likely halal — most places here are', basis: 'Muslim-majority country, no pork or alcohol sign · look for the halal logo' };
    }
    return null;
  }
  if (has(HALAL_LEANING_TYPES) || HALAL_LEANING_WORDS.test(text)) return { bucket: 'likely', text: 'Often halal — ask to be sure', basis: `${place.typeLabel ?? 'This cuisine'} is often Muslim-run, but it isn't listed as halal` };
  if (has(SEAFOOD_TYPES)) return { bucket: 'friendly', text: 'Seafood — no pork usually', basis: 'Fish and seafood are halal · ask about alcohol / cooking wine (mirin, sake)' };
  const meals = types.some((t) => t.includes('restaurant')) || types.includes('meal_takeaway') || types.includes('fast_food_restaurant');
  // Only a real café / bakery (not a burger chain that also has a coffee counter).
  if (has(SNACK_TYPES) && !meals) return { bucket: 'unknown', text: 'Not sure — ask about ingredients', basis: 'Cafés and bakeries may use lard, gelatine or alcohol' };
  if (meals) {
    return { bucket: 'not_halal', text: 'Not halal — no halal sign found', basis: `No halal listing, certificate or traveller report · meat here usually isn't halal-slaughtered` };
  }
  return null;
}

export interface FoodVerdict {
  bucket: FoodBucket;
  text: string;
  /** Where it comes from, always shown. */
  basis: string;
}

/** The AI pre-screen: a guess from a place's name and cuisine, before anyone checks it. */
export interface FoodGuess {
  verdict: 'likely_halal' | 'likely_pork' | 'unknown';
  reason: string;
}

export function foodVerdict(opts: {
  community?: Pick<HalalSummary, 'tier' | 'reportCount' | 'certificate' | 'flags'> & Partial<Pick<HalalSummary, 'lean'>> | null;
  analysis?: Pick<HalalAssessment, 'tier' | 'verdict' | 'flags' | 'source'> | null;
  /** Google halal_restaurant type, OSM diet:halal, or "halal" in the name. */
  listed?: 'google' | 'osm' | 'name' | null;
  guess?: FoodGuess | null;
  /** For the free rules (type, name, country) when nothing better is known. */
  place?: { name: string; types?: string[]; typeLabel?: string } | null;
  country?: string | null;
}): FoodVerdict {
  const { community: c, analysis: a, listed, guess: g } = opts;
  const reports = c ? `${c.reportCount} traveller report${c.reportCount === 1 ? '' : 's'} (all Safar trips)` : '';
  if (c?.tier === 'certified') return { bucket: 'certified', text: c.certificate ? `Certified · ${c.certificate.certifier}` : 'Certified halal', basis: c.certificate ? `Certificate photo + ${reports}` : reports };
  if (c?.tier === 'muslim_owned') return { bucket: 'halal', text: 'Muslim-owned / fully halal', basis: reports };
  if (c?.tier === 'not_halal') return { bucket: 'not_halal', text: 'Not halal', basis: reports };
  if (c?.tier === 'pork_free') return { bucket: 'pork_free', text: 'Pork-free, not halal', basis: reports };
  // One traveller so far (any Safar trip): a strong hint until someone confirms it.
  if (c?.lean === 'certified' || c?.lean === 'muslim_owned') return { bucket: 'likely', text: 'A Safar traveller says halal', basis: `${reports} — one more confirms it` };
  if (a?.flags.servesPork || a?.tier === 'not_halal') return { bucket: 'not_halal', text: 'Serves pork', basis: 'Halal Radar (reviews / website)' };
  if (a?.tier === 'certified') return { bucket: 'certified', text: 'Likely certified', basis: 'Halal Radar (named certifier in reviews / website)' };
  if (listed) return { bucket: 'halal', text: 'Listed as halal', basis: listed === 'google' ? 'Google Maps' : listed === 'osm' ? 'OpenStreetMap' : 'Name says halal' };
  if (a?.tier === 'muslim_owned') return { bucket: 'halal', text: 'Likely Muslim-owned', basis: 'Halal Radar (AI estimate)' };
  if (a?.flags.halalMenuOptions) return { bucket: 'friendly', text: 'Has halal options', basis: 'Halal Radar (reviews / website mention halal dishes)' };
  if (a?.tier === 'pork_free' || a?.flags.servesPork === false) return { bucket: 'pork_free', text: 'No pork reported', basis: 'Halal Radar (reviews / website)' };
  if (g?.verdict === 'likely_halal') return { bucket: 'likely', text: 'Likely halal — not verified', basis: `AI guess from name & cuisine: ${g.reason}` };
  if (g?.verdict === 'likely_pork') return { bucket: 'not_halal', text: 'Likely serves pork', basis: `AI guess from name & cuisine: ${g.reason}` };
  const rule = opts.place ? placeRule(opts.place, opts.country) : null;
  if (rule) return a && rule.bucket === 'not_halal' && rule.text.startsWith('Not halal') ? { ...rule, basis: `Halal Radar found no halal sign · ${rule.basis.split(' · ')[1] ?? ''}`.trim() } : rule;
  return { bucket: 'unknown', text: a ? 'Halal not confirmed' : 'Not checked yet', basis: a ? 'Halal Radar found no listing — ask or report after you eat' : 'Tap “Check” to run the Halal Radar' };
}

const HALAL_NAME = /\bhalal\b|\bmuslim\b|清真|ハラール|할랄|حلال/i;
export const nameSaysHalal = (name: string) => HALAL_NAME.test(name);

/** Live "how long is the wait" reports expire after an hour. */
export const WAIT_TTL_MS = 60 * 60_000;
