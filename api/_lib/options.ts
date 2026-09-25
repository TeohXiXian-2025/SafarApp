// Middle grounds for the people not going to a place. Every option is
// something the timeline can actually hold:
//   alternative → a real nearby place (≤ 1.2 km) that suits their reasons
//   timing      → a time window that works (e.g. between two prayers)
//   join        → "I'll join after all"
//   free_time   → free time nearby, meet the group after
import {
  estimateTravelMin,
  MAX_ALTERNATIVES,
  toClock,
  visitPlan,
  type Idea,
  type IdeaCategory,
  type Member,
  type MiddleOption,
  type Trip,
  type VoteReasonTag,
} from '../../src/domain/index.js';
import { searchNearby } from './places.js';

/** How far an alternative may be (≈ 15 min walk). */
export const ALT_RADIUS_M = 1200;

/** The same kind of place, by the original's category. */
const SAME_KIND: Record<IdeaCategory, string[]> = {
  food: ['restaurant'],
  attraction: ['tourist_attraction', 'museum'],
  activity: ['tourist_attraction', 'amusement_park'],
  shopping: ['shopping_mall', 'market'],
  nature: ['park'],
  culture: ['museum', 'art_gallery'],
  nightlife: ['cafe'], // an alcohol-free evening spot
  other: ['tourist_attraction', 'cafe'],
};
/** Something different and easy-going, for "not interested" / "been before". */
const DIFFERENT_KIND: Record<IdeaCategory, string[]> = {
  food: ['cafe'],
  attraction: ['cafe', 'park'],
  activity: ['cafe', 'park'],
  shopping: ['cafe', 'park'],
  nature: ['cafe', 'shopping_mall'],
  culture: ['cafe', 'park'],
  nightlife: ['cafe', 'dessert_shop'],
  other: ['cafe', 'park'],
};

const JOIN: MiddleOption = { id: 'join', type: 'join', title: "I'll join after all", detail: 'Go with the group — add a note if you need anything.' };
const FREE: MiddleOption = { id: 'free', type: 'free_time', title: 'Free time nearby', detail: 'Rest, shop or explore on your own, then meet the group after.' };

export async function buildOptions(opts: {
  idea: Idea;
  trip: Trip;
  /** Members who aren't going (their prefs and 👎 reasons shape the options). */
  choosers: Member[];
  /** Places already on the board or shown before. */
  excludePlaceIds: Set<string>;
  /** Options to keep (someone already picked them). */
  keep: MiddleOption[];
}): Promise<MiddleOption[]> {
  const { idea, choosers } = opts;
  const tags = new Set(choosers.map((m) => idea.votes[m.uid]?.tag).filter(Boolean) as VoteReasonTag[]);
  const food = idea.place.category === 'food';
  const needsHalal = food && (tags.has('halal') || choosers.some((m) => m.prefs?.halalRequired));
  const exclude = new Set([...opts.excludePlaceIds, ...opts.keep.flatMap((o) => (o.place ? [o.place.placeId] : []))]);
  if (idea.place.placeId) exclude.add(idea.place.placeId);

  const alternatives: MiddleOption[] = opts.keep.filter((o) => o.type === 'alternative');
  const add = (p: { placeId: string; name: string; location: { lat: number; lng: number } }, why: string, halalListed = false) => {
    if (alternatives.length >= MAX_ALTERNATIVES || exclude.has(p.placeId)) return;
    exclude.add(p.placeId);
    const walkMin = estimateTravelMin(idea.place.location, p.location);
    alternatives.push({
      id: `alt_${p.placeId.slice(-12)}`,
      type: 'alternative',
      title: `Go to ${p.name}`,
      detail: `${why} · ${walkMin} min walk · meet the group back at ${idea.place.name}`,
      place: { placeId: p.placeId, name: p.name, location: p.location, walkMin, ...(halalListed ? { halalListed } : {}) },
    });
  };

  // 1. Halal needs: halal-listed places the Halal Radar already found nearby, then a live search.
  if (needsHalal) {
    for (const p of idea.halal?.halalFood?.places ?? []) if (p.placeId) add({ placeId: p.placeId, name: p.name, location: p.location }, 'Halal-listed', true);
    if (alternatives.length < MAX_ALTERNATIVES) {
      for (const p of (await searchNearby(idea.place.location, ['halal_restaurant'], ALT_RADIUS_M, 8)) ?? []) add(p, 'Halal-listed', true);
    }
  }
  // 2. The same kind of place, unless they said they're not interested / been before.
  const wantsDifferent = tags.has('not_interested') || tags.has('been_before');
  if (alternatives.length < MAX_ALTERNATIVES && !needsHalal) {
    const types = wantsDifferent ? DIFFERENT_KIND[idea.place.category] : SAME_KIND[idea.place.category];
    for (const p of (await searchNearby(idea.place.location, types, ALT_RADIUS_M, 8)) ?? []) add(p, wantsDifferent ? 'Something different nearby' : 'Similar place nearby');
  }
  // 3. Still room: something easy-going nearby.
  if (alternatives.length < MAX_ALTERNATIVES && !needsHalal) {
    for (const p of (await searchNearby(idea.place.location, DIFFERENT_KIND[idea.place.category], ALT_RADIUS_M, 8)) ?? []) add(p, 'Nearby option');
  }

  // Timing: a window that fits between prayers / opening hours, for "timing" reasons or prayer conflicts.
  const out: MiddleOption[] = [...alternatives];
  const timingKept = opts.keep.find((o) => o.type === 'timing');
  if (timingKept) out.push(timingKept);
  else if (tags.has('timing') || choosers.some((m) => m.prefs?.prayerReminders)) {
    const w = visitPlan(idea, opts.trip).windows[0];
    if (w) {
      const label = w.after === 'sunrise' ? 'in the morning' : `after ${w.after[0].toUpperCase()}${w.after.slice(1)}`;
      out.push({
        id: 'time',
        type: 'timing',
        title: `Go ${label} instead`,
        detail: `Everyone visits between ${fmt(w.start)} and ${fmt(w.end)} — clear of prayer times and within opening hours.`,
        window: { start: toClock(w.start), end: toClock(w.end) },
      });
    }
  }
  out.push(JOIN, FREE);
  return out;
}

const fmt = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  return `${h % 12 || 12}:${String(min % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
