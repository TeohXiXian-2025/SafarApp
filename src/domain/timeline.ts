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

export type WarningKind = 'overlap' | 'unreachable' | 'closed' | 'hours' | 'prayer' | 'tight' | 'closing' | 'late';
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
};

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
  items: (Pick<ScheduleItem, 'id' | 'start' | 'end' | 'orderIndex'> & { transitMin?: number; kind?: 'prayer' | 'side'; label?: string; locked?: boolean })[],
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
    // Prayer times are locked like bookings; long visits pray on the spot, journeys on board.
    if (it.kind !== 'side' && !it.locked && e - s < LONG_VISIT_MIN) {
      const p = prayers.find((x) => s < toMin(x.end) && Math.max(e, s + 1) > toMin(x.start));
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
