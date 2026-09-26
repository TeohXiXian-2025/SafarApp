// Where a stop goes on a day — one engine for every way of placing it: the
// "Add" sheet's default time, tap-to-move / drag previews (one option per gap
// between blocks) and the schedule API. It runs the same chain re-timing the
// server does after every change (planChain), so the time you see before
// dropping is the time that gets saved. Pure functions.
import type { GeoPoint } from './common.js';
import { leaveBeforeMin, type BookingKind } from './plan.js';
import { openingRanges } from './prayer.js';
import { BUFFER_MIN, ceil5, LONG_VISIT_MIN, planChain, PRAYER_WALK_ALLOWANCE, type ChainRow } from './timeline.js';

const DAY_END = 24 * 60 - 1;
/** The timeline chains stops tightly (start = end of the one before + travel + buffer). */
const TIGHT = { tight: true } as const;
/** Nothing is suggested before this (a stop can still be put earlier by hand). */
export const EARLIEST_STOP = 8 * 60;

/**
 * A prayer time falling during a visit is prayed there (A → pray → back to A)
 * — no clash, the others simply stay at A — when the place has a prayer room
 * on site, a prayer place at most this many minutes' walk away, or nothing
 * known yet (then: ask staff / any clean, quiet spot there; the prayer card
 * looks for a room nearby). Only a place whose nearest known prayer place is
 * further keeps prayer times as walls around the visit.
 */
export const PRAY_INSIDE_WALK_MIN = 5;
export const praysInside = (walkMin?: number) => walkMin === undefined || walkMin <= PRAY_INSIDE_WALK_MIN;

/** Minutes after arriving before you're out of the airport / station. */
const OUT_AFTER_MIN: Record<BookingKind, number> = { flight: 45, train: 15, bus: 15, ferry: 20, hotel: 0 };

/** A time nothing can be put in: at the airport / station, on board, getting out at the other end. */
export interface Zone {
  start: number;
  end: number;
  label: string;
}

/**
 * The day's journeys as zones: from when to be at the airport / station
 * until you're out at the other end (a departure with no arrival that day
 * runs to midnight; an arrival with no departure starts at midnight).
 */
export function journeyZones(items: { start: number; end: number; event: string; bookingId: string; kind: BookingKind; label?: string }[]): Zone[] {
  const out: Zone[] = [];
  for (const it of items) {
    if (it.kind === 'hotel') continue;
    const label = it.label ?? 'your journey';
    const before = leaveBeforeMin(it.kind);
    const after = OUT_AFTER_MIN[it.kind];
    if (it.event === 'span') out.push({ start: it.start - before, end: it.end + after, label });
    else if (it.event === 'depart') {
      const arr = items.find((x) => x.bookingId === it.bookingId && x.event === 'arrive');
      out.push({ start: it.start - before, end: arr ? arr.end + after : DAY_END, label });
    } else if (it.event === 'arrive' && !items.some((x) => x.bookingId === it.bookingId && x.event === 'depart')) {
      out.push({ start: 0, end: it.end + after, label });
    }
  }
  return out;
}

export interface Candidate {
  id: string;
  /** Its own length, without any prayer inside it. */
  duration: number;
  loc?: GeoPoint;
  hours?: string[];
  /** Can pray during the visit (see praysInside). */
  prayInside?: boolean;
  /** Keep this exact start (a time picked by hand, a meal time) instead of following the stop before. */
  pinned?: boolean;
}

export type PlaceProblem = 'closed' | 'hours' | 'midnight' | 'journey' | 'full' | 'prayer';

export interface Placement {
  start: number;
  end: number;
  ok: boolean;
  problem?: PlaceProblem;
  /** Human text for the problem. */
  why?: string;
  /** Travel into it (from the block before) and out of it (to the block after); minutes. */
  legIn?: { fromId: string; minutes: number };
  legOut?: { toId: string; minutes: number };
  /** Minutes of a prayer time it holds (A → pray → back to A), included in `end`. */
  prayerInside: number;
  /** Other stops that start later because of it. */
  pushed: { id: string; by: number }[];
  /** New start for every movable block of the day (live re-timing while choosing). */
  starts: Map<string, number>;
  legs: Map<string, { fromId: string; minutes: number }>;
}

type Travel = (a: GeoPoint, b: GeoPoint) => number;

const fmt = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** The prayer time (a fixed prayer row) that begins inside [start, end). */
const prayerStarting = (rows: ChainRow[], start: number, end: number) => rows.find((r) => r.prayer && r.start >= start && r.start < end);

/**
 * Put `cand` on the day wanting to start at `want`, the rest of the day re-timed
 * around it exactly as the server will (travel + buffer, prayer times and
 * bookings fixed). `after` = the block it goes right after (keeps it in that
 * gap even when travel pushes it past a stop that followed).
 */
export function placeAt(day: string, rows: ChainRow[], cand: Candidate, want: number, travel: Travel, zones: Zone[] = [], after?: string | null): Placement {
  const others = rows.filter((r) => r.id !== cand.id);
  const sorted = [...others].sort((a, b) => a.start - b.start || Number(b.fixed) - Number(a.fixed));
  // In a chosen gap, the movable stops after it keep coming after the new one.
  const cut = after === undefined ? -1 : after === null ? 0 : sorted.findIndex((r) => r.id === after) + 1;
  const run = (dur: number) => {
    const moved = sorted.map((r, i) => (cut >= 0 && i >= cut && !r.fixed && r.start < want ? { ...r, start: want, end: want + (r.end - r.start) } : r));
    const me: ChainRow = {
      id: cand.id,
      start: want,
      end: want + dur,
      fixed: false,
      open: openingRanges(cand.hours, day),
      ...(cand.loc ? { loc: cand.loc } : {}),
      ...(cand.prayInside ? { prayInside: true } : {}),
      ...(cand.pinned ? { pinned: true } : {}),
    };
    // Stable sort: the new stop sits in front of the stops it was put before.
    const list = cut >= 0 ? [...moved.slice(0, cut), me, ...moved.slice(cut)] : [...moved, me];
    return { plan: planChain(list, travel, undefined, TIGHT), list };
  };
  let dur = cand.duration;
  let { plan, list } = run(dur);
  let start = plan.starts.get(cand.id) ?? want;
  let prayerInside = 0;
  if (cand.prayInside) {
    const p = prayerStarting(others, start, start + dur);
    if (p) {
      prayerInside = p.end - p.start;
      dur += prayerInside;
      ({ plan, list } = run(dur));
      start = plan.starts.get(cand.id) ?? want;
    }
  }
  const end = start + dur;
  // Compared with the day re-timed without it (a day that's already off doesn't count against it).
  const base = planChain(others, travel, undefined, TIGHT).starts;
  const pushed = list.flatMap((r) => {
    const s = plan.starts.get(r.id);
    const orig = base.get(r.id) ?? r.start;
    return r.id !== cand.id && !r.fixed && s !== undefined && s > orig ? [{ id: r.id, by: s - orig }] : [];
  });
  const legIn = plan.legs.get(cand.id);
  const outEntry = [...plan.legs].find(([, l]) => l.fromId === cand.id);
  const res: Placement = {
    start,
    end,
    ok: true,
    prayerInside,
    pushed,
    starts: plan.starts,
    legs: plan.legs,
    ...(legIn ? { legIn } : {}),
    ...(outEntry ? { legOut: { toId: outEntry[0], minutes: outEntry[1].minutes } } : {}),
  };
  const bad = (problem: PlaceProblem, why: string): Placement => ({ ...res, ok: false, problem, why });

  const open = openingRanges(cand.hours, day);
  if (open?.length === 0) return bad('closed', 'Closed on this day');
  if (end > DAY_END) return bad('midnight', 'Would run past midnight');
  const zone = zones.find((z) => start < z.end && end > z.start);
  if (zone) return bad('journey', `Clashes with ${zone.label} (${fmt(Math.max(0, zone.start))}–${fmt(Math.min(DAY_END, zone.end))})`);
  // Prayer times are locked: a short stop can't run through one (unless you can pray at it; long visits pray there).
  const clash = !cand.prayInside && dur < LONG_VISIT_MIN ? others.find((r) => r.prayer && r.start < end && r.end > start) : undefined;
  if (clash) return bad('prayer', `Runs into the prayer time at ${fmt(clash.start)}`);
  if (open && !open.some(([o, c]) => start >= o && end <= c)) return bad('hours', `Outside opening hours (${open.map(([o, c]) => `${fmt(o)}–${fmt(c % (24 * 60))}`).join(', ')})`);
  const late = pushed.find((p) => {
    const r = others.find((o) => o.id === p.id)!;
    return (base.get(r.id) ?? r.start) + (r.end - r.start) + p.by > DAY_END;
  });
  if (late) return bad('midnight', 'Pushes a later stop past midnight');
  return res;
}

/** How long it takes to get from one block to the next (prayer blocks already include a short walk). */
function need(prev: ChainRow, loc: GeoPoint | undefined, travel: Travel) {
  const leg = prev.loc && loc ? travel(prev.loc, loc) : 0;
  return prev.prayer ? leg : leg + (leg > 0 ? BUFFER_MIN : 0);
}

/** A prayer time inside a visit that holds it (a long visit, or one you can pray at) — not a gap of its own. */
function heldPrayers(rows: ChainRow[]): Set<string> {
  const held = new Set<string>();
  for (const p of rows.filter((r) => r.prayer)) {
    if (rows.some((v) => !v.fixed && (v.end - v.start >= LONG_VISIT_MIN || v.prayInside) && v.start <= p.start && v.end > p.start)) held.add(p.id);
  }
  return held;
}

export interface GapOption {
  /** Stable key: "{afterId}|{beforeId}" (^ = start of day, $ = end of day). */
  key: string;
  afterId: string | null;
  beforeId: string | null;
  placement: Placement;
}

/**
 * One option per gap between the day's blocks (a stop holding a prayer is one
 * block with it): where the stop would start if put there, the travel in and
 * out, what it pushes later, or why it doesn't fit.
 */
export function gapOptions(day: string, rows: ChainRow[], cand: Candidate, travel: Travel, zones: Zone[] = []): GapOption[] {
  const others = rows.filter((r) => r.id !== cand.id && !r.soft);
  const held = heldPrayers(others);
  const blocks = others.filter((r) => !held.has(r.id)).sort((a, b) => a.start - b.start || Number(b.fixed) - Number(a.fixed));
  const out: GapOption[] = [];
  for (let i = 0; i <= blocks.length; i++) {
    const prev = blocks[i - 1];
    const next = blocks[i];
    let want: number;
    if (prev) want = ceil5(Math.max(prev.end, prev.start) + need(prev, cand.loc, travel));
    else if (next) {
      const back = next.loc && cand.loc ? travel(cand.loc, next.loc) + BUFFER_MIN : 0;
      want = Math.max(EARLIEST_STOP, Math.floor((next.start - back - cand.duration) / 5) * 5);
    } else want = 9 * 60;
    // Only the gaps between blocks; the new stop fits in its own opening hours if it can.
    const open = openingRanges(cand.hours, day);
    if (open?.length) {
      const range = open.find(([, c]) => c - cand.duration >= want);
      if (range && want < range[0]) want = ceil5(range[0]);
    }
    let placement = placeAt(day, rows, cand, want, travel, zones, prev?.id ?? null);
    // Not enough room before a fixed block (prayer time, booking) — it would land after it.
    // …or it only fits by jumping past it (then it isn't in this gap at all).
    const jumped = !!next?.fixed && placement.start >= Math.max(next.end, next.start + 1);
    if (next?.fixed && (placement.ok || placement.problem === 'prayer') && (jumped || (!(next.prayer && cand.prayInside) && placement.end > next.start))) {
      placement = { ...placement, ok: false, problem: 'full', why: `Not enough time before ${next.prayer ? 'the prayer time' : 'the booking'} at ${fmt(next.start)}` };
    }
    out.push({ key: `${prev?.id ?? '^'}|${next?.id ?? '$'}`, afterId: prev?.id ?? null, beforeId: next?.id ?? null, placement });
  }
  return out;
}

/**
 * The first time on the day (from `after`, 5-minute steps) where the stop fits
 * without moving anything else: open, reachable, not in a journey, before midnight.
 */
export function firstFit(day: string, rows: ChainRow[], cand: Candidate, travel: Travel, zones: Zone[] = [], after = EARLIEST_STOP, until = DAY_END): Placement | null {
  for (let s = ceil5(after); s + cand.duration <= Math.min(until, DAY_END); s += 5) {
    const p = placeAt(day, rows, { ...cand, pinned: true }, s, travel, zones);
    if (p.ok && p.start === s && !p.pushed.length) return p;
  }
  return null;
}
