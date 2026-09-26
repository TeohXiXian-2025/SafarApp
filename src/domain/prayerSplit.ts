// While some of the group pray, the others do something of their own — and
// everyone meets again. Where: at the prayer place when the other activity is
// a short walk from it; at the next stop when that's nearer; otherwise
// halfway between. Pure functions.
import type { GeoPoint } from './common.js';
import { estimateTravelMin, metersBetween } from './timeline.js';

/** Within ~10 minutes' walk the others simply come back to the prayer place. */
export const MEET_WALK_M = 800;
/** The least time worth spending at an activity during a prayer break. */
export const MIN_STAY_MIN = 15;

export interface MeetPoint {
  kind: 'prayer' | 'next' | 'middle';
  /** "" for a middle point with no name yet (the server names it from a station / landmark nearby). */
  name: string;
  location: GeoPoint;
  /** Minutes after midnight. */
  at: number;
}

const midpoint = (a: GeoPoint, b: GeoPoint): GeoPoint => ({ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 });

/**
 * Where the group that didn't pray meets the others again, and when:
 * near → the prayer place when the prayer ends; the next stop is nearer →
 * there, when it starts; else a point halfway (both walk towards it).
 */
export function meetPoint(o: { pick: GeoPoint; prayer: { name: string; location: GeoPoint }; prayerEnd: number; next?: { name: string; location: GeoPoint; start: number } }): MeetPoint {
  const toPrayer = metersBetween(o.pick, o.prayer.location);
  if (toPrayer <= MEET_WALK_M) return { kind: 'prayer', name: o.prayer.name, location: o.prayer.location, at: o.prayerEnd };
  if (o.next && metersBetween(o.pick, o.next.location) < toPrayer) return { kind: 'next', name: o.next.name, location: o.next.location, at: o.next.start };
  const mid = midpoint(o.pick, o.prayer.location);
  return { kind: 'middle', name: '', location: mid, at: Math.ceil((o.prayerEnd + estimateTravelMin(o.prayer.location, mid)) / 5) * 5 };
}

/**
 * Whether an activity fits a prayer break: walk there from the prayer place,
 * at least MIN_STAY_MIN there, then on to where everyone meets — before they meet.
 */
export function fitsPrayerBreak(o: { pick: GeoPoint; prayer: { name: string; location: GeoPoint }; start: number; end: number; next?: { name: string; location: GeoPoint; start: number } }): { fits: boolean; stayMin: number; meet: MeetPoint } {
  const meet = meetPoint({ pick: o.pick, prayer: o.prayer, prayerEnd: o.end, next: o.next });
  const stayMin = meet.at - o.start - estimateTravelMin(o.prayer.location, o.pick) - estimateTravelMin(o.pick, meet.location);
  return { fits: stayMin >= MIN_STAY_MIN, stayMin, meet };
}
