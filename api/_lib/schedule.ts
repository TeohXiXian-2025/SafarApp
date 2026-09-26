// Server side of the timeline: loads what the scheduling engine needs, turns
// ideas into units, keeps each day's prayer breaks and travel legs current,
// and writes split pairs (two parallel stops) as one.
import { FieldValue, type WriteBatch } from 'firebase-admin/firestore';
import {
  Booking,
  byTime,
  byTimeAndPriority,
  MEAL_WINDOW,
  citiesByDay,
  cityOf,
  Stay,
  withCityBase,
  dayFrames,
  dayWarnings,
  estimateTravelMin,
  Idea,
  metersBetween,
  sameJourney,
  ideaItemId,
  Member,
  mergePrefs,
  paths,
  PRAYER_LABEL,
  planDay,
  journeySpans,
  goodForWhilePraying,
  openingRanges,
  prayerPlaceOnRoute,
  PRAYER_REACH_M,
  prays,
  prayerBreaks,
  rebaseFrame,
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
const MAX_MOSQUE_LOOKUPS = 6;
/** Beyond this (straight line, ~30 min on foot) a prayer place isn't worth suggesting for a break. */
const MAX_PRAYER_WALK_M = 2200;

export const itemRef = (tripId: string, id: string) => adminDb().doc(`${paths.schedule(tripId)}/${id}`);
export const ideaDocRef = (tripId: string, id: string) => adminDb().doc(paths.idea(tripId, id));
export const splitRef = (tripId: string, id: string) => adminDb().doc(`${paths.splits(tripId)}/${id}`);

export const isPrayerItem = (it: Pick<ScheduleItem, 'prayer'>) => !!it.prayer;
/** A split group other than the main one (B, C or free time) — runs alongside track A. */
export const isTrackB = (it: Pick<ScheduleItem, 'track'>) => it.track !== 'all' && !it.track.endsWith(':A');
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
  stays: Stay[];
}

export async function loadTripData(tripId: string): Promise<TripData> {
  const db = adminDb();
  const [trip, members, bookings, ideas, splits, stays] = await Promise.all([
    loadTrip(tripId),
    db.collection(paths.members(tripId)).get(),
    db.collection(paths.bookings(tripId)).get(),
    db.collection(paths.ideas(tripId)).get(),
    db.collection(paths.splits(tripId)).where('status', 'in', ['proposed', 'approved']).get(),
    db.collection(paths.stays(tripId)).get(),
  ]);
  return {
    trip,
    members: parseAll<Member>(members.docs, Member),
    bookings: new Map(parseAll<Booking>(bookings.docs, Booking).map((b) => [b.id, b])),
    ideas: new Map(parseAll<Idea>(ideas.docs, Idea).map((i) => [i.id, i])),
    splits: new Map(parseAll<Split>(splits.docs, Split).map((s) => [s.id, s])),
    stays: parseAll<Stay>(stays.docs, Stay),
  };
}

/** Which trip cities the group is in each day (city dates → stays → hotel bookings). */
export function dayCitiesOf(data: TripData): Map<string, number[]> {
  return citiesByDay({
    startDate: data.trip.startDate,
    endDate: data.trip.endDate,
    destinations: data.trip.destinations,
    stays: data.stays,
    hotels: [...data.bookings.values()].filter((b) => b.kind === 'hotel'),
  });
}

export const prayingUids = (members: Member[]) => members.filter(prays).map((m) => m.uid);

export function framesFor(data: TripData, days: string[]): DayFrame[] {
  const frames = dayFrames(days, [...data.bookings.values()], data.trip.destinations, {
    pace: mergePrefs(data.members).pace ?? 'moderate',
    praying: prayingUids(data.members).length > 0,
  });
  // A day with no hotel or arrival starts from its own city, not the first destination.
  return withCityBase(frames, dayCitiesOf(data), data.trip.destinations);
}

/** One day's frame; a day with no hotel prays on the local time where its stops are. */
export function frameAt(data: TripData, day: string, near?: GeoPoint): DayFrame {
  return rebaseFrame(framesFor(data, [day])[0], near, data.trip.destinations);
}

/** An approved split this idea belongs to, if any. */
export function approvedSplit(data: TripData, idea: Idea): Split | undefined {
  const s = idea.splitId ? data.splits.get(idea.splitId) : undefined;
  return s?.status === 'approved' ? s : undefined;
}

/** The main (track A) idea of an idea's split, or the idea itself. */
export function leadIdea(data: TripData, idea: Idea): Idea {
  const s = approvedSplit(data, idea);
  const a = s?.tracks.find((t) => t.key === 'A')?.ideaId;
  return (a && data.ideas.get(a)) || idea;
}

/** An alternative half of an approved split (planned together with its main idea). */
export const isAltOfSplit = (data: TripData, idea: Idea) => {
  const s = approvedSplit(data, idea);
  return !!s && s.tracks.some((t) => t.key !== 'A' && t.ideaId === idea.id);
};

export function prayerWalk(idea: Idea): number | undefined {
  const p = idea.halal?.prayer;
  if (!p) return undefined;
  return p.access === 'onsite' ? 0 : p.places[0]?.walkMin;
}

/** One stop for the engine; a split pair is one unit (the original place, until everyone meets again). */
export function unitFor(idea: Idea, split?: Split, destinations?: Trip['destinations']): Unit {
  return {
    id: idea.id,
    loc: idea.place.location,
    ...(destinations && destinations.length > 1 ? { city: cityOf(destinations, idea.place.location) } : {}),
    duration: split ? split.reunion.afterMinutes : idea.estDurationMin,
    food: idea.place.category === 'food',
    ...(idea.window ? { window: [toMin(idea.window.start), toMin(idea.window.end)] as [number, number] } : {}),
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
 * Writes an idea's timeline stop — or, for a split, one stop per group, all
 * starting together: the main group (A) stays until everyone meets again,
 * alternative groups (B, C) from arriving until leaving, free time (F) for
 * as long as the main visit.
 */
export function writeStops(
  batch: WriteBatch,
  tripId: string,
  opts: { data: TripData; idea: Idea; day: string; start: number; durationMin?: number; orderIndex: number; actor: string },
): string[] {
  const { data, day, start } = opts;
  const idea = leadIdea(data, opts.idea);
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
  const placed: string[] = [];
  for (const t of split.tracks) {
    const track = `${split.id}:${t.key}`;
    if (t.key === 'F') {
      batch.set(
        itemRef(tripId, `free_${split.id}`),
        ScheduleItem.parse({ ...base, id: `free_${split.id}`, start: toClock(start), end: toClock(start + split.reunion.afterMinutes), ref: { kind: 'custom', title: 'Free time nearby' }, track, memberUids: t.memberUids }),
      );
      continue;
    }
    const tIdea = t.ideaId ? data.ideas.get(t.ideaId) : undefined;
    if (!tIdea) continue;
    const s = t.key === 'A' ? start : start + t.walkMin;
    const e = t.key === 'A' ? start + split.reunion.afterMinutes : s + tIdea.estDurationMin;
    batch.set(itemRef(tripId, ideaItemId(tIdea.id)), ScheduleItem.parse({ ...base, id: ideaItemId(tIdea.id), start: toClock(s), end: toClock(e), ref: { kind: 'idea', ideaId: tIdea.id }, track, memberUids: t.memberUids }));
    placed.push(tIdea.id);
  }
  return placed;
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

/** A day's airport / on-board time, from its booking moments. */
export function journeysOf(data: TripData, items: ScheduleItem[]) {
  return journeySpans(
    items.flatMap((i) => {
      if (i.ref.kind !== 'booking' || i.ref.event === 'checkin' || i.ref.event === 'checkout') return [];
      const b = data.bookings.get(i.ref.bookingId);
      return b ? [{ start: toMin(i.start), end: toMin(i.end), event: i.ref.event, bookingId: b.id, flight: b.kind === 'flight' }] : [];
    }),
  );
}

const facilityType = (name: string): NonNullable<PrayerPairing['facility']>['type'] =>
  /musall?a|surau/i.test(name) ? 'musalla' : /prayer room|prayer space/i.test(name) ? 'prayer_room' : 'mosque';

type Facility = NonNullable<PrayerPairing['facility']>;

/**
 * Where to pray for one break. The time is fixed; the place follows the plan:
 * the prayer space that adds the least detour between the stop before the
 * prayer and the stop after it (inside a long visit: at / next to that place).
 * Candidates are the prayer spaces the Halal Radar already found around both
 * stops and places earlier breaks used; only with none, one lookup on the way.
 */
async function facilityFor(data: TripData, slot: PrayerSlot, stops: ScheduleItem[], ends: Map<string, Ends>, previous: ScheduleItem[], lookups: { n: number }): Promise<Facility | undefined> {
  const before = stops.find((i) => i.id === slot.afterId);
  const inside = !!before && toMin(before.start) <= slot.start && toMin(before.end) > slot.start;
  const after = inside ? before : stops.find((i) => toMin(i.start) >= slot.end && i.id !== before?.id);
  const from = (before && ends.get(before.id)?.out) ?? slot.at;
  const to = after ? ends.get(after.id)?.in : undefined;

  const cands: Facility[] = [];
  const add = (f: Omit<Facility, 'walkMin'>) => {
    if (!cands.some((c) => c.name === f.name && metersBetween(c.location, f.location) < 50)) cands.push({ ...f, walkMin: 0 });
  };
  for (const it of [before, after]) {
    const idea = it?.ref.kind === 'idea' ? data.ideas.get(it.ref.ideaId) : undefined;
    const pr = idea?.halal?.prayer;
    if (!idea || !pr) continue;
    if (pr.access === 'onsite') add({ name: `${idea.place.name} (prayer space on site)`, location: idea.place.location, ...(idea.place.placeId ? { placeId: idea.place.placeId } : {}), type: 'prayer_room' });
    for (const p of pr.places.slice(0, 3)) add({ name: p.name, location: p.location, ...(p.placeId ? { placeId: p.placeId } : {}), type: facilityType(p.name) });
  }
  // Places earlier breaks used, if they're around this part of the route.
  for (const i of previous) {
    const f = i.prayer?.facility;
    if (f && [from, to].some((p) => p && metersBetween(p, f.location) < 2000)) add(f);
  }
  // Nothing known within walking reach of either stop → one lookup on the way.
  const inReach = cands.some((c) => [from, to].some((p) => p && metersBetween(p, c.location) <= PRAYER_REACH_M));
  if (!inReach && lookups.n++ < MAX_MOSQUE_LOOKUPS) {
    const mid = to ? { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 } : from;
    for (const p of (await searchNearby(mid, ['mosque'], 2000, 3).catch(() => null)) ?? []) add({ name: p.name, location: p.location, placeId: p.placeId, type: facilityType(p.name) });
  }
  const reachOf = (c: Facility) => Math.min(metersBetween(from, c.location), to ? metersBetween(to, c.location) : Infinity);
  let best = prayerPlaceOnRoute(cands, from, to);
  // Still nothing within ~30 min on foot: look right where the group is (once more if allowed).
  if ((!best || reachOf(best) > MAX_PRAYER_WALK_M) && lookups.n++ < MAX_MOSQUE_LOOKUPS) {
    for (const p of (await searchNearby(from, ['mosque'], 2000, 3).catch(() => null)) ?? []) add({ name: p.name, location: p.location, placeId: p.placeId, type: facilityType(p.name) });
    best = prayerPlaceOnRoute(cands, from, to);
  }
  // Better to say "any clean, quiet spot works" than send people on a long walk.
  if (!best || reachOf(best) > MAX_PRAYER_WALK_M) return undefined;
  // Walk from whichever end it's nearer (you may pray on arriving at the next stop).
  return { ...best, walkMin: Math.round((reachOf(best) * 1.3) / 80) };
}

/** How far (straight line) a filler for the people not praying may be from the prayer place. */
const FILLER_M = 700;

/**
 * Something for the members who don't pray to do during a prayer break: a
 * backlog or backup idea near where the others pray that none of them voted
 * against (liked ones first, then nearest). Not already on the timeline.
 */
function fillerFor(data: TripData, near: GeoPoint, used: Set<string>, onDay: Set<string>, slot: PrayerSlot, day: string): Idea | undefined {
  const others = data.members.filter((m) => !prays(m)).map((m) => m.uid);
  // Subuh is before the day starts — nothing to suggest.
  if (!others.length || slot.key === 'fajr') return undefined;
  const openThen = (hours?: string[]) => {
    const r = openingRanges(hours, day);
    return r === null || r.some(([o, c]) => o <= slot.start && c >= slot.end);
  };
  return [...data.ideas.values()]
    .filter((i) => !used.has(i.id) && !onDay.has(i.id) && !isAltOfSplit(data, i) && goodForWhilePraying(i, others) && openThen(i.place.openingHours))
    .filter((i) => metersBetween(i.place.location, near) <= FILLER_M)
    // Marked "good while we pray" first, then the most liked, then the nearest.
    .map((i) => ({ i, marked: i.goodWhilePraying.length, likes: others.filter((u) => i.votes[u]?.value === 1).length, d: metersBetween(i.place.location, near) }))
    .sort((a, b) => b.marked - a.marked || b.likes - a.likes || a.d - b.d)[0]?.i;
}

/**
 * Puts a day's prayer breaks at their locked prayer times (stops are never
 * moved; the timeline flags a stop planned over one) and removes breaks that
 * no longer apply. Only when someone asked for them.
 */
export async function refreshPrayers(tripId: string, day: string, data: TripData) {
  const all = await dayItems(tripId, day);
  const previous = all.filter(isPrayerItem);
  const stops = all.filter((i) => !isPrayerItem(i) && !isTrackB(i)).sort(byTimeAndPriority);
  const ends = itemEnds(data, stops);
  const frame = frameAt(data, day, stops.filter((i) => !i.locked).map((i) => ends.get(i.id)?.in).find(Boolean));
  const walkOf = (i: ScheduleItem) => {
    const idea = i.ref.kind === 'idea' ? data.ideas.get(i.ref.ideaId) : undefined;
    return idea ? prayerWalk(idea) : undefined;
  };
  const { prayers } = prayerBreaks(
    frame.prayers,
    stops.map((i) => ({ id: i.id, start: toMin(i.start), end: Math.max(toMin(i.end), toMin(i.start)), loc: ends.get(i.id)?.out, prayerWalkMin: walkOf(i) })),
    frame.base,
    journeysOf(data, stops),
    frame.inTrip,
  );
  const batch = adminDb().batch();
  const keep = new Set(prayers.map((p) => prayerItemId(day, p.key)));
  previous.filter((p) => !keep.has(p.id)).forEach((p) => batch.delete(itemRef(tripId, p.id)));
  const lookups = { n: 0 };
  const praying = prayingUids(data.members);
  const used = new Set<string>();
  // Places found for earlier breaks in this refresh (a day without stops needs just one lookup).
  const found: ScheduleItem[] = [];
  // Ideas already on this day (their status may not be updated in `data` yet).
  const onDay = new Set(all.flatMap((i) => (i.ref.kind === 'idea' ? [i.ref.ideaId] : [])));
  for (const slot of prayers) {
    const facility = await facilityFor(data, slot, stops, ends, [...previous, ...found], lookups);
    if (facility) found.push({ prayer: { prayer: PRAYER_LABEL[slot.key], at: toClock(slot.start), facility } } as ScheduleItem);
    const filler = fillerFor(data, facility?.location ?? slot.at, used, onDay, slot, day);
    if (filler) used.add(filler.id);
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
        prayer: {
          prayer: PRAYER_LABEL[slot.key],
          at: toClock(slot.start),
          ...(facility ? { facility } : {}),
          // What the others chose for this break survives re-planning.
          fillerPicks: previous.find((p) => p.id === id)?.prayer?.fillerPicks ?? {},
          ...(filler ? { fillerIdeaId: filler.id, fillerPlace: { name: filler.place.name, location: filler.place.location, ...(filler.place.placeId ? { placeId: filler.place.placeId } : {}) } } : {}),
        },
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
  const all = (await dayItems(tripId, day)).sort(byTimeAndPriority);
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
    // Departure → arrival of the same journey: no leg (you're on it).
    if (!a || !b || sameJourney(prev, it)) {
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

// ─── Checking a day ─────────────────────────────────────────────────────────

/** The same 🔴 / 🟡 problems the timeline shows for a day. */
export function dayProblems(data: TripData, day: string, items: ScheduleItem[]) {
  const chain = items.filter((i) => !isPrayerItem(i) && !isTrackB(i)).sort(byTimeAndPriority);
  const ends = itemEnds(data, chain);
  const ideaOf = (i: ScheduleItem) => (i.ref.kind === 'idea' ? data.ideas.get(i.ref.ideaId) : undefined);
  return dayWarnings(
    day,
    items.map((it) => {
      if (isPrayerItem(it)) return { ...it, kind: 'prayer' as const, label: it.prayer?.prayer ? `${it.prayer.prayer} prayer` : undefined };
      if (isTrackB(it)) return { ...it, kind: 'side' as const };
      const k = chain.indexOf(it);
      const prev = k > 0 ? chain[k - 1] : undefined;
      const a = prev && ends.get(prev.id)?.out;
      const b = ends.get(it.id)?.in;
      const checkin = it.ref.kind === 'booking' && it.ref.event === 'checkin';
      if (sameJourney(prev, it)) return { ...it, checkin };
      const known = it.transitFromPrev?.fromId === prev?.id ? it.transitFromPrev?.minutes : undefined;
      return { ...it, checkin, transitMin: known ?? (a && b ? estimateTravelMin(a, b) : undefined) };
    }),
    (id) => {
      const it = items.find((i) => i.id === id);
      return it ? ideaOf(it)?.place.openingHours : undefined;
    },
  );
}

// ─── "Fix this day" (also used by Emergency Resync) ──────────────────────────

export interface FixPlan {
  stops: { id: string; start: string; end: string }[];
  removed: { id: string; reason: string }[];
}

/**
 * Re-orders and re-times a day's movable stops so nothing is outside opening
 * hours or unreachable (travel + buffer, around bookings and prayer times).
 * Pure: `data` and `items` may be hypothetical (e.g. a delayed flight).
 */
export function planFixDay(data: TripData, day: string, items: ScheduleItem[]): FixPlan {
  const movable = items.filter((i) => !i.locked && !isPrayerItem(i) && !isTrackB(i));
  if (!movable.length) return { stops: [], removed: [] };
  const ends = itemEnds(data, items);
  const units: Unit[] = movable.flatMap((it) => {
    const idea = it.ref.kind === 'idea' ? data.ideas.get(it.ref.ideaId) : undefined;
    if (idea) return [{ ...unitFor(idea, approvedSplit(data, idea)), id: it.id, loc: ends.get(it.id)?.in ?? idea.place.location }];
    // A lunch / dinner stop stays within its meal time.
    if (it.ref.kind === 'custom' && it.ref.meal && it.ref.place) {
      return [{ id: it.id, loc: it.ref.place.location, duration: Math.max(30, toMin(it.end) - toMin(it.start)), food: true, window: MEAL_WINDOW[it.ref.meal] }];
    }
    return [];
  });
  const locked = items.filter((i) => i.locked && toMin(i.end) > toMin(i.start));
  const frame = { ...frameAt(data, day, units[0]?.loc), blocks: locked.map((l) => ({ start: toMin(l.start), end: toMin(l.end) })) };
  // Real travel times where the Routes API already measured them (+20% on estimates elsewhere).
  const known = new Map(items.flatMap((i) => (i.transitFromPrev?.fromId ? [[`${i.transitFromPrev.fromId}>${i.id}`, i.transitFromPrev.minutes] as const] : [])));
  const locIndex = new Map(units.map((u) => [`${u.loc.lat},${u.loc.lng}`, u.id]));
  const travel = (a: GeoPoint, b: GeoPoint) => {
    const from = locIndex.get(`${a.lat},${a.lng}`);
    const to = locIndex.get(`${b.lat},${b.lng}`);
    const k = from && to ? known.get(`${from}>${to}`) : undefined;
    return k ?? Math.round(estimateTravelMin(a, b) * 1.2);
  };
  const { timing } = planDay(frame, units, travel);
  return {
    stops: timing.placed.map((p) => ({ id: p.id, start: toClock(p.start), end: toClock(p.end) })),
    removed: timing.unfit.map((u) => ({ id: u.id, reason: u.reason })),
  };
}

/** Writes a FixPlan into `batch`: stops (with their split partners) re-timed, unfit ones back to the backlog. */
export function writeFixPlan(batch: WriteBatch, tripId: string, data: TripData, items: ScheduleItem[], plan: FixPlan, actorUid: string) {
  plan.stops.forEach((p, orderIndex) => {
    const it = items.find((m) => m.id === p.id);
    if (!it) return;
    const shift = toMin(p.start) - toMin(it.start);
    for (const g of pairIds(it, items)) {
      batch.update(itemRef(tripId, g.id), { start: toClock(toMin(g.start) + shift), end: toClock(toMin(g.end) + shift), orderIndex, updatedBy: actorUid, updatedAt: Date.now() });
    }
  });
  for (const r of plan.removed) {
    const it = items.find((m) => m.id === r.id);
    if (!it) continue;
    for (const g of pairIds(it, items)) {
      batch.delete(itemRef(tripId, g.id));
      if (g.ref.kind === 'idea' && data.ideas.has(g.ref.ideaId)) batch.update(ideaDocRef(tripId, g.ref.ideaId), { status: 'backlog', updatedAt: Date.now() });
    }
  }
}
