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
  /** The hotel booking made for this stay ("I booked it"); cleared when it's cancelled. */
  bookingId: Id.optional(),
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
  /** One AI sentence on why it fits this group (top options only; from the facts above). */
  note: z.string().max(300).optional(),
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
  destinations: (Pick<Destination, 'location'> & Partial<Pick<Destination, 'arriveDate' | 'leaveDate'>>)[];
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
    // The dates the admin gave each city: you sleep there from arriving until the night before leaving.
    const planned = dests.findIndex((d) => d.arriveDate && d.leaveDate && d.arriveDate <= n && n < d.leaveDate);
    if (planned >= 0) return planned;
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
  // Runs of nights with no clue go to cities nothing points to yet, if they sit between the
  // neighbouring clues in the listed order (KL hotel booked, Penang not: the nights after KL are
  // Penang's) — a city with no booking or plans yet must still get its stay.
  const seen = new Set(clue.filter((c): c is number => c !== null));
  for (let i = 0; i < nights.length; ) {
    if (clue[i] !== null) {
      i++;
      continue;
    }
    let j = i;
    while (j < nights.length && clue[j] === null) j++;
    const prev = i > 0 ? city[i - 1] : null;
    const next = j < nights.length ? city[j] : null;
    const unseen = dests.map((_, k) => k).filter((k) => !seen.has(k) && (prev === null || k > prev) && (next === null || k < next));
    if (unseen.length && firstClue !== -1 && clue.some((c) => c !== null)) {
      for (let k = i; k < j; k++) city[k] = unseen[Math.min(unseen.length - 1, Math.floor(((k - i) * unseen.length) / (j - i)))];
      unseen.forEach((k) => seen.add(k));
    }
    i = j;
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

/** Nights (of the trip) that no stay covers. */
export const nightsWithoutStay = (nights: string[], stays: Pick<Stay, 'checkIn' | 'checkOut'>[]) => nights.filter((n) => !stays.some((s) => s.checkIn <= n && n < s.checkOut));

/**
 * Proposals cut down to the nights no kept stay covers (split where a kept
 * stay sits in the middle) — so re-planning never drops a whole city just
 * because one of its nights overlaps a stay that's being kept.
 */
export function trimProposals(proposals: StayProposal[], kept: Pick<Stay, 'checkIn' | 'checkOut'>[]): StayProposal[] {
  const out: StayProposal[] = [];
  for (const p of proposals) {
    let run: StayProposal | null = null;
    for (let n = p.checkIn; n < p.checkOut; n = nextDay(n)) {
      if (kept.some((k) => k.checkIn <= n && n < k.checkOut)) {
        run = null;
        continue;
      }
      if (run) run.checkOut = nextDay(n);
      else out.push((run = { ...p, checkIn: n, checkOut: nextDay(n) }));
    }
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

// ─── Booking a hotel around the journeys ────────────────────────────────────

/** Arriving within this distance of a hotel = arriving in its city. */
const HOTEL_CITY_M = 60_000;
/** From landing to the hotel door (immigration, bags, the ride in). */
const AFTER_LANDING_MIN = { flight: 90, other: 45 };

interface JourneyLike {
  kind: string;
  carrier?: string;
  number?: string;
  startLocal: string;
  endLocal: string;
  startAt: string;
  endAt: string;
  travellerUids: string[];
  from?: { location: GeoPoint; name: string };
  to: { location: GeoPoint; name: string };
}

const journeyName = (j: Pick<JourneyLike, 'carrier' | 'number' | 'kind'>) => [j.carrier, j.number].filter(Boolean).join(' ') || j.kind;
const hhmm = (local: string) => local.slice(11, 16);

/**
 * Why a hotel stay (check-in / check-out instants, with offsets) doesn't work
 * with the guests' journeys, or null. Catches checking in while still in the
 * air or before landing in that city, and checking out after leaving it.
 */
export function hotelJourneyProblem(
  hotel: { startLocal: string; endLocal: string; startAt: string; endAt: string; travellerUids: string[]; location: GeoPoint },
  journeys: JourneyLike[],
): string | null {
  const inn = Date.parse(hotel.startAt);
  const out = Date.parse(hotel.endAt);
  for (const j of journeys) {
    if (j.kind === 'hotel' || !j.travellerUids.some((u) => hotel.travellerUids.includes(u))) continue;
    const dep = Date.parse(j.startAt);
    const arr = Date.parse(j.endAt);
    const name = journeyName(j);
    const arrivesHere = metersBetween(j.to.location, hotel.location) < HOTEL_CITY_M;
    const leavesHere = !!j.from && metersBetween(j.from.location, hotel.location) < HOTEL_CITY_M;
    // Landing here on check-in day, after the check-in time.
    if (arrivesHere && arr > inn && arr < out && dep < out && j.endLocal.slice(0, 10) === hotel.startLocal.slice(0, 10)) {
      return `Check-in at ${hhmm(hotel.startLocal)} is before ${name} lands at ${hhmm(j.endLocal)}. Set check-in after you arrive (about ${hhmm(j.endLocal)} + the ride in).`;
    }
    if (dep < inn && arr > inn) return `Check-in at ${hhmm(hotel.startLocal)} is while you're on ${name} (${hhmm(j.startLocal)} → ${hhmm(j.endLocal)}).`;
    // Leaving this city before the check-out time on check-out day.
    if (leavesHere && dep < out && dep > inn && j.startLocal.slice(0, 10) === hotel.endLocal.slice(0, 10)) {
      return `Check-out at ${hhmm(hotel.endLocal)} is after ${name} leaves at ${hhmm(j.startLocal)}. Set check-out before you go to the ${j.kind === 'flight' ? 'airport' : 'station'}.`;
    }
    if (dep < out && arr > out) return `Check-out at ${hhmm(hotel.endLocal)} is while you're on ${name} (${hhmm(j.startLocal)} → ${hhmm(j.endLocal)}).`;
  }
  return null;
}

const addMin = (hhmmStr: string, min: number) => {
  const t = Math.max(0, Math.min(23 * 60 + 55, Number(hhmmStr.slice(0, 2)) * 60 + Number(hhmmStr.slice(3, 5)) + min));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * Check-in / check-out (local date + time) to suggest for a stay: the hotel's
 * own times, moved later when you land that day and earlier when you leave.
 */
export function suggestStayTimes(
  stay: { checkIn: string; checkOut: string; location: GeoPoint },
  hotel: { checkIn: string; checkOut: string },
  journeys: Omit<JourneyLike, 'startAt' | 'endAt'>[],
  travellerUids: string[],
): { checkIn: string; checkOut: string; notes: string[] } {
  let inTime = hotel.checkIn;
  let outTime = hotel.checkOut;
  const notes: string[] = [];
  for (const j of journeys) {
    if (j.kind === 'hotel' || !j.travellerUids.some((u) => travellerUids.includes(u))) continue;
    if (j.endLocal.slice(0, 10) === stay.checkIn && metersBetween(j.to.location, stay.location) < HOTEL_CITY_M) {
      const ready = addMin(hhmm(j.endLocal), j.kind === 'flight' ? AFTER_LANDING_MIN.flight : AFTER_LANDING_MIN.other);
      if (ready > inTime) {
        inTime = ready;
        notes.push(`${journeyName(j)} lands at ${hhmm(j.endLocal)}, so check-in is set to ${ready}.`);
      }
    }
    if (j.from && j.startLocal.slice(0, 10) === stay.checkOut && metersBetween(j.from.location, stay.location) < HOTEL_CITY_M) {
      const leave = addMin(hhmm(j.startLocal), -(j.kind === 'flight' ? 180 : 60));
      if (leave < outTime) {
        outTime = leave;
        notes.push(`${journeyName(j)} leaves at ${hhmm(j.startLocal)}, so check-out is set to ${leave}.`);
      }
    }
  }
  return { checkIn: `${stay.checkIn}T${inTime}`, checkOut: `${stay.checkOut}T${outTime}`, notes };
}

// ─── Journeys still to book ─────────────────────────────────────────────────

/** Cities closer than this are one area — no journey needed between them. */
const SAME_AREA_M = 30_000;
/** A station / airport within this distance serves a city. */
const SERVES_CITY_M = 100_000;

export interface TransportGap {
  key: string;
  /** 'there' = getting to the first city, 'between' = city → city, 'home' = leaving the last. */
  kind: 'there' | 'between' | 'home';
  from?: string;
  to?: string;
  /** Local date the journey is expected on. */
  date: string;
  text: string;
}

const dayShift = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Journeys the plan needs but nobody has booked: getting to the first city,
 * each move between cities (from the stays, else the destinations in order),
 * and getting home. Any traveller's booking counts.
 */
export function transportGaps(input: {
  startDate: string;
  endDate: string;
  destinations: (Pick<Destination, 'name' | 'location'> & Partial<Pick<Destination, 'arriveDate'>>)[];
  stays: Pick<Stay, 'destIdx' | 'checkIn' | 'checkOut'>[];
  bookings: { kind: string; startLocal: string; endLocal: string; from?: { location: GeoPoint }; to: { location: GeoPoint } }[];
}): TransportGap[] {
  const moves = input.bookings.filter((b) => b.kind !== 'hotel');
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const within = (d: string, ref: string, before: number, after: number) => d >= dayShift(ref, -before) && d <= dayShift(ref, after);
  const serves = (p: GeoPoint | undefined, i: number) => !!p && metersBetween(p, input.destinations[i].location) < SERVES_CITY_M;
  const out: TransportGap[] = [];
  if (!input.destinations.length) return out;

  // City order and the day each move happens: from each city's dates when given, else from
  // the stays when they cover every city, else the listed order (a missing stay must not hide a move).
  const legs: { from: number; to: number; date: string }[] = [];
  const stays = [...input.stays].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const dated = input.destinations.map((d, i) => ({ i, arrive: d.arriveDate })).filter((d): d is { i: number; arrive: string } => !!d.arrive);
  let order: { idx: number; date: string }[];
  if (dated.length === input.destinations.length) order = dated.sort((a, b) => a.arrive.localeCompare(b.arrive) || a.i - b.i).map((d) => ({ idx: d.i, date: d.arrive }));
  else if (stays.length && input.destinations.every((_, i) => stays.some((s) => s.destIdx === i))) order = stays.map((s) => ({ idx: s.destIdx, date: s.checkIn }));
  else order = input.destinations.map((_, i) => ({ idx: i, date: stays.find((s) => s.destIdx === i)?.checkIn ?? '' }));
  for (let k = 1; k < order.length; k++) if (order[k].idx !== order[k - 1].idx) legs.push({ from: order[k - 1].idx, to: order[k].idx, date: order[k].date });
  const first = order[0]?.idx ?? 0;
  const last = order.at(-1)?.idx ?? input.destinations.length - 1;

  if (!moves.some((b) => within(b.endLocal.slice(0, 10), input.startDate, 2, 1))) {
    out.push({ key: 'there', kind: 'there', to: input.destinations[first].name, date: input.startDate, text: `No transport booked to get to ${input.destinations[first].name} (arriving by ${fmt(input.startDate)}).` });
  }
  for (const l of legs) {
    if (metersBetween(input.destinations[l.from].location, input.destinations[l.to].location) < SAME_AREA_M) continue;
    const booked = moves.some((b) => (serves(b.to.location, l.to) || serves(b.from?.location, l.from)) && (!l.date || within(b.startLocal.slice(0, 10), l.date, 1, 0) || within(b.endLocal.slice(0, 10), l.date, 1, 0)));
    if (booked) continue;
    const [a, b] = [input.destinations[l.from].name, input.destinations[l.to].name];
    out.push({ key: `between:${l.from}>${l.to}:${l.date}`, kind: 'between', from: a, to: b, date: l.date, text: `No transport booked from ${a} to ${b}${l.date ? ` (around ${fmt(l.date)})` : ''} — add the train, bus or flight so the day can be planned.` });
  }
  if (!moves.some((b) => within(b.startLocal.slice(0, 10), input.endDate, 1, 2))) {
    out.push({ key: 'home', kind: 'home', from: input.destinations[last].name, date: input.endDate, text: `No transport booked to get home from ${input.destinations[last].name} (leaving around ${fmt(input.endDate)}).` });
  }
  return out;
}
