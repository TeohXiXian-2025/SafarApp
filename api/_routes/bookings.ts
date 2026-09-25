import { Type, type Part } from '@google/genai';
import { z } from 'zod';
import {
  Booking,
  BookingDraft,
  bookingAnchors,
  hotelJourneyProblem,
  Id,
  paths,
  ScheduleItem,
  type BookingPlace,
  type Member,
} from '../../src/domain/index.js';
import { withTrip } from '../_lib/auth.js';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from '../_lib/firebaseAdmin.js';
import { extractJson } from '../_lib/gemini.js';
import { findPlace, localToInstant } from '../_lib/google.js';
import { HttpError, json, readJson } from '../_lib/http.js';
import type { RouteTable } from '../_lib/routes.js';
import { logActivity } from '../_lib/trip.js';
import { useDailyQuota } from '../_lib/quota.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PARSEABLE = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/;

// ─── AI extraction ───────────────────────────────────────────────────────────

const SYSTEM = `You extract travel bookings (flights, trains, buses, ferries, hotels) from tickets, boarding passes, e-tickets and confirmation emails.
Rules:
- One entry per flight/train/bus/ferry LEG, and one per hotel stay. A return trip is two legs.
- startLocal/endLocal are the LOCAL wall-clock times printed for each place, format YYYY-MM-DDTHH:mm. Never convert timezones.
  Transport: start = departure, end = arrival. Hotel: start = check-in, end = check-out.
  If a hotel shows no times, use 15:00 check-in and 12:00 check-out. If a year is missing, infer it from the other dates.
- For airports give the IATA code in fromCode/toCode (e.g. KUL). For stations give the station name.
- For hotels put the hotel name in carrier and toName, and its address in toAddress; leave from* empty.
- passengerNames: travellers exactly as printed.
- Only include what is actually in the document. Use empty strings for unknown text fields.
- confidence: 0..1, how sure you are the whole extraction is correct. If nothing travel-related is readable, return an empty list.`;

const str = { type: Type.STRING };
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    bookings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING, enum: ['flight', 'train', 'bus', 'ferry', 'hotel'] },
          carrier: str,
          number: str,
          pnr: str,
          fromName: str,
          fromCode: str,
          fromCity: str,
          toName: str,
          toCode: str,
          toCity: str,
          toAddress: str,
          startLocal: str,
          endLocal: str,
          passengerNames: { type: Type.ARRAY, items: str },
        },
        required: ['kind', 'toName', 'startLocal', 'endLocal'],
      },
    },
    confidence: { type: Type.NUMBER },
  },
  required: ['bookings', 'confidence'],
};

const Extracted = z.object({
  bookings: z
    .array(
      z.object({
        kind: z.enum(['flight', 'train', 'bus', 'ferry', 'hotel']),
        carrier: z.string().optional(),
        number: z.string().optional(),
        pnr: z.string().optional(),
        fromName: z.string().optional(),
        fromCode: z.string().optional(),
        fromCity: z.string().optional(),
        toName: z.string(),
        toCode: z.string().optional(),
        toCity: z.string().optional(),
        toAddress: z.string().optional(),
        startLocal: z.string(),
        endLocal: z.string(),
        passengerNames: z.array(z.string()).optional(),
      }),
    )
    .max(20),
  confidence: z.number().min(0).max(1),
});
type Extracted = z.infer<typeof Extracted>['bookings'][number];

const clean = (s?: string, max = 100) => (s?.trim() ? s.trim().slice(0, max) : undefined);

/** Very small fuzzy match of printed passenger names ("TEOH/XI XIAN MR") to trip members. */
function matchMembers(names: string[], members: Member[]): string[] {
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(mr|mrs|ms|miss|dr|mstr)\b/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1);
  const out = new Set<string>();
  for (const n of names) {
    const nt = new Set(tokens(n));
    for (const m of members) {
      const mt = tokens(m.displayName);
      const hits = mt.filter((t) => nt.has(t)).length;
      if (mt.length && hits >= Math.min(2, mt.length)) out.add(m.uid);
    }
  }
  return [...out];
}

async function toDraft(e: Extracted, members: Member[], uploaderUid: string): Promise<{ draft: Partial<BookingDraft>; warnings: string[] }> {
  const warnings: string[] = [];
  const hotel = e.kind === 'hotel';

  // Flights: search by IATA code ("NRT airport") so we get the airport itself,
  // not a terminal ("Terminal 2") the model may have copied from the ticket.
  const iata = (code?: string) => (code?.trim().match(/^[A-Za-z]{3}$/) ? code.trim().toUpperCase() : null);
  const leg = (code?: string, name?: string, city?: string) =>
    e.kind === 'flight' && iata(code) ? `${iata(code)} ${city?.trim() ?? ''} airport`.replace(/\s+/g, ' ') : [code, name, city].filter((x) => x?.trim()).join(' ');
  const fromQuery = hotel ? '' : leg(e.fromCode, e.fromName, e.fromCity);
  const toQuery = hotel ? [e.toName, e.toAddress || e.toCity].filter((x) => x?.trim()).join(', ') : leg(e.toCode, e.toName, e.toCity);

  const [from, to] = await Promise.all([fromQuery ? findPlace(fromQuery) : null, findPlace(toQuery)]);
  if (!hotel && !from) warnings.push(`Couldn't find "${fromQuery}" on the map — please pick it.`);
  if (!to) warnings.push(`Couldn't find "${toQuery}" on the map — please pick it.`);

  const passengerNames = (e.passengerNames ?? []).map((n) => n.trim()).filter(Boolean).slice(0, 20);
  const matched = matchMembers(passengerNames, members);

  const valid = (s: string) => BookingDraft.shape.startLocal.safeParse(s).success;
  if (!valid(e.startLocal) || !valid(e.endLocal)) warnings.push('Some dates/times were unclear — please check them.');

  return {
    draft: {
      kind: e.kind,
      carrier: clean(e.carrier),
      number: clean(e.number, 30),
      pnr: clean(e.pnr, 20),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      startLocal: valid(e.startLocal) ? e.startLocal : undefined,
      endLocal: valid(e.endLocal) ? e.endLocal : undefined,
      passengerNames,
      travellerUids: matched.length ? matched : [uploaderUid],
    } as Partial<BookingDraft>,
    warnings,
  };
}

// ─── Persisting ──────────────────────────────────────────────────────────────

async function withTimezones(draft: BookingDraft) {
  const [start, end] = await Promise.all([
    localToInstant((draft.from ?? draft.to).location, draft.startLocal),
    localToInstant(draft.to.location, draft.endLocal),
  ]);
  if (Date.parse(end.iso) < Date.parse(start.iso)) {
    throw new HttpError(400, draft.kind === 'hotel' ? 'Check-out is before check-in.' : 'Arrival is before departure (after timezones).');
  }
  const from: BookingPlace | undefined = draft.from ? { ...draft.from, timezone: start.timeZoneId } : undefined;
  const to: BookingPlace = { ...draft.to, timezone: end.timeZoneId };
  return { from, to, startAt: start.iso, endAt: end.iso };
}

async function loadMembers(tripId: string): Promise<Member[]> {
  const snap = await adminDb().collection(paths.members(tripId)).get();
  return snap.docs.map((d) => d.data() as Member);
}

function assertTravellers(draft: BookingDraft, members: Member[]) {
  const ids = new Set(members.map((m) => m.uid));
  if (!draft.travellerUids.every((u) => ids.has(u))) throw new HttpError(400, 'Travellers must be members of this trip');
}

/** Writes the booking and replaces its locked timeline anchors, atomically. */
async function saveBooking(tripId: string, booking: Booking, actorUid: string, activity: string) {
  const db = adminDb();
  const schedule = db.collection(paths.schedule(tripId));
  const old = await schedule.where('ref.bookingId', '==', booking.id).get();

  const batch = db.batch();
  batch.set(db.doc(`${paths.bookings(tripId)}/${booking.id}`), Booking.parse(booking));
  old.docs.forEach((d) => batch.delete(d.ref));
  bookingAnchors(booking).forEach((a, i) => {
    const ref = schedule.doc(`bk_${booking.id}_${i}`);
    batch.set(
      ref,
      ScheduleItem.parse({
        id: ref.id,
        day: a.day,
        start: a.start,
        end: a.end,
        ref: { kind: 'booking', bookingId: booking.id, event: a.event },
        track: 'all',
        memberUids: booking.travellerUids,
        locked: true,
        orderIndex: 0,
        updatedBy: actorUid,
        updatedAt: Date.now(),
      }),
    );
  });
  logActivity(batch, tripId, actorUid, activity);
  await batch.commit();
}

/** A hotel whose check-in / check-out clashes with its guests' flights, trains, … → 409 with why. */
async function assertHotelFits(tripId: string, booking: Booking) {
  if (booking.kind !== 'hotel') return;
  const others = (await adminDb().collection(paths.bookings(tripId)).get()).docs.flatMap((d) => {
    const r = Booking.safeParse(d.data());
    return r.success && r.data.id !== booking.id ? [r.data] : [];
  });
  const problem = hotelJourneyProblem({ ...booking, location: booking.to.location }, others);
  if (problem) throw new HttpError(409, problem);
}

/** Saves a new booking (already validated) with its timeline anchors. Returns its id. */
export async function addBooking(
  tripId: string,
  draft: BookingDraft,
  actor: { uid: string; displayName: string },
  extra: { source: Booking['source']; fileRef?: string; parseConfidence?: number; stayId?: string },
): Promise<string> {
  const now = Date.now();
  const id = adminDb().collection(paths.bookings(tripId)).doc().id;
  const booking: Booking = {
    ...draft,
    ...(await withTimezones(draft)),
    id,
    source: extra.source,
    ...(extra.stayId ? { stayId: extra.stayId } : {}),
    ...(extra.fileRef ? { fileRef: extra.fileRef } : {}),
    ...(extra.parseConfidence !== undefined ? { parseConfidence: extra.parseConfidence } : {}),
    createdBy: actor.uid,
    createdAt: now,
    updatedAt: now,
  };
  await assertHotelFits(tripId, booking);
  await saveBooking(tripId, booking, actor.uid, `${actor.displayName} added a ${describe(booking)}`);
  return id;
}

/** Replaces a booking's details (new times → new timezones and timeline anchors). */
export async function updateBooking(tripId: string, current: Booking, draft: BookingDraft, actor: { uid: string; displayName: string }) {
  const booking: Booking = { ...current, ...draft, ...(await withTimezones(draft)), updatedAt: Date.now() };
  await assertHotelFits(tripId, booking);
  await saveBooking(tripId, booking, actor.uid, `${actor.displayName} updated the ${describe(booking)}`);
  return booking;
}

/** New local times for a booking (a delay): timezones and timeline anchors follow. */
export async function rescheduleBooking(tripId: string, booking: Booking, startLocal: string, endLocal: string, actor: { uid: string; displayName: string }, activity: string) {
  const draft = { ...booking, startLocal, endLocal } as BookingDraft;
  const next: Booking = { ...booking, startLocal, endLocal, ...(await withTimezones(draft)), updatedAt: Date.now() };
  await saveBooking(tripId, next, actor.uid, `${actor.displayName} ${activity}`);
  return next;
}

/** Removes a booking and its timeline anchors (a cancellation). */
export async function removeBooking(tripId: string, booking: Booking, actor: { uid: string; displayName: string }, activity: string) {
  const db = adminDb();
  const anchors = await db.collection(paths.schedule(tripId)).where('ref.bookingId', '==', booking.id).get();
  const batch = db.batch();
  batch.delete(db.doc(`${paths.bookings(tripId)}/${booking.id}`));
  anchors.docs.forEach((d) => batch.delete(d.ref));
  // A stay's "booked" link goes with it (the hotel stays picked).
  if (booking.stayId) {
    const stay = db.doc(paths.stay(tripId, booking.stayId));
    if ((await stay.get()).get('bookingId') === booking.id) batch.update(stay, { bookingId: FieldValue.delete(), updatedAt: Date.now() });
  }
  logActivity(batch, tripId, actor.uid, `${actor.displayName} ${activity}`);
  await batch.commit();
}

export const describeBooking = (b: Pick<Booking, 'kind' | 'carrier' | 'number' | 'from' | 'to'>) => describe(b);

function describe(b: Pick<Booking, 'kind' | 'carrier' | 'number' | 'from' | 'to'>) {
  if (b.kind === 'hotel') return `hotel stay at ${b.to.name}`;
  const code = [b.carrier, b.number].filter(Boolean).join(' ');
  return `${b.kind}${code ? ` ${code}` : ''} ${b.from ? `${b.from.name} → ` : 'to '}${b.to.name}`;
}

export async function loadBooking(tripId: string, id: string): Promise<Booking> {
  const snap = await adminDb().doc(`${paths.bookings(tripId)}/${id}`).get();
  if (!snap.exists) throw new HttpError(404, 'Booking not found');
  return Booking.parse(snap.data());
}

const SaveBody = z.object({
  draft: BookingDraft,
  source: z.enum(['upload', 'text', 'manual']).default('manual'),
  fileRef: z.string().max(300).optional(),
  parseConfidence: z.number().min(0).max(1).optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

export const bookingRoutes: RouteTable = {
  /** AI-read an uploaded ticket (storagePath) or pasted text → editable drafts. Nothing is saved. */
  'POST bookings/parse': withTrip(
    async (req, { tripId, user }) => {
      const body = await readJson(
        req,
        z.union([z.object({ storagePath: z.string().max(300) }), z.object({ text: z.string().min(20).max(20_000) })]),
      );

      await useDailyQuota(user.uid, 'bookingParse');
      let parts: Part[];
      if ('storagePath' in body) {
        const prefix = `trips/${tripId}/users/${user.uid}/`;
        if (!body.storagePath.startsWith(prefix) || body.storagePath.includes('..')) {
          throw new HttpError(403, 'You can only parse your own uploads for this trip');
        }
        const file = adminBucket().file(body.storagePath);
        const [meta] = await file.getMetadata().catch(() => {
          throw new HttpError(404, 'Upload not found — please upload it again');
        });
        const type = String(meta.contentType ?? '');
        if (!PARSEABLE.test(type)) throw new HttpError(415, 'Upload a PDF or a photo (JPG, PNG, HEIC)');
        if (Number(meta.size) > MAX_FILE_BYTES) throw new HttpError(413, 'File is larger than 10 MB');
        const [buf] = await file.download();
        parts = [{ inlineData: { mimeType: type, data: buf.toString('base64') } }, { text: 'Extract the bookings from this document.' }];
      } else {
        parts = [{ text: `Extract the bookings from this confirmation text:\n\n${body.text}` }];
      }

      const [extracted, members] = await Promise.all([
        extractJson({ system: SYSTEM, parts, responseSchema, validate: Extracted }),
        loadMembers(tripId),
      ]);
      const drafts = await Promise.all(extracted.bookings.map((e) => toDraft(e, members, user.uid)));
      return json({ confidence: extracted.confidence, drafts });
    },
    { perMinute: 6 },
  ),

  /** Save a confirmed booking (any member) → booking + locked timeline anchors. */
  'POST bookings/create': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, SaveBody);
      const members = await loadMembers(tripId);
      assertTravellers(body.draft, members);
      if (body.fileRef && !body.fileRef.startsWith(`trips/${tripId}/users/${member.uid}/`)) {
        throw new HttpError(403, 'Invalid file reference');
      }

      const id = await addBooking(tripId, body.draft, member, body);
      return json({ id }, { status: 201 });
    },
    { perMinute: 30 },
  ),

  /** Edit a booking (its creator or the admin). */
  'POST bookings/update': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ id: Id, draft: BookingDraft }));
      const current = await loadBooking(tripId, body.id);
      if (current.createdBy !== member.uid && member.role !== 'admin') {
        throw new HttpError(403, 'Only the person who added this booking, or the admin, can edit it');
      }
      assertTravellers(body.draft, await loadMembers(tripId));
      await updateBooking(tripId, current, body.draft, member);
      return json({ ok: true });
    },
    { perMinute: 30 },
  ),

  /** Delete a booking and its timeline anchors (its creator or the admin). */
  'POST bookings/delete': withTrip(
    async (req, { tripId, member }) => {
      const { id } = await readJson(req, z.object({ id: Id }));
      const current = await loadBooking(tripId, id);
      if (current.createdBy !== member.uid && member.role !== 'admin') {
        throw new HttpError(403, 'Only the person who added this booking, or the admin, can delete it');
      }
      await removeBooking(tripId, current, member, `removed the ${describe(current)}`);
      return json({ ok: true });
    },
    { perMinute: 30 },
  ),
};
