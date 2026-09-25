// Server side of the timeline: loads what the scheduling engine needs, turns
// ideas into units, keeps each day's prayer breaks and travel legs current,
// and writes split pairs (two parallel stops) as one.
import { FieldValue, type WriteBatch } from 'firebase-admin/firestore';
import {
  Booking,
  byTime,
  dayFrames,
  Idea,
  ideaItemId,
  Member,
  mergePrefs,
  paths,
  PRAYER_LABEL,
  prayersInGaps,
  ScheduleItem,
  Split,
  toClock,
  toMin,
  type DayFrame,
  type GeoPoint,
  type PrayerKey,
  type PrayerPairing,
  type PrayerSlot,
  type Trip,
  type Unit,
} from '../../src/domain/index.js';
import { travelLeg } from './directions.js';
import { adminDb } from './firebaseAdmin.js';
import { searchNearby } from './places.js';
import { loadTrip } from './trip.js';

/** Google allows caching route results for up to 30 days. */
const LEG_TTL = 30 * 86_400_000;
/** Routes API calls per day refresh — a day rarely has more new legs than this. */
const MAX_NEW_LEGS = 12;
/** Mosque lookups per day refresh (most stops already know their nearest prayer space). */
const MAX_MOSQUE_LOOKUPS = 4;

export const itemRef = (tripId: string, id: string) => adminDb().doc(`${paths.schedule(tripId)}/${id}`);
export const ideaDocRef = (tripId: string, id: string) => adminDb().doc(paths.idea(tripId, id));
export const splitRef = (tripId: string, id: string) => adminDb().doc(`${paths.splits(tripId)}/${id}`);

export const isPrayerItem = (it: Pick<ScheduleItem, 'prayer'>) => !!it.prayer;
export const isTrackB = (it: Pick<ScheduleItem, 'track'>) => it.track.endsWith(':B');
export const prayerItemId = (day: string, key: PrayerKey) => `pr_${day}_${key}`;

const parseAll = <T>(docs: FirebaseFirestore.QueryDocumentSnapshot[], schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }) =>
  docs.flatMap((d) => {
    const r = schema.safeParse(d.data());
    return r.success ? [r.data as T] : [];
  });

export interface TripData {
  trip: Trip;
  members: Member[];
  bookings: Map<string, Booking>;
  ideas: Map<string, Idea>;
  /** Approved and proposed splits by id. */
  splits: Map<string, Split>;
}

export async function loadTripData(tripId: string): Promise<TripData> {
  const db = adminDb();
  const [trip, members, bookings, ideas, splits] = await Promise.all([
    loadTrip(tripId),
    db.collection(paths.members(tripId)).get(),
    db.collection(paths.bookings(tripId)).get(),
    db.collection(paths.ideas(tripId)).get(),
    db.collection(paths.splits(tripId)).where('status', 'in', ['proposed', 'approved']).get(),
  ]);
  return {
    trip,
    members: parseAll<Member>(members.docs, Member),
    bookings: new Map(parseAll<Booking>(bookings.docs, Booking).map((b) => [b.id, b])),
    ideas: new Map(parseAll<Idea>(ideas.docs, Idea).map((i) => [i.id, i])),
    splits: new Map(parseAll<Split>(splits.docs, Split).map((s) => [s.id, s])),
  };
}

export const prayingUids = (members: Member[]) => members.filter((m) => m.prefs?.prayerReminders).map((m) => m.uid);

export function framesFor(data: TripData, days: string[]): DayFrame[] {
  return dayFrames(days, [...data.bookings.values()], data.trip.destinations, {
    pace: mergePrefs(data.members).pace ?? 'moderate',
    praying: prayingUids(data.members).length > 0,
  });
}

/** An approved split this idea belongs to, if any. */
export function approvedSplit(data: TripData, idea: Idea): Split | undefined {
  const s = idea.splitId ? data.splits.get(idea.splitId) : undefined;
  return s?.status === 'approved' ? s : undefined;
}

export function prayerWalk(idea: Idea): number | undefined {
  const p = idea.halal?.prayer;
  if (!p) return undefined;
  return p.access === 'onsite' ? 0 : p.places[0]?.walkMin;
}

/** One stop for the engine; a split pair is one unit (the original place, until everyone meets again). */
export function unitFor(idea: Idea, split?: Split): Unit {
  return {
    id: idea.id,
    loc: idea.place.location,
    duration: split ? split.reunion.afterMinutes : idea.estDurationMin,
    food: idea.place.category === 'food',
    ...(idea.place.openingHours ? { hours: idea.place.openingHours } : {}),
    ...(prayerWalk(idea) !== undefined ? { prayerWalkMin: prayerWalk(idea) } : {}),
  };
}

export async function dayItems(tripId: string, day: string): Promise<ScheduleItem[]> {
  const snap = await adminDb().collection(paths.schedule(tripId)).where('day', '==', day).get();
  return parseAll<ScheduleItem>(snap.docs, ScheduleItem);
}

// ─── Split pairs ────────────────────────────────────────────────────────────

/**
 * Writes an idea's timeline stop — or, for a split pair, both stops: track A
 * at the original place until everyone meets again, track B from arriving at
 * the alternative until leaving it.
 */
export function writeStops(
  batch: WriteBatch,
  tripId: string,
  opts: { data: TripData; idea: Idea; day: string; start: number; durationMin?: number; orderIndex: number; actor: string },
): string[] {
  const { data, idea, day, start } = opts;
  const split = approvedSplit(data, idea);
  const base = { day, locked: false, orderIndex: opts.orderIndex, updatedBy: opts.actor, updatedAt: Date.now() };
  if (!split) {
    const id = ideaItemId(idea.id);
    batch.set(
      itemRef(tripId, id),
      ScheduleItem.parse({ ...base, id, start: toClock(start), end: toClock(start + (opts.durationMin ?? idea.estDurationMin)), ref: { kind: 'idea', ideaId: idea.id }, track: 'all', memberUids: data.trip.memberIds }),
    );
    return [idea.id];
  }
  const a = data.ideas.get(split.trackA.ideaId);
  const b = data.ideas.get(split.trackB.ideaId);
  if (!a || !b) return [];
  const bStart = start + split.walkMin;
  batch.set(
    itemRef(tripId, ideaItemId(a.id)),
    ScheduleItem.parse({ ...base, id: ideaItemId(a.id), start: toClock(start), end: toClock(start + split.reunion.afterMinutes), ref: { kind: 'idea', ideaId: a.id }, track: `${split.id}:A`, memberUids: split.trackA.memberUids }),
  );
  batch.set(
    itemRef(tripId, ideaItemId(b.id)),
    ScheduleItem.parse({ ...base, id: ideaItemId(b.id), start: toClock(bStart), end: toClock(bStart + b.estDurationMin), ref: { kind: 'idea', ideaId: b.id }, track: `${split.id}:B`, memberUids: split.trackB.memberUids }),
  );
  return [a.id, b.id];
}

/** The stop ids an edit touches: both halves of a split pair. */
export function pairIds(item: ScheduleItem, dayList: ScheduleItem[]): ScheduleItem[] {
  if (item.track === 'all') return [item];
  const splitId = item.track.split(':')[0];
  return dayList.filter((i) => i.track.startsWith(`${splitId}:`));
}

// ─── Locations ──────────────────────────────────────────────────────────────

interface Ends {
  in: GeoPoint;
  out: GeoPoint;
}

/** Where you arrive at each stop and where you leave it from. */
export function itemEnds(data: TripData, items: ScheduleItem[]): Map<string, Ends> {
  const out = new Map<string, Ends>();
  for (const it of items) {
    const r = it.ref;
    if (r.kind === 'idea') {
      const at = data.ideas.get(r.ideaId)?.place.location;
      if (at) out.set(it.id, { in: at, out: at });
    } else if (r.kind === 'booking') {
      const b = data.bookings.get(r.bookingId);
      if (!b) continue;
      const from = b.from?.location ?? b.to.location;
      const ends: Record<typeof r.event, Ends> = {
        span: { in: from, out: b.to.location },
        depart: { in: from, out: from },
        arrive: { in: b.to.location, out: b.to.location },
        checkin: { in: b.to.location, out: b.to.location },
        checkout: { in: b.to.location, out: b.to.location },
      };
      out.set(it.id, ends[r.event]);
    } else if (r.place) {
      out.set(it.id, { in: r.place.location, out: r.place.location });
    }
  }
  return out;
}

// ─── Prayer breaks ──────────────────────────────────────────────────────────

const facilityType = (name: string): NonNullable<PrayerPairing['facility']>['type'] =>
  /musall?a|surau/i.test(name) ? 'musalla' : /prayer room|prayer space/i.test(name) ? 'prayer_room' : 'mosque';

/** Where to pray for one break: the anchor stop's known nearest prayer space, else a quick lookup. */
async function facilityFor(data: TripData, slot: PrayerSlot, items: ScheduleItem[], previous: ScheduleItem[], lookups: { n: number }) {
  const anchor = items.find((i) => i.id === slot.afterId);
  const idea = anchor?.ref.kind === 'idea' ? data.ideas.get(anchor.ref.ideaId) : undefined;
  if (idea?.halal?.prayer) {
    if (idea.halal.prayer.access === 'onsite') return { name: `${idea.place.name} (prayer space on site)`, location: idea.place.location, ...(idea.place.placeId ? { placeId: idea.place.placeId } : {}), type: 'prayer_room' as const, walkMin: 0 };
    const p = idea.halal.prayer.places[0];
    if (p) return { name: p.name, location: p.location, ...(p.placeId ? { placeId: p.placeId } : {}), type: facilityType(p.name), walkMin: p.walkMin };
  }
  // Reuse what an earlier break near the same spot found.
  const near = previous.find((i) => i.prayer?.facility && Math.abs(i.prayer.facility.location.lat - slot.at.lat) + Math.abs(i.prayer.facility.location.lng - slot.at.lng) < 0.01);
  if (near?.prayer?.facility) return near.prayer.facility;
  if (lookups.n++ >= MAX_MOSQUE_LOOKUPS) return undefined;
  const found = (await searchNearby(slot.at, ['mosque'], 2000, 1).catch(() => null))?.[0];
  if (!found) return undefined;
  const meters = Math.hypot((found.location.lat - slot.at.lat) * 111_000, (found.location.lng - slot.at.lng) * 111_000 * Math.cos((slot.at.lat * Math.PI) / 180));
  return { name: found.name, location: found.location, placeId: found.placeId, type: facilityType(found.name), walkMin: Math.round((meters * 1.3) / 80) };
}

/**
 * Re-places a day's prayer breaks in the free gaps (stops are never moved)
 * and removes breaks that no longer apply. Only when someone asked for them.
 */
export async function refreshPrayers(tripId: string, day: string, data: TripData) {
  const all = await dayItems(tripId, day);
  const previous = all.filter(isPrayerItem);
  const stops = all.filter((i) => !isPrayerItem(i) && !isTrackB(i));
  const frame = framesFor(data, [day])[0];
  const ends = itemEnds(data, stops);
  const walkOf = (i: ScheduleItem) => {
    const idea = i.ref.kind === 'idea' ? data.ideas.get(i.ref.ideaId) : undefined;
    return idea ? prayerWalk(idea) : undefined;
  };
  const { prayers } = prayersInGaps(
    frame.prayers,
    stops.map((i) => ({ id: i.id, start: toMin(i.start), end: Math.max(toMin(i.end), toMin(i.start)), loc: ends.get(i.id)?.out, prayerWalkMin: walkOf(i) })),
    frame.base,
  );
  const batch = adminDb().batch();
  const keep = new Set(prayers.map((p) => prayerItemId(day, p.key)));
  previous.filter((p) => !keep.has(p.id)).forEach((p) => batch.delete(itemRef(tripId, p.id)));
  const lookups = { n: 0 };
  const praying = prayingUids(data.members);
  for (const slot of prayers) {
    const facility = await facilityFor(data, slot, stops, previous, lookups);
    const id = prayerItemId(day, slot.key);
    batch.set(
      itemRef(tripId, id),
      ScheduleItem.parse({
        id,
        day,
        start: toClock(slot.start),
        end: toClock(slot.end),
        ref: { kind: 'custom', title: `${PRAYER_LABEL[slot.key]} prayer`, ...(facility ? { place: { name: facility.name, location: facility.location, ...(facility.placeId ? { placeId: facility.placeId } : {}) } } : {}) },
        track: 'all',
        memberUids: praying,
        prayer: { prayer: PRAYER_LABEL[slot.key], at: toClock(slot.start), ...(facility ? { facility } : {}) },
        locked: false,
        orderIndex: 0,
        updatedBy: 'system',
        updatedAt: Date.now(),
      }),
    );
  }
  await batch.commit();
}

// ─── Travel legs ────────────────────────────────────────────────────────────

/**
 * The travel leg into each stop of a day, from the stop before it. Prayer
 * breaks and track-B stops are skipped (the group continues from where it
 * meets again). A leg is reused while it starts from the same stop and is
 * under 30 days old.
 */
export async function refreshLegs(tripId: string, day: string, data: TripData) {
  const all = (await dayItems(tripId, day)).sort(byTime);
  const chain = all.filter((i) => !isPrayerItem(i) && !isTrackB(i));
  const ends = itemEnds(data, chain);
  const batch = adminDb().batch();
  let writes = 0;
  let calls = 0;
  for (const it of all.filter((i) => (isPrayerItem(i) || isTrackB(i)) && i.transitFromPrev)) {
    batch.update(itemRef(tripId, it.id), { transitFromPrev: FieldValue.delete() });
    writes++;
  }
  for (let i = 0; i < chain.length; i++) {
    const it = chain[i];
    const prev = chain[i - 1];
    const a = prev && ends.get(prev.id)?.out;
    const b = ends.get(it.id)?.in;
    const leg = it.transitFromPrev;
    if (!a || !b) {
      if (leg) {
        batch.update(itemRef(tripId, it.id), { transitFromPrev: FieldValue.delete() });
        writes++;
      }
      continue;
    }
    if (leg && leg.fromId === prev.id && leg.at && Date.now() - leg.at < LEG_TTL) continue;
    if (calls++ >= MAX_NEW_LEGS) break;
    const fresh = await travelLeg(a, b);
    batch.update(itemRef(tripId, it.id), { transitFromPrev: fresh ? { ...fresh, fromId: prev.id, at: Date.now() } : FieldValue.delete() });
    writes++;
  }
  if (writes) await batch.commit();
}

/** After any change to a day: prayer breaks first (they don't move stops), then travel legs. */
export async function refreshDay(tripId: string, day: string, data?: TripData) {
  const d = data ?? (await loadTripData(tripId));
  await refreshPrayers(tripId, day, d);
  await refreshLegs(tripId, day, d);
}
