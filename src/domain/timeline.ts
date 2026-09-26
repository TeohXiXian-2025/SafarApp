// Manual timeline arranging: time maths, packing a reordered day around the
// locked booking anchors, travel estimates and per-day warnings. Pure
// functions shared by the Timeline page and the schedule API.
import type { GeoPoint } from './common.js';
import type { ScheduleItem } from './plan.js';
import { openingRanges } from './prayer.js';

const DAY_END = 24 * 60 - 1;
/** Where an empty day starts. */
export const DAY_START = 9 * 60;
/** Gap between two items when we don't know the travel time yet. */
export const DEFAULT_GAP = 15;

export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const toClock = (min: number) => {
  const m = Math.max(0, Math.min(DAY_END, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
/** Round up to the next 5 minutes — times people can actually read. */
export const ceil5 = (min: number) => Math.ceil(min / 5) * 5;

/** Schedule doc id for an idea — one timeline slot per idea. */
export const ideaItemId = (ideaId: string) => `idea_${ideaId}`;

/** Every date of the trip, inclusive. */
export function tripDays(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${endDate}T00:00:00Z`);
  for (let t = Date.parse(`${startDate}T00:00:00Z`); t <= end && out.length < 366; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

type Timed = Pick<ScheduleItem, 'id' | 'start' | 'end' | 'orderIndex' | 'locked'>;

export const byTime = <T extends Pick<ScheduleItem, 'start' | 'end' | 'orderIndex'>>(a: T, b: T) =>
  a.start.localeCompare(b.start) || a.orderIndex - b.orderIndex || a.end.localeCompare(b.end);

const overlaps = (s: number, e: number, other: Timed) => s < Math.max(toMin(other.end), toMin(other.start) + 1) && e > toMin(other.start);

/** First start ≥ `from` where `duration` fits without touching a locked item. */
function fitAround(from: number, duration: number, locked: Timed[], gap: number) {
  let start = ceil5(from);
  for (const l of [...locked].sort(byTime)) {
    if (overlaps(start, start + duration, l)) start = ceil5(Math.max(toMin(l.end), toMin(l.start)) + gap);
  }
  return start;
}

/**
 * Where a new item goes when dropped on a day: after the day's last movable
 * stop (or 9:00), never before an arrival that day, stepping over bookings.
 */
export function nextSlot(dayItems: (Timed & Partial<Pick<ScheduleItem, 'ref'>>)[], durationMin: number, gap = DEFAULT_GAP): { start: string; end: string } {
  const arrived = (i: (typeof dayItems)[number]) => i.ref?.kind === 'booking' && i.ref.event === 'arrive';
  const after = Math.max(-1, ...dayItems.filter((i) => !i.locked || arrived(i)).map((i) => toMin(i.end)));
  const start = fitAround(after < 0 ? DAY_START : after + gap, durationMin, dayItems.filter((i) => i.locked), gap);
  return { start: toClock(start), end: toClock(start + durationMin) };
}

// ─── Travel estimates ───────────────────────────────────────────────────────

export function metersBetween(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Beyond this, walking isn't suggested. */
export const WALK_MAX_M = 1500;

/** Rough door-to-door minutes before the real route is known (straight line × detour). */
export function estimateTravelMin(a: GeoPoint, b: GeoPoint): number {
  const m = metersBetween(a, b) * 1.3;
  return m <= WALK_MAX_M ? Math.round(m / 80) : Math.round(10 + m / 333); // walk 4.8 km/h; transit ~20 km/h + waiting
}

// ─── Warnings ───────────────────────────────────────────────────────────────

/** Two timeline moments of the same journey (departs → arrives): no travel between them — you're on it. */
export const sameJourney = (a?: Pick<ScheduleItem, 'ref'>, b?: Pick<ScheduleItem, 'ref'>) =>
  a?.ref.kind === 'booking' && b?.ref.kind === 'booking' && a.ref.bookingId === b.ref.bookingId;

/** Minutes kept free on top of the travel time (finding the entrance, parking, queues). */
export const BUFFER_MIN = 10;
/** Visits at least this long may run through a prayer time — you pray there. */
export const LONG_VISIT_MIN = 150;

export type WarningKind = 'overlap' | 'unreachable' | 'closed' | 'hours' | 'prayer' | 'tight' | 'closing' | 'late' | 'checkin';
/** block = the plan doesn't work as is; risk = it works, but only just. */
export const SEVERITY: Record<WarningKind, 'block' | 'risk'> = {
  overlap: 'block',
  unreachable: 'block',
  closed: 'block',
  hours: 'block',
  prayer: 'block',
  tight: 'risk',
  closing: 'risk',
  late: 'risk',
  checkin: 'risk',
};

/**
 * What wins when things share a time: getting there (flights, trains) first,
 * then prayer, then the hotel check-in / check-out, then everything else.
 */
export function timePriority(it: Pick<ScheduleItem, 'ref'> & { prayer?: unknown }): number {
  if (it.prayer) return 1;
  if (it.ref.kind === 'booking') return it.ref.event === 'checkin' || it.ref.event === 'checkout' ? 2 : 0;
  return 3;
}

/** Time order; at the same minute, by timePriority. */
export const byTimeAndPriority = <T extends Pick<ScheduleItem, 'start' | 'end' | 'orderIndex' | 'ref'> & { prayer?: unknown }>(a: T, b: T) =>
  a.start.localeCompare(b.start) || timePriority(a) - timePriority(b) || a.orderIndex - b.orderIndex || a.end.localeCompare(b.end);

export interface DayWarning {
  itemId: string;
  kind: WarningKind;
  severity: 'block' | 'risk';
  text: string;
}

const warn = (itemId: string, kind: WarningKind, text: string): DayWarning => ({ itemId, kind, severity: SEVERITY[kind], text });

/**
 * Problems on one day, in time order. `hours` gives Google's weekday
 * descriptions for an item's place (undefined when unknown); `transitMin`
 * is the travel time from the previous stop (real Routes time, or an
 * estimate). Prayer breaks and the parallel groups of a split (`side`)
 * aren't part of the chain of stops; time spent praying between two stops
 * counts against the transfer.
 */
export function dayWarnings(
  day: string,
  items: (Pick<ScheduleItem, 'id' | 'start' | 'end' | 'orderIndex'> & { transitMin?: number; kind?: 'prayer' | 'side'; label?: string; locked?: boolean; checkin?: boolean; prayInside?: boolean })[],
  hours: (id: string) => string[] | undefined,
): DayWarning[] {
  const out: DayWarning[] = [];
  const sorted = [...items].sort(byTime);
  const prayers = sorted.filter((i) => i.kind === 'prayer');
  const chain = sorted.filter((i) => !i.kind);
  for (const it of sorted) {
    if (it.kind === 'prayer') continue;
    const s = toMin(it.start);
    const e = toMin(it.end);
    const i = chain.indexOf(it);
    const prev = i > 0 ? chain[i - 1] : undefined;
    if (prev && s < toMin(prev.end)) out.push(warn(it.id, 'overlap', 'Overlaps the stop or booking before it.'));
    else if (prev && it.transitMin) {
      const praying = prayers.filter((p) => toMin(p.start) >= toMin(prev.end) && toMin(p.end) <= s).reduce((m, p) => m + toMin(p.end) - toMin(p.start), 0);
      const free = s - toMin(prev.end) - praying;
      const after = praying ? ' after the prayer break' : '';
      if (free < it.transitMin) out.push(warn(it.id, 'unreachable', `Can't get here in time: the trip takes ~${it.transitMin} min but there's only ${Math.max(0, free)} min${after}.`));
      else if (free < it.transitMin + BUFFER_MIN) out.push(warn(it.id, 'tight', `Only ${free - it.transitMin} min to spare after the ~${it.transitMin} min trip${after}.`));
    }
    if (e >= DAY_END) out.push(warn(it.id, 'late', 'Runs past midnight.'));
    // Prayer comes before the hotel: a check-in during a prayer time waits until after it.
    if (it.checkin) {
      const p = prayers.find((x) => toMin(x.start) <= s && s < toMin(x.end));
      if (p) out.push(warn(it.id, 'checkin', `Check-in falls in ${p.label ?? 'a prayer'} (${toClock(toMin(p.start))}–${toClock(toMin(p.end))}) — pray first, then check in from ${toClock(toMin(p.end))}.`));
    }
    // Prayer times are locked like bookings; long visits pray on the spot, journeys on board.
    if (it.kind !== 'side' && !it.locked && e - s < LONG_VISIT_MIN) {
      // At a stop you can pray at, a prayer time that begins during the visit is prayed there.
      const p = prayers.find((x) => s < toMin(x.end) && Math.max(e, s + 1) > toMin(x.start) && !(it.prayInside && toMin(x.start) >= s && toMin(x.start) < e));
      if (p) out.push(warn(it.id, 'prayer', `Overlaps ${p.label ?? 'a prayer'} (${toClock(toMin(p.start))}–${toClock(toMin(p.end))}) — prayer times are fixed; move this stop or tap Fix this day.`));
    }

    const open = openingRanges(hours(it.id), day);
    if (open?.length === 0) out.push(warn(it.id, 'closed', 'Closed on this day.'));
    else if (open) {
      const range = open.find(([o, c]) => s >= o && e <= c);
      if (!range) out.push(warn(it.id, 'hours', `Outside opening hours (${open.map(([o, c]) => `${toClock(o)}–${toClock(c)}`).join(', ')}).`));
      else if (range[1] < 24 * 60 && range[1] - e < 15) out.push(warn(it.id, 'closing', `Ends ${range[1] - e} min before it closes at ${toClock(range[1])} — last entry is often earlier.`));
    }
  }
  return out;
}

/**
 * The first start (≥ `after`, 5-min steps) where a stop fits: inside its
 * opening hours, not overlapping anything, with travel time + buffer to the
 * stop before and after. null if nothing fits that day.
 */
export function findSlot(opts: {
  day: string;
  /** The day's other stops (not the one being placed; no prayer breaks). */
  items: { start: number; end: number; loc?: GeoPoint }[];
  duration: number;
  hours?: string[];
  loc?: GeoPoint;
  after?: number;
  travel?: (a: GeoPoint, b: GeoPoint) => number;
}): number | null {
  const travel = opts.travel ?? estimateTravelMin;
  const open = openingRanges(opts.hours, opts.day) ?? [[0, DAY_END] as [number, number]];
  if (!open.length) return null;
  const items = [...opts.items].sort((a, b) => a.start - b.start);
  for (let s = ceil5(opts.after ?? 8 * 60); s + opts.duration <= DAY_END; s += 5) {
    const e = s + opts.duration;
    if (!open.some(([o, c]) => s >= o && e <= c)) continue;
    if (items.some((x) => x.start < e && Math.max(x.end, x.start + 1) > s)) continue;
    const prev = [...items].reverse().find((x) => x.end <= s);
    const next = items.find((x) => x.start >= e);
    if (prev?.loc && opts.loc && s - prev.end < travel(prev.loc, opts.loc) + BUFFER_MIN) continue;
    if (next?.loc && opts.loc && next.start - e < travel(opts.loc, next.loc) + BUFFER_MIN) continue;
    return s;
  }
  return null;
}

// ─── The day as one chain: travel between every block ───────────────────────

/** Minutes of walking (there and back) a 30-min prayer block already includes (PRAY_MIN 20 + 10). */
export const PRAYER_WALK_ALLOWANCE = 10;

export interface ChainRow {
  id: string;
  /** Minutes after midnight. */
  start: number;
  end: number;
  loc?: GeoPoint;
  /** Can't move: bookings and prayer times. */
  fixed: boolean;
  /** A prayer time (a stop may run through it — you pray during the visit — but not start inside it). */
  prayer?: boolean;
  /** Shown with its travel, but doesn't pin the group down (hotel check-in / check-out: drop bags any time). */
  soft?: boolean;
  /** A stop you can pray at (prayer room on site / a few minutes' walk): a prayer time during it is prayed there. */
  prayInside?: boolean;
  /** Opening hours that day (minutes); a tight chain never starts a stop before it opens. */
  open?: [number, number][] | null;
  /** Someone set its start by hand: it keeps it (moving only later if it can't be reached). */
  pinned?: boolean;
}

export interface ChainPlan {
  /** New start for each movable row (unchanged ones included). */
  starts: Map<string, number>;
  /** Travel into each row from the block before it (minutes; 0 = same place). */
  legs: Map<string, { fromId: string; minutes: number }>;
}

/**
 * Walks a day's blocks in time order — stops, meals, prayer places, flights,
 * hotel check-in — and counts the travel between every pair of neighbours.
 * A movable stop that can't be reached in time from the block before it
 * (travel + buffer) starts later, just enough. It also moves after a prayer
 * time it would START inside, and after a journey it would overlap; a prayer
 * that falls in the middle of a visit stays there (you step out to pray — the
 * timeline hints it). Stops never move earlier, so gaps people chose stay —
 * except with `tight`: then each stop starts right after the one before
 * (travel + buffer, opening time), unless it's pinned to a time by hand.
 */
export function planChain(rows: ChainRow[], travel: (a: GeoPoint, b: GeoPoint) => number, buffer = BUFFER_MIN, opts: { tight?: boolean } = {}): ChainPlan {
  const starts = new Map<string, number>();
  const legs = new Map<string, { fromId: string; minutes: number }>();
  const sorted = [...rows].sort((a, b) => a.start - b.start || Number(b.fixed) - Number(a.fixed));
  const fixed = sorted.filter((r) => r.fixed && !r.soft);
  const move = (a?: GeoPoint, b?: GeoPoint) => (a && b ? travel(a, b) : 0);
  let cur: { id: string; end: number; loc?: GeoPoint; long: boolean; holds?: boolean; start: number; prayer?: boolean } | null = null;
  // From the prayer place on to the next stop: the whole walk (so the times on screen add up), no buffer.
  const afterPrayer = (leg: number) => leg;
  for (const r of sorted) {
    if (r.soft) {
      if (cur) legs.set(r.id, { fromId: cur.id, minutes: move(cur.loc, r.loc) });
      continue;
    }
    if (r.fixed) {
      // A prayer inside a long visit: prayed there — the visit carries on.
      // So does one at a stop you can pray at (A → pray → back to A).
      if ((cur?.long || (cur?.holds && r.prayer)) && r.start >= cur.start && r.start < cur.end) continue;
      if (cur) legs.set(r.id, { fromId: cur.id, minutes: move(cur.loc, r.loc) });
      // It happens while the stop before is still going on (a check-out moment, a prayer mid-visit, or a
      // stop pushed past it): the group is busy until the later of the two — never earlier.
      if (cur && r.start < cur.end) {
        cur = { ...cur, end: Math.max(cur.end, r.end) };
        continue;
      }
      cur = { id: r.id, start: r.start, end: Math.max(r.end, r.start), loc: r.loc ?? cur?.loc, long: false, prayer: !!r.prayer };
      continue;
    }
    const dur = Math.max(5, r.end - r.start);
    const long = dur >= LONG_VISIT_MIN;
    const holds = long || !!r.prayInside;
    const leg = cur ? move(cur.loc, r.loc) : 0;
    // A prayer block already includes walking to and from the prayer place (PRAYER_WALK_ALLOWANCE).
    const need = cur?.prayer ? afterPrayer(leg) : leg + (leg > 0 ? buffer : 0);
    // Tight: a stop starts when the one before ends + the trip there (+ buffer) — no idle gaps —
    // unless it was pinned to a time by hand, or isn't open yet.
    let start = cur ? (opts.tight && !r.pinned ? ceil5(cur.end + need) : Math.max(r.start, ceil5(cur.end + need))) : r.start;
    if (opts.tight && r.open?.length) {
      const range = r.open.find(([o, c]) => Math.max(start, o) + dur <= c);
      if (range && start < range[0]) start = ceil5(range[0]);
    }
    // Can't start during a prayer time, or overlap a journey (a span with a length): it goes after it.
    for (let guard = 0; guard < 10; guard++) {
      const hit = fixed.find(
        (f) =>
          f.end > f.start &&
          f.start >= (cur?.end ?? 0) - 1 &&
          (f.prayer
            ? (start >= f.start && start < f.end) ||
              // Travel pushed it into a prayer it was clear of where it was put: after the prayer instead.
              (!holds && f.start < start + dur && f.end > start && (opts.tight ? true : start > r.start && !(f.start < r.start + dur && f.end > r.start)))
            : !long && f.start < start + dur && f.end > start),
      );
      if (!hit) break;
      start = ceil5(hit.end + (hit.prayer ? afterPrayer(move(hit.loc, r.loc)) : move(hit.loc, r.loc) + (r.loc && hit.loc ? buffer : 0)));
    }
    starts.set(r.id, start);
    if (cur) legs.set(r.id, { fromId: cur.id, minutes: leg });
    cur = { id: r.id, start, end: start + dur, loc: r.loc ?? cur?.loc, long, holds };
  }
  return { starts, legs };
}
