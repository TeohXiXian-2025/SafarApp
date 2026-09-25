// Manual timeline arranging: put backlog ideas on a day, move / re-time /
// reorder them, take them off again. Booking anchors stay locked. After every
// change the day's travel legs are refreshed from the Routes API.
import { z } from 'zod';
import {
  Booking,
  byTime,
  DEFAULT_GAP,
  estimateTravelMin,
  Id,
  Idea,
  ideaItemId,
  LocalDate,
  LocalTime,
  nextSlot,
  paths,
  reflowDay,
  ScheduleItem,
  toClock,
  toMin,
  type GeoPoint,
  type Trip,
} from '../../src/domain/index.js';
import { withTrip } from '../_lib/auth.js';
import { travelLeg } from '../_lib/directions.js';
import { adminDb } from '../_lib/firebaseAdmin.js';
import { HttpError, json, readJson } from '../_lib/http.js';
import { useDailyQuota } from '../_lib/quota.js';
import type { RouteTable } from '../_lib/routes.js';
import { loadTrip, logActivity } from '../_lib/trip.js';
import { FieldValue } from 'firebase-admin/firestore';

/** Google allows caching route results for up to 30 days. */
const LEG_TTL = 30 * 86_400_000;
/** Routes API calls per request — a day rarely has more new legs than this. */
const MAX_NEW_LEGS = 12;

const itemRef = (tripId: string, id: string) => adminDb().doc(`${paths.schedule(tripId)}/${id}`);
const ideaRef = (tripId: string, id: string) => adminDb().doc(paths.idea(tripId, id));

async function dayItems(tripId: string, day: string): Promise<ScheduleItem[]> {
  const snap = await adminDb().collection(paths.schedule(tripId)).where('day', '==', day).get();
  return snap.docs.flatMap((d) => {
    const r = ScheduleItem.safeParse(d.data());
    return r.success ? [r.data] : [];
  });
}

async function loadItem(tripId: string, id: string): Promise<ScheduleItem> {
  const snap = await itemRef(tripId, id).get();
  if (!snap.exists) throw new HttpError(404, 'That stop is no longer on the timeline');
  const item = ScheduleItem.parse(snap.data());
  if (item.locked) throw new HttpError(409, 'Bookings are fixed — edit the booking to change its time');
  return item;
}

function assertTripDay(trip: Trip, day: string) {
  if (day < trip.startDate || day > trip.endDate) throw new HttpError(400, 'That day is outside the trip dates');
}

const minutesOf = (it: Pick<ScheduleItem, 'start' | 'end'>) => Math.max(5, toMin(it.end) - toMin(it.start));

/** Where you arrive at an item, and where you leave it from. */
interface Ends {
  in: GeoPoint;
  out: GeoPoint;
}

/** Locations for each item on a day (ideas and bookings are looked up in one read each). */
async function itemEnds(tripId: string, items: ScheduleItem[]): Promise<Map<string, Ends>> {
  const db = adminDb();
  const ideaIds = [...new Set(items.flatMap((i) => (i.ref.kind === 'idea' ? [i.ref.ideaId] : [])))];
  const bookingIds = [...new Set(items.flatMap((i) => (i.ref.kind === 'booking' ? [i.ref.bookingId] : [])))];
  const [ideaSnaps, bookingSnaps] = await Promise.all([
    ideaIds.length ? db.getAll(...ideaIds.map((id) => ideaRef(tripId, id))) : [],
    bookingIds.length ? db.getAll(...bookingIds.map((id) => db.doc(`${paths.bookings(tripId)}/${id}`))) : [],
  ]);
  const ideas = new Map(ideaSnaps.flatMap((s) => (s.exists ? [[s.id, s.data() as Idea] as const] : [])));
  const bookings = new Map(bookingSnaps.flatMap((s) => (s.exists ? [[s.id, s.data() as Booking] as const] : [])));

  const out = new Map<string, Ends>();
  for (const it of items) {
    const r = it.ref;
    if (r.kind === 'idea') {
      const at = ideas.get(r.ideaId)?.place.location;
      if (at) out.set(it.id, { in: at, out: at });
    } else if (r.kind === 'booking') {
      const b = bookings.get(r.bookingId);
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

/**
 * Recomputes the travel leg into each stop of a day. A leg is reused while it
 * still starts from the same previous stop and is under 30 days old.
 */
async function refreshLegs(tripId: string, day: string) {
  const items = (await dayItems(tripId, day)).sort(byTime);
  const ends = await itemEnds(tripId, items);
  const batch = adminDb().batch();
  let writes = 0;
  let calls = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const prev = items[i - 1];
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
    batch.update(itemRef(tripId, it.id), {
      transitFromPrev: fresh ? { ...fresh, fromId: prev.id, at: Date.now() } : FieldValue.delete(),
    });
    writes++;
  }
  if (writes) await batch.commit();
}

/** Packing gaps from straight-line estimates (the real legs arrive right after). */
async function estimatedGaps(tripId: string, items: ScheduleItem[]) {
  const ends = await itemEnds(tripId, items);
  return (prevId: string, id: string) => {
    const a = ends.get(prevId)?.out;
    const b = ends.get(id)?.in;
    return a && b ? Math.max(5, estimateTravelMin(a, b)) : DEFAULT_GAP;
  };
}

export const scheduleRoutes: RouteTable = {
  /** Put a backlog idea on a day — at `start`, or after the day's last stop. */
  'POST schedule/add': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ ideaId: Id, day: LocalDate, start: LocalTime.optional() }));
      await useDailyQuota(member.uid, 'arrange');
      const db = adminDb();
      await db.runTransaction(async (tx) => {
        const trip = await loadTrip(tripId, tx);
        assertTripDay(trip, body.day);
        const snap = await tx.get(ideaRef(tripId, body.ideaId));
        if (!snap.exists) throw new HttpError(404, 'Idea not found');
        const idea = Idea.parse(snap.data());
        if (idea.status === 'scheduled') throw new HttpError(409, `${idea.place.name} is already on the timeline`);
        if (idea.status !== 'backlog') throw new HttpError(409, 'Only ideas in the backlog can go on the timeline');

        const day = (await tx.get(db.collection(paths.schedule(tripId)).where('day', '==', body.day))).docs.map((d) => d.data() as ScheduleItem);
        const slot = body.start
          ? { start: body.start, end: toClock(toMin(body.start) + idea.estDurationMin) }
          : nextSlot(day, idea.estDurationMin);
        const id = ideaItemId(idea.id);
        tx.set(
          itemRef(tripId, id),
          ScheduleItem.parse({
            id,
            day: body.day,
            ...slot,
            ref: { kind: 'idea', ideaId: idea.id },
            track: 'all',
            memberUids: trip.memberIds,
            locked: false,
            orderIndex: day.length,
            updatedBy: member.uid,
            updatedAt: Date.now(),
          }),
        );
        tx.update(snap.ref, { status: 'scheduled', updatedAt: Date.now() });
        logActivity(tx, tripId, member.uid, `${member.displayName} added ${idea.place.name} to ${body.day}`);
      });
      await refreshLegs(tripId, body.day);
      return json({ id: ideaItemId(body.ideaId) }, { status: 201 });
    },
    { perMinute: 30 },
  ),

  /** Move a stop to another day and/or time, or change how long it takes. */
  'POST schedule/update': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(
        req,
        z.object({ id: Id, day: LocalDate.optional(), start: LocalTime.optional(), durationMin: z.number().int().min(5).max(24 * 60).optional() }),
      );
      await useDailyQuota(member.uid, 'arrange');
      const [trip, item] = await Promise.all([loadTrip(tripId), loadItem(tripId, body.id)]);
      const day = body.day ?? item.day;
      assertTripDay(trip, day);
      const moved = day !== item.day;
      let start = body.start ?? item.start;
      const duration = body.durationMin ?? minutesOf(item);
      let orderIndex = item.orderIndex;
      if (moved) {
        const target = await dayItems(tripId, day);
        orderIndex = target.length;
        if (!body.start) start = nextSlot(target, duration).start;
      }
      await itemRef(tripId, item.id).update({
        day,
        start,
        end: toClock(toMin(start) + duration),
        orderIndex,
        // Leaving a day means a new previous stop.
        ...(moved ? { transitFromPrev: FieldValue.delete() } : {}),
        updatedBy: member.uid,
        updatedAt: Date.now(),
      });
      await Promise.all([refreshLegs(tripId, day), moved ? refreshLegs(tripId, item.day) : null]);
      return json({ ok: true });
    },
    { perMinute: 60 },
  ),

  /** New order for a day's movable stops; they're re-timed back to back around bookings. */
  'POST schedule/reorder': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ day: LocalDate, order: z.array(Id).min(1).max(100) }));
      await useDailyQuota(member.uid, 'arrange');
      const items = await dayItems(tripId, body.day);
      const times = reflowDay(items, body.order, await estimatedGaps(tripId, items));
      const batch = adminDb().batch();
      for (const t of times) {
        batch.update(itemRef(tripId, t.id), { start: t.start, end: t.end, orderIndex: t.orderIndex, updatedBy: member.uid, updatedAt: Date.now() });
      }
      logActivity(batch, tripId, member.uid, `${member.displayName} reordered ${body.day}`);
      await batch.commit();
      await refreshLegs(tripId, body.day);
      return json({ items: times });
    },
    { perMinute: 60 },
  ),

  /** Take a stop off the timeline; its idea goes back to the backlog. */
  'POST schedule/remove': withTrip(
    async (req, { tripId, member }) => {
      const { id } = await readJson(req, z.object({ id: Id }));
      const item = await loadItem(tripId, id);
      const batch = adminDb().batch();
      batch.delete(itemRef(tripId, id));
      if (item.ref.kind === 'idea') {
        const idea = await ideaRef(tripId, item.ref.ideaId).get();
        if (idea.exists) {
          batch.update(idea.ref, { status: 'backlog', updatedAt: Date.now() });
          logActivity(batch, tripId, member.uid, `${member.displayName} took ${(idea.data() as Idea).place.name} off ${item.day}`);
        }
      }
      await batch.commit();
      await refreshLegs(tripId, item.day);
      return json({ ok: true });
    },
    { perMinute: 60 },
  ),
};
