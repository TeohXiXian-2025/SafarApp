// Emergency Resync — a flight / train is delayed or cancelled:
//   resync/preview  what the new times do to the plan (nothing saved)
//   resync/apply    update the booking, re-plan the affected days, tell everyone
//                   (whoever added the booking, or the admin)
//   resync/report   anyone else: send it to the admin to review
//   resync/dismiss  the admin closes a report
//   resync/read     AI reads the airline's message / a screenshot → the new times
import { Type, type Part } from '@google/genai';
import { z } from 'zod';
import {
  Booking,
  bookingAnchors,
  Id,
  Incident,
  LocalDateTime,
  paths,
  metersBetween,
  ScheduleItem,
  type BookingDraft,
  type GeoPoint,
} from '../../src/domain/index.js';
import { withTrip } from '../_lib/auth.js';
import { adminBucket, adminDb } from '../_lib/firebaseAdmin.js';
import { extractJson } from '../_lib/gemini.js';
import { searchNearby, searchNearbyFood } from '../_lib/places.js';
import { useDailyQuota } from '../_lib/quota.js';
import { HttpError, json, readJson } from '../_lib/http.js';
import { notify } from '../_lib/push.js';
import type { RouteTable } from '../_lib/routes.js';
import { dayItems, loadTripData, planFixDay, refreshDay, writeFixPlan, type TripData } from '../_lib/schedule.js';
import { logActivity } from '../_lib/trip.js';
import { describeBooking, removeBooking, rescheduleBooking } from './bookings.js';

const Change = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delay'), startLocal: LocalDateTime, endLocal: LocalDateTime }),
  z.object({ type: z.literal('cancel') }),
]);
type Change = z.infer<typeof Change>;
const Body = z.object({ bookingId: Id, change: Change, incidentId: Id.optional() });

const incidentRef = (tripId: string, id: string) => adminDb().doc(`${paths.incidents(tripId)}/${id}`);
const hhmm = (local: string) => local.slice(11, 16);

function label(b: Booking) {
  return [b.carrier, b.number].filter(Boolean).join(' ') || describeBooking(b);
}

function assertChange(b: Booking, change: Change) {
  if (b.kind === 'hotel') throw new HttpError(400, 'Resync is for flights, trains, buses and ferries');
  if (change.type === 'delay') {
    if (change.endLocal <= change.startLocal && b.from?.timezone === b.to.timezone) throw new HttpError(400, 'Arrival must be after departure');
    if (change.startLocal === b.startLocal && change.endLocal === b.endLocal) throw new HttpError(400, 'Those are the same times as now');
  }
}

async function loadBooking(tripId: string, id: string): Promise<Booking> {
  const snap = await adminDb().doc(`${paths.bookings(tripId)}/${id}`).get();
  if (!snap.exists) throw new HttpError(404, 'Booking not found');
  return Booking.parse(snap.data());
}

/** What the change does, without saving anything. */
async function simulate(tripId: string, data: TripData, booking: Booking, change: Change) {
  const { trip } = data;
  const oldAnchors = (await adminDb().collection(paths.schedule(tripId)).where('ref.bookingId', '==', booking.id).get()).docs.map((d) => ScheduleItem.parse(d.data()));
  const next = change.type === 'delay' ? { ...booking, startLocal: change.startLocal, endLocal: change.endLocal } : null;
  const newAnchors: ScheduleItem[] = next
    ? bookingAnchors(next as BookingDraft).map((a, i) => ({
        id: `bk_${booking.id}_${i}`,
        day: a.day,
        start: a.start,
        end: a.end,
        ref: { kind: 'booking', bookingId: booking.id, event: a.event },
        track: 'all',
        memberUids: booking.travellerUids,
        locked: true,
        orderIndex: 0,
        updatedBy: 'system',
        updatedAt: Date.now(),
      }))
    : [];
  const days = [...new Set([...oldAnchors, ...newAnchors].map((a) => a.day))].filter((d) => d >= trip.startDate && d <= trip.endDate).sort();
  const bookings = new Map(data.bookings);
  if (next) bookings.set(booking.id, next);
  else bookings.delete(booking.id);
  const hypo: TripData = { ...data, bookings };

  const name = (id: string, items: ScheduleItem[]) => {
    const it = items.find((i) => i.id === id);
    return it?.ref.kind === 'idea' ? (data.ideas.get(it.ref.ideaId)?.place.name ?? 'A stop') : 'A stop';
  };
  const out = [];
  for (const day of days) {
    const items = [...(await dayItems(tripId, day)).filter((i) => !(i.ref.kind === 'booking' && i.ref.bookingId === booking.id)), ...newAnchors.filter((a) => a.day === day)];
    const plan = planFixDay(hypo, day, items);
    const moved = plan.stops
      .map((s) => ({ id: s.id, name: name(s.id, items), from: items.find((i) => i.id === s.id)!.start, to: s.start }))
      .filter((m) => m.from !== m.to);
    const removed = plan.removed.map((r) => ({ id: r.id, name: name(r.id, items), reason: r.reason }));
    out.push({ day, moved, removed });
  }

  // Knock-on effects.
  const warnings: string[] = [];
  if (next) {
    const [day, time] = next.endLocal.split('T');
    const night = time < '04:00' ? new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : day;
    const hotel = [...data.bookings.values()].find((h) => h.kind === 'hotel' && h.startLocal.slice(0, 10) === night && h.travellerUids.some((u) => booking.travellerUids.includes(u)));
    if (hotel && (time >= '23:00' || time < '04:00')) warnings.push(`You'll now reach ${hotel.to.name} after ${time}. Call them so they keep your room.`);
    for (const o of data.bookings.values()) {
      if (o.id === booking.id || o.kind === 'hotel' || !o.travellerUids.some((u) => booking.travellerUids.includes(u))) continue;
      const wasAfter = o.startLocal >= booking.endLocal;
      const buffer = o.kind === 'flight' ? 120 : 30;
      // Both are local times; an onward journey leaves from where this one arrives (same timezone).
      const gap = (Date.parse(`${o.startLocal}:00Z`) - Date.parse(`${next.endLocal}:00Z`)) / 60_000;
      if (wasAfter && gap < buffer) warnings.push(`${gap < 0 ? "You'd miss" : 'Very tight for'} ${label(o)} at ${hhmm(o.startLocal)} (${gap < 0 ? 'it leaves before you arrive' : `${Math.round(gap)} min to connect`}). Contact the operator.`);
    }
  } else {
    warnings.push('Rebook, then add the new ticket in Bookings — Safar re-plans around it.');
  }
  return { days: out, warnings, next };
}

/** Prayer space and halal food around where the travellers are stuck (Google Places). */
async function aroundHere(at: GeoPoint) {
  const [mosques, food] = await Promise.all([searchNearby(at, ['mosque'], 3000, 3), searchNearbyFood(at, ['halal_restaurant'], 2000, 5)]);
  const pick = (l: { name: string; location: GeoPoint }[] | null) =>
    (l ?? []).map((p) => ({ name: p.name, meters: Math.round(metersBetween(at, p.location)), location: p.location })).sort((a, b) => a.meters - b.meters).slice(0, 3);
  return { prayer: pick(mosques), food: pick(food) };
}

const READ_SYSTEM = `You read an airline / rail / bus disruption message (SMS, email, app screenshot or departure board) for ONE journey.
Return: cancelled (true if the journey is cancelled), newDeparture and newArrival as LOCAL wall-clock times YYYY-MM-DDTHH:mm exactly as printed.
If only a new departure time is given, leave newArrival empty. If a year or date is missing, take it from the original journey given.
confidence 0..1. If the message isn't about this journey, confidence 0.`;

async function tell(data: TripData, tripId: string, actorUid: string, title: string, body: string) {
  await notify(data.trip.memberIds, { kind: 'timeline', title, body, url: `/t/${tripId}/timeline` }, { timeZone: data.trip.destinations[0].timezone, except: actorUid });
}

export const resyncRoutes: RouteTable = {
  'POST resync/preview': withTrip(
    async (req, { tripId, member }) => {
      const { bookingId, change } = await readJson(req, Body);
      const [data, booking] = await Promise.all([loadTripData(tripId), loadBooking(tripId, bookingId)]);
      assertChange(booking, change);
      const { days, warnings } = await simulate(tripId, data, booking, change);
      // Delayed: you wait where you leave from. Cancelled: you're stuck there too.
      const stuck = booking.from ?? booking.to;
      const nearby = { at: stuck.name, ...(await aroundHere(stuck.location)) };
      return json({ days, warnings, nearby, canApply: booking.createdBy === member.uid || member.role === 'admin' });
    },
    { perMinute: 20 },
  ),

  'POST resync/apply': withTrip(
    async (req, { tripId, member }) => {
      const { bookingId, change, incidentId } = await readJson(req, Body);
      const booking = await loadBooking(tripId, bookingId);
      if (booking.createdBy !== member.uid && member.role !== 'admin') throw new HttpError(403, 'Only whoever added this booking, or the admin, can apply it — send it to them instead');
      assertChange(booking, change);
      const before = await loadTripData(tripId);
      const { days } = await simulate(tripId, before, booking, change);

      const what = label(booking);
      if (change.type === 'delay') await rescheduleBooking(tripId, booking, change.startLocal, change.endLocal, member, `moved ${what} to ${hhmm(change.startLocal)} → ${hhmm(change.endLocal)} (delay)`);
      else await removeBooking(tripId, booking, member, `marked ${what} as cancelled`);

      // Re-plan each affected day for real, now the booking has changed.
      const data = await loadTripData(tripId);
      const db = adminDb();
      let moved = 0;
      let removed = 0;
      for (const d of days) {
        const items = await dayItems(tripId, d.day);
        const plan = planFixDay(data, d.day, items);
        moved += plan.stops.filter((s) => items.find((i) => i.id === s.id)?.start !== s.start).length;
        removed += plan.removed.length;
        if (plan.stops.length || plan.removed.length) {
          const batch = db.batch();
          writeFixPlan(batch, tripId, data, items, plan, member.uid);
          await batch.commit();
        }
        await refreshDay(tripId, d.day, data);
      }

      const now = Date.now();
      const ref = incidentId ? incidentRef(tripId, incidentId) : db.collection(paths.incidents(tripId)).doc();
      const prev = incidentId ? Incident.safeParse((await ref.get()).data()) : null;
      const incident: Incident = {
        id: ref.id,
        type: change.type === 'cancel' ? 'flight_cancelled' : booking.kind === 'flight' ? 'flight_delay' : 'transport_disruption',
        description: `${what}: ${change.type === 'cancel' ? 'cancelled' : `now ${hhmm(change.startLocal)} → ${hhmm(change.endLocal)}`}`,
        attachmentPaths: [],
        createdBy: prev?.success ? prev.data.createdBy : member.uid,
        createdAt: prev?.success ? prev.data.createdAt : now,
        status: 'applied',
        bookingId,
        change,
        resolvedBy: member.uid,
      };
      const batch = db.batch();
      batch.set(ref, Incident.parse(incident));
      logActivity(batch, tripId, member.uid, `Plan re-synced after ${what} ${change.type === 'cancel' ? 'was cancelled' : 'changed'}: ${moved} moved, ${removed} back to the backlog`);
      await batch.commit();
      const summary = [moved && `${moved} stop${moved > 1 ? 's' : ''} moved`, removed && `${removed} back to the backlog`].filter(Boolean).join(', ') || 'the plan still fits';
      await tell(data, tripId, member.uid, change.type === 'cancel' ? `${what} cancelled` : `${what} now ${hhmm(change.startLocal)} → ${hhmm(change.endLocal)}`, `Timeline updated: ${summary}.`);
      return json({ moved, removed, incidentId: ref.id });
    },
    { perMinute: 10 },
  ),

  /** A traveller who can't apply it sends it to the admin (and whoever added the booking). */
  'POST resync/report': withTrip(
    async (req, { tripId, member }) => {
      const { bookingId, change } = await readJson(req, Body);
      const [data, booking] = await Promise.all([loadTripData(tripId), loadBooking(tripId, bookingId)]);
      assertChange(booking, change);
      const db = adminDb();
      const ref = db.collection(paths.incidents(tripId)).doc();
      const what = label(booking);
      const text = change.type === 'cancel' ? `${what} is cancelled` : `${what} now ${hhmm(change.startLocal)} → ${hhmm(change.endLocal)}`;
      const batch = db.batch();
      batch.set(
        ref,
        Incident.parse({
          id: ref.id,
          type: change.type === 'cancel' ? 'flight_cancelled' : booking.kind === 'flight' ? 'flight_delay' : 'transport_disruption',
          description: text,
          attachmentPaths: [],
          createdBy: member.uid,
          createdAt: Date.now(),
          status: 'open',
          bookingId,
          change,
        }),
      );
      logActivity(batch, tripId, member.uid, `${member.displayName} reported: ${text}`);
      await batch.commit();
      await notify(
        [data.trip.adminId, booking.createdBy],
        { kind: 'decide', title: `${member.displayName}: ${text}`, body: 'Review the new plan in Bookings and apply it.', url: `/t/${tripId}/bookings`, tag: `incident-${ref.id}` },
        { timeZone: data.trip.destinations[0].timezone, except: member.uid },
      );
      return json({ incidentId: ref.id }, { status: 201 });
    },
    { perMinute: 10 },
  ),

  /** The airline's message (pasted text or an uploaded screenshot) → the new local times. Nothing is saved. */
  'POST resync/read': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ bookingId: Id, text: z.string().min(10).max(5000).optional(), storagePath: z.string().max(300).optional() }));
      if (!body.text && !body.storagePath) throw new HttpError(400, 'Paste the message or upload a screenshot');
      const booking = await loadBooking(tripId, body.bookingId);
      await useDailyQuota(member.uid, 'bookingParse');
      const context = `Original journey: ${label(booking)} from ${booking.from?.name ?? '?'} to ${booking.to.name}, departing ${booking.startLocal}, arriving ${booking.endLocal} (local times).`;
      const parts: Part[] = [{ text: context }];
      if (body.storagePath) {
        if (!body.storagePath.startsWith(`trips/${tripId}/users/${member.uid}/`) || body.storagePath.includes('..')) throw new HttpError(403, 'You can only read your own uploads');
        const file = adminBucket().file(body.storagePath);
        const [meta] = await file.getMetadata().catch(() => {
          throw new HttpError(404, 'Upload not found — please upload it again');
        });
        const type = String(meta.contentType ?? '');
        if (!/^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/.test(type)) throw new HttpError(415, 'Upload a screenshot or PDF');
        const [buf] = await file.download();
        parts.push({ inlineData: { mimeType: type, data: buf.toString('base64') } });
      }
      if (body.text) parts.push({ text: `Message:\n${body.text}` });
      const r = await extractJson({
        system: READ_SYSTEM,
        parts,
        responseSchema: {
          type: Type.OBJECT,
          properties: { cancelled: { type: Type.BOOLEAN }, newDeparture: { type: Type.STRING }, newArrival: { type: Type.STRING }, confidence: { type: Type.NUMBER } },
          required: ['cancelled', 'confidence'],
        },
        validate: z.object({ cancelled: z.boolean(), newDeparture: z.string().optional(), newArrival: z.string().optional(), confidence: z.number().catch(0) }),
      });
      const ok = (s?: string) => (s && LocalDateTime.safeParse(s.slice(0, 16)).success ? s.slice(0, 16) : undefined);
      const dep = ok(r.newDeparture);
      let arr = ok(r.newArrival);
      // Only a new departure: keep the journey's length.
      if (dep && !arr) arr = new Date(Date.parse(`${dep}:00Z`) + (Date.parse(`${booking.endLocal}:00Z`) - Date.parse(`${booking.startLocal}:00Z`))).toISOString().slice(0, 16);
      return json({ cancelled: r.cancelled, ...(dep ? { startLocal: dep } : {}), ...(arr ? { endLocal: arr } : {}), confidence: r.confidence });
    },
    { perMinute: 6 },
  ),

  'POST resync/dismiss': withTrip(
    async (req, { tripId, member }) => {
      const { incidentId } = await readJson(req, z.object({ incidentId: Id }));
      await incidentRef(tripId, incidentId).update({ status: 'dismissed', resolvedBy: member.uid });
      return json({ ok: true });
    },
    { admin: true, perMinute: 20 },
  ),
};

