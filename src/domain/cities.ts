// Which trip city the group is in on each day. Sources, most reliable first:
//   1. the dates the admin gave each city (arriveDate … leaveDate)
//   2. the planned stays (check-in … check-out)
//   3. hotel bookings
// On a travel day (leave one city, arrive in the next) the group is in both.
// Pure functions shared by stays, transport alerts, AI Arrange and the backlog.
import type { GeoPoint } from './common.js';
import { nearestDestination } from './arrange.js';
import { tripDays } from './timeline.js';
import type { Destination } from './trip.js';

type Dest = Pick<Destination, 'location'> & Partial<Pick<Destination, 'arriveDate' | 'leaveDate'>>;

/** Every city has both dates. */
export const hasCityDates = (destinations: Dest[]) => destinations.length > 0 && destinations.every((d) => d.arriveDate && d.leaveDate);

/**
 * The trip dates shared out over the cities in order (a suggestion for the
 * trip form): the move to the next city happens on the last day of the one
 * before, so each city keeps its nights.
 */
export function splitDates(startDate: string, endDate: string, count: number): { arriveDate: string; leaveDate: string }[] {
  const days = tripDays(startDate, endDate);
  if (!count || !days.length) return [];
  const nights = Math.max(0, days.length - 1);
  const out: { arriveDate: string; leaveDate: string }[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    const share = Math.round(((i + 1) * nights) / count) - Math.round((i * nights) / count);
    const leave = Math.min(days.length - 1, at + Math.max(0, share));
    out.push({ arriveDate: days[at], leaveDate: days[i === count - 1 ? days.length - 1 : leave] });
    at = leave;
  }
  return out;
}

/**
 * The city indices (into `destinations`) the group is in on each trip day.
 * An empty list = unknown (no dates, stay or hotel says so).
 */
export function citiesByDay(input: {
  startDate: string;
  endDate: string;
  destinations: Dest[];
  stays?: { destIdx: number; checkIn: string; checkOut: string }[];
  hotels?: { startLocal: string; endLocal: string; to: { location: GeoPoint } }[];
}): Map<string, number[]> {
  const { destinations: dests } = input;
  const out = new Map<string, number[]>();
  for (const day of tripDays(input.startDate, input.endDate)) {
    const set = new Set<number>();
    dests.forEach((d, i) => {
      if (d.arriveDate && d.leaveDate && d.arriveDate <= day && day <= d.leaveDate) set.add(i);
    });
    if (!set.size) for (const s of input.stays ?? []) if (s.checkIn <= day && day <= s.checkOut && dests[s.destIdx]) set.add(s.destIdx);
    if (!set.size && dests.length) {
      for (const h of input.hotels ?? []) {
        if (h.startLocal.slice(0, 10) <= day && day <= h.endLocal.slice(0, 10)) set.add(dests.indexOf(nearestDestination(dests, h.to.location)));
      }
    }
    // One city only: every day is there.
    if (!set.size && dests.length === 1) set.add(0);
    out.set(day, [...set].sort((a, b) => a - b));
  }
  return out;
}

/** The trip city a place belongs to (the nearest one). */
export const cityOf = (destinations: Pick<Destination, 'location'>[], at: GeoPoint) => destinations.indexOf(nearestDestination(destinations, at));

/** A day's cities as a label: "Tokyo", "Tokyo → Osaka" on a travel day. */
export const cityLabel = (destinations: Pick<Destination, 'name'>[], idx: number[]) => idx.map((i) => destinations[i]?.name).filter(Boolean).join(' → ');

/**
 * The days a city is planned for, as text for its section header
 * ("10–14 Nov"), from its dates or the days mapped to it.
 */
export function cityDatesText(d: Partial<Pick<Destination, 'arriveDate' | 'leaveDate'>>): string | null {
  if (!d.arriveDate || !d.leaveDate) return null;
  const f = (x: string, month: boolean) => new Date(`${x}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', ...(month ? { month: 'short' } : {}), timeZone: 'UTC' });
  const sameMonth = d.arriveDate.slice(0, 7) === d.leaveDate.slice(0, 7);
  return d.arriveDate === d.leaveDate ? f(d.arriveDate, true) : `${f(d.arriveDate, !sameMonth)}–${f(d.leaveDate, true)}`;
}
