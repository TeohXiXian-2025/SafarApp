// Merges every member's travel preferences into one group view. Used by the
// Group page now, and by hotel recommendations / scheduling in later phases.
import { HALAL_TIERS, type HalalTier } from './common.js';
import type { Member, MemberPrefs } from './trip.js';

export const INTEREST_OPTIONS = [
  'Food',
  'History',
  'Culture',
  'Nature',
  'Shopping',
  'Mosques & Islamic heritage',
  'Theme parks',
  'Photography',
  'Nightlife-free evenings',
  'Kids & family',
] as const;

export const HOTEL_PRIORITY_LABELS: Record<MemberPrefs['hotelPriorities'][number], string> = {
  near_transit: 'Near public transport',
  family_rooms: 'Family / connecting rooms',
  prayer_space_nearby: 'Mosque or prayer room nearby',
  halal_food_nearby: 'Halal food nearby',
  breakfast_included: 'Breakfast included',
  budget_first: 'Lowest price',
  rating_first: 'Best rated',
};

export const HALAL_TIER_LABELS: Record<HalalTier, string> = {
  certified: 'Certified halal only',
  muslim_owned: 'Muslim-owned is fine',
  pork_free: 'Pork-free is fine',
  not_halal: 'No requirement',
};

export interface GroupPrefs {
  respondents: Member[];
  pending: Member[];
  /** Overlap of everyone's nightly hotel range; null if nobody set one. */
  hotelBudget: { min: number; max: number } | null;
  /** True when ranges don't overlap — someone will be over or under budget. */
  hotelBudgetConflict: boolean;
  /** Lowest daily budget anyone set (plan to the tightest wallet). */
  dailyBudget: number | null;
  halalRequiredCount: number;
  /** Strictest tier among members who require halal; drives shared meals. */
  sharedMealTier: HalalTier | null;
  prayerCount: number;
  /** Slowest pace wins so nobody is rushed. */
  pace: MemberPrefs['pace'] | null;
  interests: { label: string; count: number }[];
  hotelPriorities: { key: MemberPrefs['hotelPriorities'][number]; count: number }[];
  warnings: string[];
}

const PACE_ORDER: MemberPrefs['pace'][] = ['relaxed', 'moderate', 'fast'];

function tally<T extends string>(values: T[]): { key: T; count: number }[] {
  const counts = new Map<T, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function mergePrefs(members: Member[]): GroupPrefs {
  const respondents = members.filter((m) => m.prefs);
  const pending = members.filter((m) => !m.prefs);
  const prefs = respondents.map((m) => m.prefs!);
  const warnings: string[] = [];

  // Hotel budget: intersection of ranges.
  const ranges = prefs.map((p) => p.hotelBudget).filter((r): r is { min: number; max: number } => !!r);
  let hotelBudget: GroupPrefs['hotelBudget'] = null;
  let hotelBudgetConflict = false;
  if (ranges.length) {
    const min = Math.max(...ranges.map((r) => r.min));
    const max = Math.min(...ranges.map((r) => r.max));
    hotelBudgetConflict = min > max;
    hotelBudget = { min, max };
    if (hotelBudgetConflict) {
      warnings.push(
        `Hotel budgets don't overlap: someone needs at least ${min} per night, someone else can pay at most ${max}. Talk it through or consider splitting rooms.`,
      );
    }
  }

  const dailies = prefs.map((p) => p.dailyBudget).filter((d): d is number => d !== undefined);
  const dailyBudget = dailies.length ? Math.min(...dailies) : null;

  const halal = prefs.filter((p) => p.halalRequired);
  const sharedMealTier = halal.length
    ? HALAL_TIERS[Math.min(...halal.map((p) => HALAL_TIERS.indexOf(p.halalTier)))]
    : null;
  if (halal.length && halal.length < prefs.length) {
    warnings.push(
      `${halal.length} of ${prefs.length} require halal food. Shared meals will follow "${HALAL_TIER_LABELS[sharedMealTier!]}"; Split Tracks can offer others alternatives.`,
    );
  }

  const paces = prefs.map((p) => p.pace);
  const pace = paces.length ? PACE_ORDER[Math.min(...paces.map((p) => PACE_ORDER.indexOf(p)))] : null;
  if (new Set(paces).size > 1) warnings.push(`Paces differ — the plan will use "${pace}" so nobody is rushed.`);

  if (pending.length) {
    warnings.push(`Waiting for ${pending.map((m) => m.displayName).join(', ')} to set their preferences.`);
  }

  return {
    respondents,
    pending,
    hotelBudget,
    hotelBudgetConflict,
    dailyBudget,
    halalRequiredCount: halal.length,
    sharedMealTier,
    prayerCount: prefs.filter((p) => p.prayerReminders).length,
    pace,
    interests: tally(prefs.flatMap((p) => p.interests)).map(({ key, count }) => ({ label: key, count })),
    hotelPriorities: tally(prefs.flatMap((p) => p.hotelPriorities)),
    warnings,
  };
}
