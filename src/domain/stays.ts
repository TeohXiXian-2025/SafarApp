// Hotels: the trip's stays (one per city block), which nights still have no
// bed, the group's budget, and how each hotel option is scored.
// Paths: trips/{id}/stays/{stayId} and trips/{id}/stays/{stayId}/hotels/{key}
import { z } from 'zod';
import { GeoPoint, Id, LocalDate, Millis } from './common.js';
import { nearestDestination } from './arrange.js';
import { estimateTravelMin, metersBetween, tripDays } from './timeline.js';
import type { Destination, MemberPrefs } from './trip.js';

export const Stay = z.object({
  id: Id,
  /** Index into trip.destinations. */
  destIdx: z.number().int().min(0).max(19),
  city: z.string().max(200),
  /** First night … the morning you leave. */
  checkIn: LocalDate,
  checkOut: LocalDate,
  /** Middle of this stay's plans — hotels are searched and timed from here. */
  center: GeoPoint,
  /** A landmark near the centre, used as the search phrase ("hotels near …"). */
  nearName: z.string().max(200).optional(),
  /** People per room (prices are per room). */
  perRoom: z.number().int().min(1).max(8).default(2),
  /** The admin's pick among the options. */
  chosenKey: z.string().max(300).optional(),
  search: z
    .object({
      at: Millis,
      /** google = live Google Hotels prices; sample = test prices (search limit reached). */
      source: z.enum(['google', 'sample']),
      count: z.number().int().nonnegative(),
    })
    .optional(),
  createdBy: Id,
  createdAt: Millis,
  updatedAt: Millis,
});
export type Stay = z.infer<typeof Stay>;

export const HotelVote = z.enum(['up', 'down']);

export const HotelOption = z.object({
  key: z.string().max(300),
  name: z.string().min(1).max(200),
  kind: z.enum(['hotel', 'rental']),
  location: GeoPoint,
  address: z.string().max(300).optional(),
  stars: z.number().min(0).max(5).optional(),
  /** 0–5. */
  rating: z.number().min(0).max(5).optional(),
  reviews: z.number().int().nonnegative().optional(),
  /** Per room per night, trip currency, minor units. */
  nightlyMinor: z.number().int().nonnegative().optional(),
  totalMinor: z.number().int().nonnegative().optional(),
  priceSource: z.enum(['google', 'sample']),
  /** The hotel's page (Google Hotels / official site). */
  link: z.string().url().max(2000).optional(),
  /** For fetching per-site prices (Google Hotels). */
  token: z.string().max(500).optional(),
  images: z.array(z.string().url().max(2000)).max(4).default([]),
  amenities: z.array(z.string().max(80)).max(20).default([]),
  checkInTime: z.string().max(20).optional(),
  checkOutTime: z.string().max(20).optional(),
  /** Nearest station and minutes on foot, if Google lists one. */
  transit: z.object({ name: z.string().max(200), walkMin: z.number().int().nonnegative() }).optional(),
  /** Average minutes to this stay's planned stops. */
  travelMin: z.number().int().nonnegative(),
  mosqueM: z.number().int().nonnegative().optional(),
  halalNearby: z.number().int().nonnegative().optional(),
  score: z.number().int().min(0).max(100),
  why: z.array(z.string().max(120)).max(8),
  votes: z.record(z.string(), HotelVote).default({}),
  /** Where to book, per site (loaded when someone opens the hotel). */
  offers: z
    .array(z.object({ source: z.string().max(80), nightlyMinor: z.number().int().nonnegative().optional(), link: z.string().url().max(2000), official: z.boolean().default(false) }))
    .max(12)
    .optional(),
  offersAt: Millis.optional(),
  rank: z.number().int().nonnegative(),
});
export type HotelOption = z.infer<typeof HotelOption>;

// ─── Nights & stays ──────────────────────────────────────────────────────────

/** The nights of the trip (each date you sleep somewhere; the last day has none). */
export const tripNights = (startDate: string, endDate: string) => tripDays(startDate, endDate).slice(0, -1);

interface HotelLike {
  kind: string;
  startLocal: string;
  endLocal: string;
  to: { location: GeoPoint };
}

const covers = (h: HotelLike, night: string) => h.startLocal.slice(0, 10) <= night && night < h.endLocal.slice(0, 10);

/** Nights no hotel booking covers ("No place to sleep on 10 Dec"). */
export function uncoveredNights(nights: string[], bookings: HotelLike[]): string[] {
  const hotels = bookings.filter((b) => b.kind === 'hotel');
  return nights.filter((n) => !hotels.some((h) => covers(h, n)));
}

export interface StayProposal {
  destIdx: number;
  checkIn: string;
  checkOut: string;
  center: GeoPoint;
  /** The stop nearest the centre (for "hotels near …"). */
  nearName?: string;
}

const NEAR_DEST_M = 60_000;

/**
 * One stay per block of nights in the same city. Which city each night is in:
 * a hotel already booked → where you are that evening / next morning (the
 * timeline) → where the last journey took you → the night before; nights with
 * no clue at all are shared out over the destinations in order.
 */
export function proposeStays(input: {
  startDate: string;
  endDate: string;
  destinations: Pick<Destination, 'location'>[];
  bookings: (HotelLike & { from?: { location: GeoPoint } })[];
  stops: { day: string; start: string; name: string; location: GeoPoint }[];
  /** Places on the Idea Board not yet scheduled (help place the centre). */
  backlog?: { name: string; location: GeoPoint }[];
}): StayProposal[] {
  const { destinations: dests } = input;
  const nights = tripNights(input.startDate, input.endDate);
  if (!nights.length || !dests.length) return [];
  const idxOf = (p: GeoPoint) => dests.indexOf(nearestDestination(dests, p));
  const inTrip = (p: GeoPoint) => metersBetween(nearestDestination(dests, p).location, p) < NEAR_DEST_M;
  const hotels = input.bookings.filter((b) => b.kind === 'hotel');
  const moves = input.bookings.filter((b) => b.kind !== 'hotel').sort((a, b) => a.endLocal.localeCompare(b.endLocal));
  const byDay = new Map<string, typeof input.stops>();
  for (const s of [...input.stops].sort((a, b) => a.start.localeCompare(b.start))) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);

  const clue: (number | null)[] = nights.map((n) => {
    const h = hotels.find((x) => covers(x, n));
    if (h) return idxOf(h.to.location);
    const evening = byDay.get(n)?.at(-1)?.location ?? byDay.get(nextDay(n))?.[0]?.location;
    if (evening && inTrip(evening)) return idxOf(evening);
    const arrived = moves.filter((m) => m.endLocal.slice(0, 10) === n && inTrip(m.to.location)).at(-1);
    return arrived ? idxOf(arrived.to.location) : null;
  });
  // Fill gaps: carry the previous city forward (then backward for leading gaps).
  let firstClue = clue.findIndex((c) => c !== null);
  const city = clue.slice();
  if (firstClue === -1) {
    // Nothing to go on: share the nights over the destinations in order.
    nights.forEach((_, i) => (city[i] = Math.min(dests.length - 1, Math.floor((i * dests.length) / nights.length))));
    firstClue = 0;
  }
  for (let i = 0; i < nights.length; i++) if (city[i] === null) city[i] = i < firstClue ? city[firstClue] : city[i - 1];

  const out: StayProposal[] = [];
  nights.forEach((n, i) => {
    const last = out.at(-1);
    if (last && last.destIdx === city[i]) last.checkOut = nextDay(n);
    else out.push({ destIdx: city[i]!, checkIn: n, checkOut: nextDay(n), center: dests[city[i]!].location });
  });
  // Centre = the middle of that stay's planned stops in that city (else Idea Board places there).
  for (const s of out) {
    const near = (p: GeoPoint) => idxOf(p) === s.destIdx && inTrip(p);
    let pts = input.stops.filter((x) => x.day >= s.checkIn && x.day <= s.checkOut && near(x.location));
    if (!pts.length) pts = (input.backlog ?? []).filter((x) => near(x.location)).map((x) => ({ ...x, day: '', start: '' }));
    if (!pts.length) continue;
    s.center = centroid(pts.map((p) => p.location));
    s.nearName = pts.reduce((a, b) => (metersBetween(a.location, s.center) <= metersBetween(b.location, s.center) ? a : b)).name;
  }
  return out;
}

/** The date after `d` (YYYY-MM-DD). */
export const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export const centroid = (ps: GeoPoint[]): GeoPoint => ({
  lat: ps.reduce((s, p) => s + p.lat, 0) / ps.length,
  lng: ps.reduce((s, p) => s + p.lng, 0) / ps.length,
});

// ─── Budget & scoring ────────────────────────────────────────────────────────

/**
 * Per room per night (trip currency, major units): where everyone's hotel
 * budgets overlap. If they don't overlap, the middle of them (`overlap` false).
 */
export function groupHotelBudget(prefs: (MemberPrefs | undefined)[]): { min: number; max: number; overlap: boolean; people: number } | null {
  const ranges = prefs.map((p) => p?.hotelBudget).filter((r): r is { min: number; max: number } => !!r && r.max > 0);
  if (!ranges.length) return null;
  const min = Math.max(...ranges.map((r) => r.min));
  const max = Math.min(...ranges.map((r) => r.max));
  if (min <= max) return { min, max, overlap: true, people: ranges.length };
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const lo = med(ranges.map((r) => r.min));
  return { min: lo, max: Math.max(lo, med(ranges.map((r) => r.max))), overlap: false, people: ranges.length };
}

export interface ScoreInput {
  nightlyMinor?: number;
  rating?: number;
  reviews?: number;
  amenities: string[];
  kind: 'hotel' | 'rental';
  transit?: { walkMin: number };
  travelMin: number;
  mosqueM?: number;
  halalNearby?: number;
}

export interface ScoreContext {
  /** Minor units, per room per night. */
  budget: { min: number; max: number } | null;
  /** Everyone's hotel priorities, one entry per member. */
  priorities: MemberPrefs['hotelPriorities'][];
  /** Someone needs halal food or asked for prayer breaks. */
  muslim: boolean;
  money: (minor: number) => string;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const freeBreakfast = (amenities: string[]) => amenities.some((a) => /breakfast/i.test(a) && !/\(\$\)|paid/i.test(a));
const familyFriendly = (h: Pick<ScoreInput, 'amenities' | 'kind'>) => h.kind === 'rental' || h.amenities.some((a) => /family|kitchen|kid/i.test(a));

/** 0–100 plus the reasons, weighted by what the group said matters. */
export function scoreHotel(h: ScoreInput, ctx: ScoreContext): { score: number; why: string[] } {
  const want = (p: MemberPrefs['hotelPriorities'][number]) => ctx.priorities.filter((l) => l.includes(p)).length;
  const w = {
    budget: 3 + want('budget_first'),
    /** Cheaper is better — only for people who put budget first. */
    cheap: 2 * want('budget_first'),
    route: 3 + want('near_transit'),
    rating: 2 + 2 * want('rating_first'),
    muslim: ctx.muslim ? 2 + 2 * (want('prayer_space_nearby') + want('halal_food_nearby')) : want('prayer_space_nearby') + want('halal_food_nearby'),
    extras: want('breakfast_included') + want('family_rooms') + want('near_transit'),
  };
  const why: string[] = [];

  let budget = 0.6;
  let cheap = 0.5;
  if (h.nightlyMinor !== undefined && ctx.budget) {
    const { min, max } = ctx.budget;
    const p = h.nightlyMinor;
    budget = p <= max ? (p >= min ? 1 : 0.85) : clamp01(1 - ((p - max) / Math.max(max, 1)) * 4);
    cheap = clamp01(1 - p / (Math.max(max, 1) * 1.5));
    why.push(p <= max ? (p >= min ? 'Within budget' : 'Under budget') : `${ctx.money(p - max)} over budget`);
  }

  const route = clamp01(1 - (h.travelMin - 8) / 35);
  why.push(`~${h.travelMin} min to your stops`);

  const conf = clamp01((h.reviews ?? 0) / 300);
  const rating = h.rating ? clamp01((h.rating - 3) / 2) * (0.6 + 0.4 * conf) + 0.2 * (1 - conf) : 0.35;
  if (h.rating) why.push(`★ ${h.rating.toFixed(1)}${h.reviews ? ` (${h.reviews.toLocaleString('en')})` : ''}`);

  let muslim = 0.3;
  if (h.mosqueM !== undefined || h.halalNearby !== undefined) {
    const m = h.mosqueM === undefined ? 0 : h.mosqueM <= 500 ? 0.5 : h.mosqueM <= 1000 ? 0.35 : h.mosqueM <= 2000 ? 0.15 : 0;
    const f = !h.halalNearby ? 0 : h.halalNearby >= 5 ? 0.5 : h.halalNearby >= 2 ? 0.35 : 0.2;
    muslim = m + f;
    if (ctx.muslim || w.muslim) {
      if (h.mosqueM !== undefined && h.mosqueM <= 2000) why.push(`Mosque ${h.mosqueM < 1000 ? `${Math.round(h.mosqueM / 50) * 50} m` : `${(h.mosqueM / 1000).toFixed(1)} km`}`);
      if (h.halalNearby) why.push(`${h.halalNearby}${h.halalNearby >= 20 ? '+' : ''} halal places nearby`);
    }
  }

  const wanted: [boolean, number, string][] = [
    [freeBreakfast(h.amenities), want('breakfast_included'), 'Free breakfast'],
    [familyFriendly(h), want('family_rooms'), h.kind === 'rental' ? 'Whole apartment' : 'Family rooms'],
    [!!h.transit && h.transit.walkMin <= 10, want('near_transit'), 'Near transit'],
  ];
  const asked = wanted.reduce((s, [, n]) => s + n, 0);
  const extras = asked ? wanted.reduce((s, [ok, n]) => s + (ok ? n : 0), 0) / asked : 0;
  for (const [ok, n, label] of wanted) if (ok && (n || label === 'Free breakfast')) why.push(label);

  const total = w.budget + w.cheap + w.route + w.rating + w.muslim + w.extras;
  const score = (w.budget * budget + w.cheap * cheap + w.route * route + w.rating * rating + w.muslim * muslim + w.extras * extras) / total;
  return { score: Math.round(score * 100), why: why.slice(0, 6) };
}

/** Everyone's average minutes from the hotel to a set of stops (or the centre). */
export const avgTravelMin = (from: GeoPoint, to: GeoPoint[]) => Math.round(to.reduce((s, p) => s + estimateTravelMin(from, p), 0) / Math.max(1, to.length));
