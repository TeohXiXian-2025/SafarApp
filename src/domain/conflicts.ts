// Which members' preferences an idea conflicts with — shared by the Idea Board
// (what people see) and the server (what the AI resolves). Pure function.
import { HALAL_TIERS, tierSatisfies, type HalalTier } from './common.js';
import type { Idea } from './idea.js';
import { HALAL_TIER_LABELS } from './prefs.js';
import type { Member } from './trip.js';

export type ConflictKind = 'halal' | 'pork' | 'alcohol' | 'prayer' | 'budget' | 'not_friendly';

export interface Conflict {
  uid: string;
  name: string;
  kind: ConflictKind;
  /** blocker = they can't join as-is; warning = they may be uncomfortable. */
  severity: 'blocker' | 'warning';
  detail: string;
}

/** Rough typical spend per person for one meal by Google price level, in USD. */
const MEAL_USD: Record<number, number> = { 1: 8, 2: 18, 3: 45, 4: 90 };
/** Approximate USD → currency rates, only for "might be pricey" hints (not money maths). */
const USD_TO: Record<string, number> = {
  USD: 1, MYR: 4.3, SGD: 1.3, IDR: 16000, BND: 1.3, THB: 34, JPY: 150, KRW: 1350, CNY: 7.2, HKD: 7.8, TWD: 32,
  EUR: 0.92, GBP: 0.78, AUD: 1.5, NZD: 1.65, SAR: 3.75, AED: 3.67, QAR: 3.64, TRY: 34, EGP: 48, INR: 84, PKR: 280, CAD: 1.37, CHF: 0.88,
};

const PRAYER_KM = { walkable: '≤ 10 min walk', nearby: '≤ 25 min walk' } as const;

export function ideaConflicts(idea: Idea, members: Member[], opts: { currency?: string; communityTier?: HalalTier } = {}): Conflict[] {
  const out: Conflict[] = [];
  const h = idea.halal;
  const food = idea.place.category === 'food';
  const tier = opts.communityTier ?? h?.tier;
  const listedOnly = !opts.communityTier && h && h.source !== 'ai_estimate' && h.source !== 'verified_certificate';

  for (const m of members) {
    const p = m.prefs;
    if (!p) continue;
    const add = (kind: ConflictKind, severity: Conflict['severity'], detail: string) => out.push({ uid: m.uid, name: m.displayName, kind, severity, detail });

    if (p.halalRequired && h) {
      if (h.verdict === 'not_friendly') {
        add('not_friendly', 'blocker', food ? 'This place is marked not halal.' : 'This place is marked not Muslim-friendly.');
      } else if (food) {
        const required = p.halalTier === 'not_halal' ? 'pork_free' : p.halalTier;
        if (h.flags.servesPork) add('pork', 'blocker', 'Serves pork.');
        else if (tier && !tierSatisfies(tier, required)) {
          add('halal', 'blocker', `Needs "${HALAL_TIER_LABELS[required]}" — this place is ${HALAL_TIER_LABELS[tier].toLowerCase()}.`);
        } else if (!tier) {
          add('halal', 'warning', `Needs "${HALAL_TIER_LABELS[required]}" — halal status here is unconfirmed.`);
        } else if (required === 'certified' && tier === 'certified' && listedOnly) {
          add('halal', 'warning', 'Needs certified halal — it is listed as halal but no certificate has been confirmed.');
        }
      }
      if (h.flags.servesAlcohol) add('alcohol', 'warning', food ? 'Serves alcohol.' : 'Alcohol is served here.');
    }

    if (p.prayerReminders && h?.prayer && h.prayer.access === 'far') {
      const nearest = h.prayer.places[0];
      add('prayer', 'warning', nearest ? `Nearest prayer space is ${nearest.name}, ${nearest.walkMin} min walk away.` : 'No mosque or prayer room found within 2 km.');
    }

    if (food && p.dailyBudget && idea.place.priceLevel && opts.currency && USD_TO[opts.currency]) {
      const meal = MEAL_USD[idea.place.priceLevel] * USD_TO[opts.currency];
      if (meal > p.dailyBudget * 0.6) {
        const round = (n: number) => (n >= 100 ? Math.round(n / 10) * 10 : Math.round(n));
        add('budget', 'warning', `Meals here are often ~${opts.currency} ${round(meal)} — most of the ${opts.currency} ${p.dailyBudget} daily budget.`);
      }
    }
  }
  return out;
}

/** Stable key for a set of conflicts — AI suggestions are regenerated when it changes. */
export const conflictKey = (cs: Conflict[]) =>
  cs
    .map((c) => `${c.uid}:${c.kind}:${c.severity}`)
    .sort()
    .join('|')
    .slice(0, 500);

export const PRAYER_ACCESS_LABEL = {
  onsite: 'Prayer space on site',
  walkable: `Prayer space nearby (${PRAYER_KM.walkable})`,
  nearby: `Prayer space within reach (${PRAYER_KM.nearby})`,
  far: 'No prayer space close by',
  unknown: 'Prayer spaces unknown',
} as const;

export { HALAL_TIERS };
