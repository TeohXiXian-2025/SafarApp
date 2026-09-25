// The scheduling engine behind "AI Arrange", reordering a day and prayer
// breaks. Pure functions (no I/O) so every rule is unit-tested:
//
//   dayFrames()      bookings → each day's usable hours, base (hotel) and blocked spans
//   timeSequence()   walks one day's stops in order: travel (+ buffer), opening
//                    hours, locked bookings, meal times and locked prayer times
//   arrangeTrip()    clusters stops into days, orders each day (nearest
//                    neighbour + 2-opt, then meal/prayer-aware local search)
//   prayerBreaks()   prayer breaks for a hand-made day, without moving stops
//
// Prayer breaks are pinned to the prayer's time, like a booking: stops are
// planned around them. Only where you pray moves (near the stop before it).
// Long visits (LONG_VISIT_MIN+) may run through a prayer time: you pray there.
//
// All times are minutes after local midnight at the day's location — the
// timezone of the trip destination closest to where the group is that day.
import type { GeoPoint } from './common.js';
import type { BookingDraft } from './plan.js';
import { openingRanges, PRAY_MIN, prayerTimesOn, type DayPrayers, type PrayerKey } from './prayer.js';
import { BUFFER_MIN, ceil5, DEFAULT_GAP, estimateTravelMin, LONG_VISIT_MIN, metersBetween, toMin } from './timeline.js';
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
  /** Must happen within this window (a timing middle ground the admin accepted). */
  window?: [number, number];
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
  /**
   * False when there's no hotel or arrival that day: `base` is then just the
   * destination's centre (for a country that can be hundreds of km away), so
   * no travel is charged from or back to it.
   */
  baseKnown: boolean;
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

/** A prayer break: its own time (from the adhan, rounded to 5 min) + walking to the prayer space and back. */
export const PRAYER_BLOCK_MIN = PRAY_MIN + PRAYER_WALK_DEFAULT;

export interface LockedPrayer {
  key: PrayerKey;
  start: number;
  end: number;
}

/** Dhuhr, Asr, Maghrib and Isha, locked at their times. Fajr is before any day out. */
export function lockedPrayers(p: DayPrayers | null): LockedPrayer[] {
  if (!p) return [];
  return ORDER.slice(1).map((key) => {
    const start = ceil5(p.times[key]);
    return { key, start, end: start + PRAYER_BLOCK_MIN };
  });
}

/** How long a visit lasts from `start`: long ones get PRAY_MIN for each prayer time inside them. */
function lengthWith(prayers: LockedPrayer[], start: number, duration: number) {
  if (duration < LONG_VISIT_MIN) return duration;
  let d = duration;
  for (const p of prayers) if (p.start >= start && p.start < start + d) d += PRAY_MIN;
  return d;
}

/** Travel from `from` for `move` minutes, pausing for any prayer on the way. */
function arriveAfter(prayers: LockedPrayer[], from: number, move: number) {
  let t = from + move;
  for (const p of prayers) if (p.start < t && p.end > from) t += p.end - Math.max(p.start, from);
  return t;
}

/** Where each prayer of a planned day is prayed, for the prayers that fall while the group is out. */
function placePrayers(prayers: LockedPrayer[], placed: (Timed & { loc: GeoPoint })[], leftAt: number, base: GeoPoint): PrayerSlot[] {
  if (!placed.length) return [];
  const last = Math.max(...placed.map((x) => x.end));
  return prayers
    .filter((p) => p.end > leftAt && p.start < last)
    .map((p) => {
      const inside = placed.find((x) => x.start <= p.start && x.end > p.start);
      const before = [...placed].reverse().find((x) => x.end <= p.start);
      const near = inside ?? before;
      return { key: p.key, start: p.start, end: p.end, afterId: near?.id ?? null, at: near?.loc ?? placed[0]?.loc ?? base };
    });
}

// ─── One day ────────────────────────────────────────────────────────────────

/**
 * Walks a day's stops in the given order and times them. With `strict`
 * (AI Arrange), stops that are closed, can't fit their opening hours or run
 * past the day's end are dropped as `unfit`; otherwise (reordering by hand)
 * they're kept and the timeline shows a warning instead.
 */
export function timeSequence(frame: DayFrame, units: Unit[], opts: { strict: boolean; travel?: Travel; buffer?: number }): DayTiming {
  const travel = opts.travel ?? estimateTravelMin;
  const buffer = opts.buffer ?? BUFFER_MIN;
  const prayers = lockedPrayers(frame.prayers);
  const out: DayTiming = { placed: [], prayers: [], unfit: [], travelMin: 0, cost: 0 };
  const placed: (Timed & { loc: GeoPoint })[] = [];
  let cursor = frame.start;
  let leftAt = frame.start;
  let prevLoc: GeoPoint = frame.base;
  // Unknown start point: begin at the first stop instead of a guessed centre.
  let fromPrev = frame.baseKnown;

  for (const u of units) {
    const move = fromPrev ? travelOr(travel, prevLoc, u.loc) : 0;
    const hoursOpen = openingRanges(u.hours, frame.day);
    // A required window narrows the opening hours (or stands in for them).
    const open = u.window
      ? (hoursOpen ?? [[0, 24 * 60] as [number, number]]).map(([o, c]) => [Math.max(o, u.window![0]), Math.min(c, u.window![1])] as [number, number]).filter(([o, c]) => c > o)
      : hoursOpen;
    if (open?.length === 0 && opts.strict) {
      out.unfit.push({ id: u.id, reason: 'closed' });
      continue;
    }
    // Short visits step around prayer times like around a booking; long ones pray there.
    const blocks = u.duration >= LONG_VISIT_MIN ? frame.blocks : [...frame.blocks, ...prayers];
    const len = (s: number) => lengthWith(prayers, s, u.duration);
    /**
     * Earliest start >= from that is inside opening hours AND clear of locked
     * bookings and prayer times — re-checked after every shift, so stepping
     * around one can never push a visit past closing time. null = no fit.
     */
    const fit = (from: number): number | null => {
      let s = ceil5(from);
      for (let guard = 0; guard < 16; guard++) {
        if (open?.length) {
          const range = open.find(([o, c]) => Math.max(s, o) + len(Math.max(s, o)) <= c);
          if (!range) return null;
          s = ceil5(Math.max(s, range[0]));
        }
        const moved = avoidBlocks(s, len(s), blocks);
        if (moved === s) return s;
        s = moved;
      }
      return null;
    };

    const ready = arriveAfter(prayers, cursor, move + (fromPrev ? buffer : 0));
    let start = fit(ready);
    if (start === null) {
      if (opts.strict) {
        out.unfit.push({ id: u.id, reason: 'hours' });
        continue;
      }
      start = avoidBlocks(ceil5(ready), u.duration, blocks); // by hand: keep it, the timeline warns
    }
    const end = start + len(start);
    if (opts.strict && end > frame.end) {
      out.unfit.push({ id: u.id, reason: 'time' });
      continue;
    }
    if (!placed.length) leftAt = start - move - (fromPrev ? buffer : 0);
    placed.push({ id: u.id, start, end, loc: u.loc });
    out.placed.push({ id: u.id, start, end });
    out.travelMin += move;
    out.cost += move + 0.5 * (start - ready) + mealPenalty(u, start);
    cursor = end;
    prevLoc = u.loc;
    fromPrev = true;
  }
  out.prayers = placePrayers(prayers, placed, leftAt, frame.base);
  out.cost += (frame.baseKnown ? travelOr(travel, prevLoc, frame.base) : 0) + 1000 * out.unfit.length;
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

/** Best order + times for one day's stops (nearest neighbour + 2-opt, then meal/prayer/hours-aware tweaks). */
export function planDay(frame: DayFrame, units: Unit[], travel: Travel = estimateTravelMin): { order: Unit[]; timing: DayTiming } {
  return improveOrder(frame, orderByDistance(frame.base, units), travel);
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
export function arrangeTrip(
  frames: DayFrame[],
  units: Unit[],
  opts: { maxStops: number; travel?: Travel; destinations?: Pick<Destination, 'location' | 'timezone' | 'countryCode'>[] },
): Arrangement {
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
  // A day with no hotel prays on the local time where its stops are.
  if (opts.destinations) {
    for (let i = 0; i < usable.length; i++) {
      const us = byDay.get(usable[i].day)!;
      if (us.length) usable[i] = rebaseFrame(usable[i], centroid(us, usable[i].base), opts.destinations);
    }
  }
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

export interface PrayerClash {
  key: PrayerKey;
  start: number;
  end: number;
  /** The stop planned over the prayer time. */
  stopId: string;
}

/**
 * Prayer breaks for a day arranged by hand, at their locked times, for the
 * prayers that fall while the group is out — stops are never moved. Where to
 * pray follows the stop before it (or the long visit it falls in). `clashes`
 * lists stops planned over a prayer time (long visits excepted: you pray there).
 */
export function prayerBreaks(
  prayers: DayPrayers | null,
  stops: GapStop[],
  base?: GeoPoint,
  /** Time spent travelling (airport → landing): prayers then are covered by the journey's own guidance. */
  journeys: Block[] = [],
): { prayers: PrayerSlot[]; clashes: PrayerClash[] } {
  const clashes: PrayerClash[] = [];
  if (!prayers || !stops.length) return { prayers: [], clashes };
  const sorted = [...stops].sort((a, b) => a.start - b.start);
  const first = sorted[0].start;
  const last = Math.max(...sorted.map((s) => s.end));
  const out: PrayerSlot[] = [];
  for (const p of lockedPrayers(prayers)) {
    if (p.end <= first || p.start >= last) continue; // prayed before leaving / after getting back
    if (journeys.some((j) => p.start < j.end && p.end > j.start)) continue; // at the airport / on board
    const isLong = (x: GapStop) => x.end - x.start >= LONG_VISIT_MIN;
    const inside = sorted.find((x) => x.start <= p.start && x.end > p.start && isLong(x));
    for (const x of sorted) {
      if (isLong(x)) continue;
      if (x.start < p.end && Math.max(x.end, x.start + 1) > p.start) clashes.push({ ...p, stopId: x.id });
    }
    const before = [...sorted].reverse().find((x) => x.end <= p.start);
    const near = inside ?? before ?? sorted[0];
    out.push({ key: p.key, start: p.start, end: p.end, afterId: inside || before ? near.id : null, at: near.loc ?? base ?? { lat: 0, lng: 0 } });
  }
  return { prayers: out, clashes };
}

/**
 * When a day's journeys keep you at the airport / station or on board: from
 * getting there before departure until out after arrival. Items are the day's
 * booking moments ('depart' / 'arrive' / 'span'); a departure with no arrival
 * that day runs to midnight, an arrival with no departure from midnight.
 */
export function journeySpans(items: { start: number; end: number; event: string; bookingId: string; flight: boolean }[]): Block[] {
  const out: Block[] = [];
  const pre = (f: boolean) => (f ? 150 : 45);
  const post = (f: boolean) => (f ? 60 : 30);
  for (const it of items) {
    if (it.event === 'span') out.push({ start: it.start - pre(it.flight), end: it.end + post(it.flight) });
    else if (it.event === 'depart') {
      const arr = items.find((x) => x.bookingId === it.bookingId && x.event === 'arrive');
      out.push({ start: it.start - pre(it.flight), end: arr ? arr.end + post(it.flight) : 24 * 60 });
    } else if (it.event === 'arrive' && !items.some((x) => x.bookingId === it.bookingId && x.event === 'depart')) {
      out.push({ start: 0, end: it.end + post(it.flight) });
    }
  }
  return out;
}

/**
 * A day with no hotel or arrival only knows its country: pray on the local
 * time of where the stops actually are (the destination nearest them).
 */
export function rebaseFrame(frame: DayFrame, at: GeoPoint | undefined, destinations: Pick<Destination, 'location' | 'timezone' | 'countryCode'>[]): DayFrame {
  if (frame.baseKnown || !at || !frame.prayers) return frame;
  const dest = nearestDestination(destinations, at);
  return { ...frame, prayers: prayerTimesOn(frame.day, at, dest.timezone, dest.countryCode) };
}

// ─── Days from bookings ─────────────────────────────────────────────────────

type BookingLike = Pick<BookingDraft, 'kind' | 'startLocal' | 'endLocal'> & { from?: { location: GeoPoint }; to: { location: GeoPoint } };

/** The trip destination nearest a point (its timezone is the local time there). */
export function nearestDestination<D extends Pick<Destination, 'location'>>(destinations: D[], at: GeoPoint): D {
  return [...destinations].sort((a, b) => metersBetween(a.location, at) - metersBetween(b.location, at))[0];
}

/** Same-day journeys longer than this change city: the day starts after arriving (or ends before leaving). */
const CITY_CHANGE_M = 30_000;

/**
 * Each day's usable window and base from the bookings:
 * - arrive (flight +60 min, else +30) → the day can't start before that; you start from there
 * - depart (flight −150 min, else −45) → the day must end by then
 * - a same-day journey to another city counts as arriving there (or leaving, if it heads away
 *   from the trip's destinations); a short local one is blocked out
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
  const toTrip = (p: GeoPoint) => metersBetween(nearestDestination(destinations, p).location, p);
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
        const from = b.from?.location ?? b.to.location;
        if (metersBetween(from, b.to.location) < CITY_CHANGE_M) {
          // A local journey: you're around before and after it — just block it out.
          blocks.push({ start: toMin(sTime) - (flight ? 120 : 30), end: toMin(eTime) + (flight ? 45 : 15) });
        } else if (toTrip(b.to.location) <= toTrip(from)) {
          // Arriving in (or moving between) trip cities: plan only after landing.
          start = Math.max(start, toMin(eTime) + (flight ? 60 : 30));
          arrivedAt = b.to.location;
        } else {
          // Leaving the trip: plan only before heading to the airport / station.
          end = Math.min(end, toMin(sTime) - (flight ? 150 : 45));
        }
        continue;
      }
      if (sDay === day) end = Math.min(end, toMin(sTime) - (flight ? 150 : 45));
      if (eDay === day) {
        start = Math.max(start, toMin(eTime) + (flight ? 60 : 30));
        arrivedAt = b.to.location;
      }
    }
    const hotel = hotels.find((h) => h.startLocal.slice(0, 10) <= day && day <= h.endLocal.slice(0, 10));
    const known = hotel?.to.location ?? arrivedAt;
    const base = known ?? destinations[0].location;
    const dest = nearestDestination(destinations, base);
    return {
      day,
      start: ceil5(start),
      end,
      base,
      baseKnown: !!known,
      blocks,
      prayers: opts.praying ? prayerTimesOn(day, base, dest.timezone, dest.countryCode) : null,
    };
  });
}

// ─── 🟡 "Works, but could be better" for a hand-made day ─────────────────────

export interface DaySuggestion {
  kind: 'order' | 'meal';
  text: string;
  /** For 'order': the stop ids in the suggested order (send to reorder). */
  order?: string[];
}

/** Minutes of travel saved before a new order is worth suggesting. */
const ORDER_SAVING_MIN = 15;

/**
 * Better arrangements for a day planned by hand: a visiting order that cuts
 * travel (same stops, nearest-neighbour + 2-opt), and meal spots planned far
 * from lunch / dinner time. `stops` are the movable stops in their current order.
 */
export function daySuggestions(
  frame: Pick<DayFrame, 'base' | 'baseKnown'>,
  stops: (Timed & { loc: GeoPoint; name: string; food?: boolean })[],
  travel: Travel = estimateTravelMin,
): DaySuggestion[] {
  const out: DaySuggestion[] = [];
  const route = (list: { loc: GeoPoint }[]) => {
    const pts = frame.baseKnown ? [frame.base, ...list.map((s) => s.loc), frame.base] : list.map((s) => s.loc);
    return pts.slice(1).reduce((m, p, i) => m + travel(pts[i], p), 0);
  };
  if (stops.length >= 3) {
    const units = stops.map((s) => ({ id: s.id, loc: s.loc, duration: s.end - s.start }));
    const better = orderByDistance(frame.baseKnown ? frame.base : stops[0].loc, units);
    const byId = new Map(stops.map((s) => [s.id, s]));
    const now = route(stops);
    const next = route(better.map((u) => byId.get(u.id)!));
    if (now - next >= ORDER_SAVING_MIN && better.some((u, i) => u.id !== stops[i].id)) {
      out.push({
        kind: 'order',
        text: `Visiting in this order saves ~${Math.round(now - next)} min of travel: ${better.map((u) => byId.get(u.id)!.name).join(' → ')}.`,
        order: better.map((u) => u.id),
      });
    }
  }
  for (const s of stops) {
    if (!s.food) continue;
    const off = Math.min(...MEALS.map(([a, b]) => (s.start < a ? a - s.start : s.start > b ? s.start - b : 0)));
    if (off >= 60) out.push({ kind: 'meal', text: `${s.name} is a meal spot but it's planned at ${fmtHm(s.start)} — lunch (11:30–2 PM) or dinner (6–8:30 PM) suits it better.` });
  }
  return out;
}

const fmtHm = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  return `${h % 12 || 12}:${String(min % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
