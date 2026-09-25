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

/**
 * Re-times a day after the unlocked items were put in a new order: they're
 * packed back to back (plus travel time) from where the day's first unlocked
 * item started, stepping over locked bookings. Durations are kept.
 */
export function reflowDay(
  items: Timed[],
  order: string[],
  gapBefore: (prevId: string, id: string) => number = () => DEFAULT_GAP,
): { id: string; start: string; end: string; orderIndex: number }[] {
  const locked = items.filter((i) => i.locked);
  const free = new Map(items.filter((i) => !i.locked).map((i) => [i.id, i]));
  const ordered = [...order.filter((id) => free.has(id)), ...[...free.keys()].filter((id) => !order.includes(id))];
  if (!ordered.length) return [];

  let cursor = Math.min(...ordered.map((id) => toMin(free.get(id)!.start)));
  let prev: string | null = null;
  return ordered.map((id, orderIndex) => {
    const it = free.get(id)!;
    const duration = Math.max(5, toMin(it.end) - toMin(it.start));
    const gap = prev ? gapBefore(prev, id) : 0;
    const start = fitAround(cursor + gap, duration, locked, DEFAULT_GAP);
    cursor = start + duration;
    prev = id;
    return { id, start: toClock(start), end: toClock(start + duration), orderIndex };
  });
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

export interface DayWarning {
  itemId: string;
  kind: 'overlap' | 'tight' | 'closed' | 'hours' | 'late';
  text: string;
}

/**
 * Problems on one day, in time order. `hours` gives Google's weekday
 * descriptions for an item's place (undefined when unknown).
 */
export function dayWarnings(
  day: string,
  items: (Pick<ScheduleItem, 'id' | 'start' | 'end' | 'orderIndex'> & { transitMin?: number })[],
  hours: (id: string) => string[] | undefined,
): DayWarning[] {
  const out: DayWarning[] = [];
  const sorted = [...items].sort(byTime);
  sorted.forEach((it, i) => {
    const s = toMin(it.start);
    const e = toMin(it.end);
    const prev = sorted[i - 1];
    if (prev && s < toMin(prev.end)) out.push({ itemId: it.id, kind: 'overlap', text: 'Overlaps the previous stop.' });
    else if (prev && it.transitMin && s - toMin(prev.end) < it.transitMin) {
      out.push({ itemId: it.id, kind: 'tight', text: `Only ${s - toMin(prev.end)} min to get here — the trip takes about ${it.transitMin} min.` });
    }
    if (e >= DAY_END) out.push({ itemId: it.id, kind: 'late', text: 'Runs past midnight.' });

    const open = openingRanges(hours(it.id), day);
    if (open?.length === 0) out.push({ itemId: it.id, kind: 'closed', text: 'Closed on this day.' });
    else if (open && !open.some(([o, c]) => s >= o && e <= c)) {
      out.push({ itemId: it.id, kind: 'hours', text: `Outside opening hours (${open.map(([o, c]) => `${toClock(o)}–${toClock(c)}`).join(', ')}).` });
    }
  });
  return out;
}
