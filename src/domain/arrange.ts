// The scheduling engine behind "AI Arrange", reordering a day and prayer
// breaks. Pure functions (no I/O) so every rule is unit-tested:
//
//   dayFrames()      bookings → each day's usable hours, base (hotel) and blocked spans
//   timeSequence()   walks one day's stops in order: travel, opening hours,
//                    locked bookings, meal times and prayer breaks
//   arrangeTrip()    clusters stops into days, orders each day (nearest
//                    neighbour + 2-opt, then meal/prayer-aware local search)
//   prayersInGaps()  prayer breaks for a hand-made day, without moving stops
//
// All times are minutes after local midnight at the day's location — the
// timezone of the trip destination closest to where the group is that day.
import type { GeoPoint } from './common.js';
import type { BookingDraft } from './plan.js';
import { openingRanges, PRAY_MIN, prayerTimesOn, type DayPrayers, type PrayerKey } from './prayer.js';
import { ceil5, DEFAULT_GAP, estimateTravelMin, metersBetween, toMin } from './timeline.js';
import type { Destination, MemberPrefs } from './trip.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Unit {
  /** Idea id — or the original idea's id for a split pair (both run in parallel). */
  id: string;
  loc: GeoPoint;
  duration: number;
  food?: boolean;
  /** Google weekday descriptions ("Monday: 9:00 AM – 5:00 PM"). */
  hours?: string[];
  /** Walk to the nearest prayer space from here (unknown → PRAYER_WALK_DEFAULT). */
  prayerWalkMin?: number;
}

export interface Block {
  start: number;
  end: number;
}

export interface DayFrame {
  day: string;
  /** Earliest start / latest finish for sightseeing. */
  start: number;
  end: number;
  /** Where the day starts and ends (hotel, or where you arrive). */
  base: GeoPoint;
  /** Locked spans (same-day trains, …) nothing may overlap. */
  blocks: Block[];
  /** null → nobody in the group asked for prayer breaks. */
  prayers: DayPrayers | null;
}

export interface PrayerSlot {
  key: PrayerKey;
  start: number;
  end: number;
  /** The stop you pray after (null = before the first stop / at the base). */
  afterId: string | null;
  /** Pray near here. */
  at: GeoPoint;
}

export interface Timed {
  id: string;
  start: number;
  end: number;
}

export type UnfitReason = 'closed' | 'hours' | 'time';
export const UNFIT_TEXT: Record<UnfitReason, string> = {
  closed: 'Closed on the free days',
  hours: "Its opening hours don't fit around the rest of the plan",
  time: 'Not enough free time left in the trip',
};

export interface DayTiming {
  placed: Timed[];
  prayers: PrayerSlot[];
  unfit: { id: string; reason: UnfitReason }[];
  travelMin: number;
  cost: number;
}

type Travel = (a: GeoPoint, b: GeoPoint) => number;

// ─── Constants ──────────────────────────────────────────────────────────────

export const PRAYER_WALK_DEFAULT = 10;
/** Lunch 11:30–14:00 and dinner 18:00–20:30 — food stops are pulled towards these. */
const MEALS: [number, number][] = [
  [11 * 60 + 30, 14 * 60],
  [18 * 60, 20 * 60 + 30],
];
/** How late the day may run and how many stops fit, by the group's slowest pace. */
export const PACE: Record<MemberPrefs['pace'], { end: number; maxStops: number }> = {
  relaxed: { end: 18 * 60 + 30, maxStops: 3 },
  moderate: { end: 20 * 60 + 30, maxStops: 5 },
  fast: { end: 22 * 60, maxStops: 7 },
};
const DAY_START = 9 * 60;
const ORDER: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

// ─── Small helpers ──────────────────────────────────────────────────────────

const travelOr = (travel: Travel, a?: GeoPoint, b?: GeoPoint) => (a && b ? travel(a, b) : DEFAULT_GAP);

/** First start ≥ from where [start, start+duration) avoids every block. */
function avoidBlocks(from: number, duration: number, blocks: Block[]) {
  let start = ceil5(from);
  for (const b of [...blocks].sort((x, y) => x.start - y.start)) {
    if (start < Math.max(b.end, b.start + 1) && start + duration > b.start) start = ceil5(b.end + DEFAULT_GAP);
  }
  return start;
}

const mealPenalty = (u: Unit, start: number) => {
  if (!u.food) return 0;
  return Math.min(...MEALS.map(([a, b]) => (start < a ? a - start : start > b ? start - b : 0)));
};

/** Dhuhr → Asr → Maghrib → Isha, each with when it must be prayed by. Fajr is before any day out. */
function prayerList(p: DayPrayers) {
  return ORDER.slice(1).map((key, i) => {
    const next = ORDER[i + 2];
    return { key, t: p.times[key], by: next ? p.times[next] : p.times[key] + 180 };
  });
}

// ─── One day ────────────────────────────────────────────────────────────────

/**
 * Walks a day's stops in the given order and times them. With `strict`
 * (AI Arrange), stops that are closed, can't fit their opening hours or run
 * past the day's end are dropped as `unfit`; otherwise (reordering by hand)
 * they're kept and the timeline shows a warning instead.
 */
export function timeSequence(frame: DayFrame, units: Unit[], opts: { strict: boolean; travel?: Travel }): DayTiming {
  const travel = opts.travel ?? estimateTravelMin;
  const pending = frame.prayers ? prayerList(frame.prayers).filter((p) => p.by > frame.start + PRAY_MIN && p.t < frame.end) : [];
  const out: DayTiming = { placed: [], prayers: [], unfit: [], travelMin: 0, cost: 0 };
  let cursor = frame.start;
  let prev: { id: string | null; loc: GeoPoint; walk: number } = { id: null, loc: frame.base, walk: 0 };

  const pray = (p: (typeof pending)[number], near: { id: string | null; loc: GeoPoint; walk: number }) => {
    const start = avoidBlocks(Math.max(cursor, p.t), PRAY_MIN + near.walk, frame.blocks);
    out.prayers.push({ key: p.key, start, end: start + PRAY_MIN + near.walk, afterId: near.id, at: near.loc });
    cursor = start + PRAY_MIN + near.walk;
  };

  for (const u of units) {
    const move = travelOr(travel, prev.loc, u.loc);
    // Prayers that come due before we'd get there: pray first, near the last stop.
    while (pending[0] && pending[0].t <= cursor + move) pray(pending.shift()!, prev);

    let start = ceil5(cursor + move);
    const open = openingRanges(u.hours, frame.day);
    if (open?.length === 0 && opts.strict) {
      out.unfit.push({ id: u.id, reason: 'closed' });
      continue;
    }
    if (open?.length) {
      const range = open.find(([o, c]) => Math.max(start, o) + u.duration <= c);
      if (range) start = ceil5(Math.max(start, range[0]));
      else if (opts.strict) {
        out.unfit.push({ id: u.id, reason: 'hours' });
        continue;
      }
    }
    start = avoidBlocks(start, u.duration, frame.blocks);

    // A prayer starting mid-visit whose time runs out before we'd be done: pray on arrival first.
    const walk = u.prayerWalkMin ?? PRAYER_WALK_DEFAULT;
    const due = pending[0];
    if (due && due.t < start + u.duration && due.by < start + u.duration + walk + PRAY_MIN) {
      pending.shift();
      cursor = Math.max(cursor, start);
      pray(due, { id: prev.id, loc: u.loc, walk });
      start = avoidBlocks(cursor, u.duration, frame.blocks);
    }

    const end = start + u.duration;
    if (opts.strict && end > frame.end) {
      out.unfit.push({ id: u.id, reason: 'time' });
      continue;
    }
    out.placed.push({ id: u.id, start, end });
    out.travelMin += move;
    out.cost += move + 0.5 * (start - (cursor + move)) + mealPenalty(u, start);
    cursor = end;
    prev = { id: u.id, loc: u.loc, walk };
  }
  // Prayers that come due by the time the last stop ends: pray before heading back.
  while (pending[0] && pending[0].t <= cursor && out.placed.length) pray(pending.shift()!, prev);

  out.cost += travelOr(travel, prev.loc, frame.base) + 1000 * out.unfit.length;
  return out;
}

// ─── Ordering ───────────────────────────────────────────────────────────────

/** Nearest neighbour from the base, then 2-opt on the round trip. */
export function orderByDistance(base: GeoPoint, units: Unit[]): Unit[] {
  const left = [...units];
  const route: Unit[] = [];
  let at = base;
  while (left.length) {
    left.sort((a, b) => metersBetween(at, a.loc) - metersBetween(at, b.loc));
    const next = left.shift()!;
    route.push(next);
    at = next.loc;
  }
  const pts = [base, ...route.map((u) => u.loc), base];
  const d = (i: number, j: number) => metersBetween(pts[i], pts[j]);
  for (let improved = true, guard = 0; improved && guard < 50; guard++) {
    improved = false;
    for (let i = 1; i < pts.length - 2; i++) {
      for (let k = i + 1; k < pts.length - 1; k++) {
        if (d(i - 1, k) + d(i, k + 1) < d(i - 1, i) + d(k, k + 1) - 1) {
          pts.splice(i, k - i + 1, ...pts.slice(i, k + 1).reverse());
          route.splice(i - 1, k - i + 1, ...route.slice(i - 1, k).reverse());
          improved = true;
        }
      }
    }
  }
  return route;
}

/** Moves single stops to other positions while the timed cost (meals, waiting, prayers, drops) improves. */
function improveOrder(frame: DayFrame, order: Unit[], travel: Travel): { order: Unit[]; timing: DayTiming } {
  let best = order;
  let bestT = timeSequence(frame, best, { strict: true, travel });
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let i = 0; i < best.length; i++) {
      for (let j = 0; j < best.length; j++) {
        if (i === j) continue;
        const cand = [...best];
        cand.splice(j, 0, cand.splice(i, 1)[0]);
        const t = timeSequence(frame, cand, { strict: true, travel });
        if (t.cost < bestT.cost - 0.5) {
          best = cand;
          bestT = t;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { order: best, timing: bestT };
}

// ─── Whole trip ─────────────────────────────────────────────────────────────

export interface ArrangedDay {
  day: string;
  order: Unit[];
  timing: DayTiming;
}

export interface Arrangement {
  days: ArrangedDay[];
  unplaced: { id: string; reason: UnfitReason }[];
}

const freeMinutes = (f: DayFrame) => f.end - f.start - f.blocks.reduce((s, b) => s + Math.max(0, Math.min(b.end, f.end) - Math.max(b.start, f.start)), 0);
/** Rough minutes a day's stops need, travel included. */
const load = (us: Unit[]) => us.reduce((s, u) => s + u.duration + 20, 0);

/** k-means on the map (k = days), seeded by farthest-point so far-apart areas get their own day. */
function cluster(units: Unit[], k: number): Unit[][] {
  if (k <= 1) return [units];
  const seeds = [units[0].loc];
  while (seeds.length < k) {
    const far = units.reduce((best, u) => {
      const d = Math.min(...seeds.map((s) => metersBetween(s, u.loc)));
      return d > best.d ? { u, d } : best;
    }, { u: units[0], d: -1 });
    seeds.push(far.u.loc);
  }
  let centers = seeds;
  let groups: Unit[][] = [];
  for (let iter = 0; iter < 12; iter++) {
    groups = centers.map(() => []);
    for (const u of units) {
      const i = centers.reduce((bi, c, ci) => (metersBetween(c, u.loc) < metersBetween(centers[bi], u.loc) ? ci : bi), 0);
      groups[i].push(u);
    }
    centers = groups.map((g, i) => (g.length ? { lat: g.reduce((s, u) => s + u.loc.lat, 0) / g.length, lng: g.reduce((s, u) => s + u.loc.lng, 0) / g.length } : centers[i]));
  }
  return groups;
}

const centroid = (us: Unit[], fallback: GeoPoint) =>
  us.length ? { lat: us.reduce((s, u) => s + u.loc.lat, 0) / us.length, lng: us.reduce((s, u) => s + u.loc.lng, 0) / us.length } : fallback;

/**
 * Plans every stop across the trip: area clusters → days (closest to that
 * day's hotel), capped by free time and pace, then each day ordered and
 * timed. Stops that fit nowhere come back in `unplaced` with a reason.
 */
export function arrangeTrip(frames: DayFrame[], units: Unit[], opts: { maxStops: number; travel?: Travel }): Arrangement {
  const travel = opts.travel ?? estimateTravelMin;
  const usable = frames.filter((f) => freeMinutes(f) >= 60);
  const unplaced: Arrangement['unplaced'] = [];
  if (!usable.length) return { days: frames.map((f) => ({ day: f.day, order: [], timing: timeSequence(f, [], { strict: true, travel }) })), unplaced: units.map((u) => ({ id: u.id, reason: 'time' })) };

  // 1. Areas → days. Most-loaded clusters pick first; each takes the free day whose base is nearest.
  const groups = cluster(units, Math.min(usable.length, units.length)).sort((a, b) => b.length - a.length);
  const byDay = new Map(usable.map((f) => [f.day, [] as Unit[]]));
  const taken = new Set<string>();
  for (const g of groups) {
    const c = centroid(g, usable[0].base);
    const f = usable.filter((x) => !taken.has(x.day)).sort((a, b) => metersBetween(a.base, c) - metersBetween(b.base, c) || a.day.localeCompare(b.day))[0];
    if (!f) break;
    taken.add(f.day);
    byDay.get(f.day)!.push(...g);
  }

  // 2. Respect free time and pace: overflow (furthest from the day's centre first) moves to the day with room that's nearest.
  const room = (f: DayFrame, us: Unit[]) => us.length < opts.maxStops && load(us) <= freeMinutes(f);
  const pool: Unit[] = [];
  for (const f of usable) {
    const us = byDay.get(f.day)!;
    const c = centroid(us, f.base);
    us.sort((a, b) => metersBetween(a.loc, c) - metersBetween(b.loc, c));
    while (us.length && !(us.length <= opts.maxStops && load(us) <= freeMinutes(f))) pool.push(us.pop()!);
  }
  for (const u of pool.sort((a, b) => b.duration - a.duration)) {
    const f = usable.filter((x) => room(x, [...byDay.get(x.day)!, u])).sort((a, b) => metersBetween(centroid(byDay.get(a.day)!, a.base), u.loc) - metersBetween(centroid(byDay.get(b.day)!, b.base), u.loc))[0];
    if (f) byDay.get(f.day)!.push(u);
    else unplaced.push({ id: u.id, reason: 'time' });
  }

  // 3. Order + time each day; stops that don't fit try every other day before giving up.
  const days = new Map<string, ArrangedDay>();
  for (const f of usable) {
    const r = improveOrder(f, orderByDistance(f.base, byDay.get(f.day)!), travel);
    days.set(f.day, { day: f.day, ...r });
  }
  for (const f of usable) {
    const d = days.get(f.day)!;
    for (const miss of d.timing.unfit) {
      const u = d.order.find((x) => x.id === miss.id)!;
      let best: { day: string; order: Unit[]; timing: DayTiming; delta: number } | null = null;
      for (const g of usable) {
        if (g.day === f.day) continue;
        const other = days.get(g.day)!;
        const kept = other.order.filter((x) => other.timing.placed.some((p) => p.id === x.id));
        if (kept.length >= opts.maxStops) continue;
        for (let i = 0; i <= kept.length; i++) {
          const cand = [...kept.slice(0, i), u, ...kept.slice(i)];
          const t = timeSequence(g, cand, { strict: true, travel });
          if (t.unfit.length) continue;
          const delta = t.cost - other.timing.cost;
          if (!best || delta < best.delta) best = { day: g.day, order: cand, timing: t, delta };
        }
      }
      if (best) days.set(best.day, { day: best.day, order: best.order, timing: best.timing });
      else unplaced.push(miss);
    }
    // Drop the misfits from this day's order (they were placed elsewhere or listed as unplaced).
    const placed = new Set(d.timing.placed.map((p) => p.id));
    days.set(f.day, { ...days.get(f.day)!, order: days.get(f.day)!.order.filter((x) => placed.has(x.id)), timing: { ...days.get(f.day)!.timing, unfit: [] } });
  }

  return {
    days: frames.map((f) => days.get(f.day) ?? { day: f.day, order: [], timing: timeSequence(f, [], { strict: true, travel }) }),
    unplaced,
  };
}

// ─── Prayer breaks on a hand-made day ───────────────────────────────────────

export interface GapStop extends Timed {
  loc?: GeoPoint;
  prayerWalkMin?: number;
}

/**
 * Prayer breaks for a day arranged by hand: each prayer that falls while the
 * group is out goes in the first free gap between its time and the next
 * prayer — stops are never moved. `missed` lists prayers with no such gap.
 */
export function prayersInGaps(prayers: DayPrayers | null, stops: GapStop[], base?: GeoPoint): { prayers: PrayerSlot[]; missed: { key: PrayerKey; from: number; to: number }[] } {
  const out: PrayerSlot[] = [];
  const missed: { key: PrayerKey; from: number; to: number }[] = [];
  if (!prayers || !stops.length) return { prayers: out, missed };
  const sorted = [...stops].sort((a, b) => a.start - b.start);
  const first = sorted[0].start;
  const last = Math.max(...sorted.map((s) => s.end));
  const busy = (s: number, e: number) => sorted.some((x) => x.start < e && Math.max(x.end, x.start + 1) > s) || out.some((p) => p.start < e && p.end > s);

  for (const p of prayerList(prayers)) {
    if (p.t + PRAY_MIN <= first || p.t >= last) continue; // prayed before leaving / after getting back
    const candidates = [Math.max(p.t, first), ...sorted.map((x) => x.end).filter((e) => e >= p.t)].sort((a, b) => a - b);
    let placed = false;
    for (const c of candidates) {
      const s = ceil5(c);
      const anchor = [...sorted].reverse().find((x) => x.end <= s) ?? sorted[0];
      const walk = anchor.prayerWalkMin ?? PRAYER_WALK_DEFAULT;
      const e = s + PRAY_MIN + walk;
      if (e > p.by || busy(s, e)) continue;
      out.push({ key: p.key, start: s, end: e, afterId: anchor.end <= s ? anchor.id : null, at: anchor.loc ?? base ?? { lat: 0, lng: 0 } });
      placed = true;
      break;
    }
    if (!placed) missed.push({ key: p.key, from: p.t, to: p.by });
  }
  return { prayers: out, missed };
}

// ─── Days from bookings ─────────────────────────────────────────────────────

type BookingLike = Pick<BookingDraft, 'kind' | 'startLocal' | 'endLocal'> & { from?: { location: GeoPoint }; to: { location: GeoPoint } };

/** The trip destination nearest a point (its timezone is the local time there). */
export function nearestDestination<D extends Pick<Destination, 'location'>>(destinations: D[], at: GeoPoint): D {
  return [...destinations].sort((a, b) => metersBetween(a.location, at) - metersBetween(b.location, at))[0];
}

/**
 * Each day's usable window and base from the bookings:
 * - arrive (flight +60 min, else +30) → the day can't start before that; you start from there
 * - depart (flight −150 min, else −45) → the day must end by then
 * - same-day journeys are blocked out
 * - nights at a hotel make it the day's base (check-out day included)
 * Prayer times use the nearest destination's timezone (`praying` = someone asked for prayer breaks).
 */
export function dayFrames(
  days: string[],
  bookings: BookingLike[],
  destinations: Pick<Destination, 'location' | 'timezone' | 'countryCode'>[],
  opts: { pace: MemberPrefs['pace']; praying: boolean },
): DayFrame[] {
  const hotels = bookings.filter((b) => b.kind === 'hotel');
  const moves = bookings.filter((b) => b.kind !== 'hotel');
  let lastBase = destinations[0].location;
  return days.map((day) => {
    let start = DAY_START;
    let end = PACE[opts.pace].end;
    const blocks: Block[] = [];
    let arrivedAt: GeoPoint | undefined;
    for (const b of moves) {
      const [sDay, sTime] = b.startLocal.split('T');
      const [eDay, eTime] = b.endLocal.split('T');
      const flight = b.kind === 'flight';
      if (sDay === day && eDay === day && eTime > sTime) {
        // Same-day journey: before it you're at the origin, after it at the destination — block it out.
        blocks.push({ start: toMin(sTime) - (flight ? 120 : 30), end: toMin(eTime) + (flight ? 45 : 15) });
        if (toMin(sTime) < 12 * 60) arrivedAt = b.to.location;
        continue;
      }
      if (sDay === day) end = Math.min(end, toMin(sTime) - (flight ? 150 : 45));
      if (eDay === day) {
        start = Math.max(start, toMin(eTime) + (flight ? 60 : 30));
        arrivedAt = b.to.location;
      }
    }
    const hotel = hotels.find((h) => h.startLocal.slice(0, 10) <= day && day <= h.endLocal.slice(0, 10));
    const base = hotel?.to.location ?? arrivedAt ?? lastBase;
    lastBase = base;
    const dest = nearestDestination(destinations, base);
    return {
      day,
      start: ceil5(start),
      end,
      base,
      blocks,
      prayers: opts.praying ? prayerTimesOn(day, base, dest.timezone, dest.countryCode) : null,
    };
  });
}
