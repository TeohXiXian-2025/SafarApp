// Server side of the timeline: loads what the scheduling engine needs, turns
// ideas into units, keeps each day's prayer breaks and travel legs current,
// and writes split pairs (two parallel stops) as one.
import { FieldValue, type WriteBatch } from 'firebase-admin/firestore';
import {
  Booking,
  byTime,
  dayFrames,
  dayWarnings,
  estimateTravelMin,
  Idea,
  metersBetween,
  ideaItemId,
  Member,
  mergePrefs,
  paths,
  PRAYER_LABEL,
  planDay,
  journeySpans,
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
const MAX_MOSQUE_LOOKUPS = 4;

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
export function unitFor(idea: Idea, split?: Split): Unit {
  return {
    id: idea.id,
    loc: idea.place.location,
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

/** How far (straight line) a filler for the people not praying may be from the prayer place. */
const FILLER_M = 700;

/**
 * Something for the members who don't pray to do during a prayer break: a
 * backlog or backup idea near where the others pray that none of them voted
 * against (liked ones first, then nearest). Not already on the timeline.
 */
function fillerFor(data: TripData, near: GeoPoint, used: Set<string>): Idea | undefined {
  const others = data.members.filter((m) => !m.prefs?.prayerReminders).map((m) => m.uid);
  if (!others.length) return undefined;
  return [...data.ideas.values()]
    .filter((i) => (i.status === 'backlog' || i.status === 'backup') && !used.has(i.id) && !isAltOfSplit(data, i))
    .filter((i) => metersBetween(i.place.location, near) <= FILLER_M)
    .filter((i) => !others.some((u) => i.votes[u]?.value === -1))
    .map((i) => ({ i, likes: others.filter((u) => i.votes[u]?.value === 1).length, d: metersBetween(i.place.location, near) }))
    .sort((a, b) => b.likes - a.likes || a.d - b.d)[0]?.i;
}

/**
 * Puts a day's prayer breaks at their locked prayer times (stops are never
 * moved; the timeline flags a stop planned over one) and removes breaks that
 * no longer apply. Only when someone asked for them.
 */
export async function refreshPrayers(tripId: string, day: string, data: TripData) {
  const all = await dayItems(tripId, day);
  const previous = all.filter(isPrayerItem);
  const stops = all.filter((i) => !isPrayerItem(i) && !isTrackB(i)).sort(byTime);
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
  );
  const batch = adminDb().batch();
  const keep = new Set(prayers.map((p) => prayerItemId(day, p.key)));
  previous.filter((p) => !keep.has(p.id)).forEach((p) => batch.delete(itemRef(tripId, p.id)));
  const lookups = { n: 0 };
  const praying = prayingUids(data.members);
  const used = new Set<string>();
  for (const slot of prayers) {
    const facility = await facilityFor(data, slot, stops, previous, lookups);
    const filler = fillerFor(data, facility?.location ?? slot.at, used);
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

// ─── Checking a day ─────────────────────────────────────────────────────────

/** The same 🔴 / 🟡 problems the timeline shows for a day. */
export function dayProblems(data: TripData, day: string, items: ScheduleItem[]) {
  const chain = items.filter((i) => !isPrayerItem(i) && !isTrackB(i)).sort(byTime);
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
      const known = it.transitFromPrev?.fromId === prev?.id ? it.transitFromPrev?.minutes : undefined;
      return { ...it, transitMin: known ?? (a && b ? estimateTravelMin(a, b) : undefined) };
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
    if (!idea) return [];
    return [{ ...unitFor(idea, approvedSplit(data, idea)), id: it.id, loc: ends.get(it.id)?.in ?? idea.place.location }];
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
