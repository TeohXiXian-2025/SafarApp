// Hotels, per stay (one per city block of nights):
//   stays/plan     propose stays from the timeline, bookings and destinations (once, or admin re-plan)
//   stays/add|update|delete   admin edits the stays
//   stays/search   find & score hotels near the stay's plans (Google Hotels, live prices)
//   stays/offers   per-site prices + booking links for one hotel
//   stays/vote     👍 / 👎 a hotel;  stays/choose  the admin picks one
//   stays/booked   "I booked it" → a hotel booking (check-in/out on the timeline)
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  avgTravelMin,
  formatMoney,
  freeBreakfast,
  groupHotelBudget,
  HotelOption,
  HotelVote,
  Id,
  LocalDate,
  metersBetween,
  paths,
  proposeStays,
  scoreHotel,
  ScheduleItem,
  Stay,
  toMinor,
  type BookingDraft,
  type GeoPoint,
} from '../../src/domain/index.js';
import { withTrip } from '../_lib/auth.js';
import { adminDb } from '../_lib/firebaseAdmin.js';
import { hotelOffers, muslimNearby, offersFresh, searchHotels, serpUsage } from '../_lib/hotels.js';
import { HttpError, json, readJson } from '../_lib/http.js';
import { notify } from '../_lib/push.js';
import { useDailyQuota } from '../_lib/quota.js';
import type { RouteTable } from '../_lib/routes.js';
import { loadTripData, type TripData } from '../_lib/schedule.js';
import { loadTrip, logActivity } from '../_lib/trip.js';
import { addBooking } from './bookings.js';
import { Type } from '@google/genai';
import { extractJson } from '../_lib/gemini.js';

/** Hotels checked for a mosque / halal food nearby (Google Places calls). */
const MUSLIM_CHECK_TOP = 8;

const stayRef = (tripId: string, id: string) => adminDb().doc(paths.stay(tripId, id));
const hotelRef = (tripId: string, stayId: string, key: string) => adminDb().doc(`${paths.hotels(tripId, stayId)}/${key}`);

async function loadStay(tripId: string, id: string): Promise<Stay> {
  const snap = await stayRef(tripId, id).get();
  if (!snap.exists) throw new HttpError(404, 'Stay not found');
  return Stay.parse(snap.data());
}

async function loadHotel(tripId: string, stayId: string, key: string): Promise<HotelOption> {
  const snap = await hotelRef(tripId, stayId, key).get();
  if (!snap.exists) throw new HttpError(404, 'Hotel not found — search again');
  return HotelOption.parse(snap.data());
}

/** Scheduled stops with where they are (for proposals and travel times). */
async function stopsOf(tripId: string, data: TripData) {
  const items = (await adminDb().collection(paths.schedule(tripId)).get()).docs.map((d) => ScheduleItem.safeParse(d.data())).flatMap((r) => (r.success ? [r.data] : []));
  return items.flatMap((it) => {
    if (it.ref.kind !== 'idea') return [];
    const idea = data.ideas.get(it.ref.ideaId);
    return idea ? [{ day: it.day, start: it.start, name: idea.place.name, location: idea.place.location }] : [];
  });
}

function proposalsFor(data: TripData, stops: Awaited<ReturnType<typeof stopsOf>>) {
  return proposeStays({
    startDate: data.trip.startDate,
    endDate: data.trip.endDate,
    destinations: data.trip.destinations,
    bookings: [...data.bookings.values()],
    stops,
    backlog: [...data.ideas.values()].filter((i) => ['backlog', 'voting', 'mixed', 'split_pending'].includes(i.status)).map((i) => ({ name: i.place.name, location: i.place.location })),
  });
}

const datesOk = (s: { checkIn: string; checkOut: string }, trip: { startDate: string; endDate: string }) => {
  if (s.checkOut <= s.checkIn) throw new HttpError(400, 'Check-out must be after check-in');
  if (s.checkIn < trip.startDate || s.checkOut > trip.endDate) throw new HttpError(400, 'The stay must be within the trip dates');
};

// Parses "3:00 PM" / "15:00" → "15:00".
function clock(s: string | undefined, fallback: string): string {
  const m = s?.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return fallback;
  let h = Number(m[1]) % 24;
  if (m[3]?.toLowerCase() === 'pm' && h < 12) h += 12;
  if (m[3]?.toLowerCase() === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
}

const NOTE_TOP = 5;

/** One friendly sentence per top hotel on why it suits this group — only from the facts we computed (skipped if the AI is busy). */
async function whyItFits(
  top: { base: { key: string; name: string; nightlyMinor?: number; travelMin: number; rating?: number; mosqueM?: number; halalNearby?: number; amenities: string[]; transit?: { name: string; walkMin: number } }; score: number; why: string[] }[],
  g: { budget: { min: number; max: number } | null; stops: string[]; muslim: boolean; priorities: string[]; money: (m: number) => string },
): Promise<Map<string, string>> {
  if (!top.length) return new Map();
  const facts = top.map((t) => ({
    key: t.base.key,
    name: t.base.name,
    pricePerNight: t.base.nightlyMinor !== undefined ? g.money(t.base.nightlyMinor) : null,
    minutesToStops: t.base.travelMin,
    rating: t.base.rating ?? null,
    nearestMosqueMeters: t.base.mosqueM ?? null,
    halalPlacesWithin800m: t.base.halalNearby ?? null,
    station: t.base.transit ?? null,
    freeBreakfast: freeBreakfast(t.base.amenities),
    reasons: t.why,
  }));
  try {
    const out = await extractJson({
      system:
        'You help a travel group choose a hotel. For each hotel write ONE short sentence (max 22 words) on why it suits THIS group, using only the given facts (budget, the stops they plan, halal food / prayer needs, their priorities). Mention a trade-off if there is one. Never invent facts.',
      parts: [{ text: JSON.stringify({ group: { budgetPerRoomNight: g.budget, plannedStops: g.stops.slice(0, 8), needsHalalOrPrayer: g.muslim, priorities: [...new Set(g.priorities)] }, hotels: facts }) }],
      responseSchema: { type: Type.OBJECT, properties: { notes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { key: { type: Type.STRING }, note: { type: Type.STRING } }, required: ['key', 'note'] } } }, required: ['notes'] },
      validate: z.object({ notes: z.array(z.object({ key: z.string(), note: z.string() })) }),
      budgetMs: 10_000,
    });
    return new Map(out.notes.filter((n) => top.some((t) => t.base.key === n.key)).map((n) => [n.key, n.note.slice(0, 300)]));
  } catch {
    return new Map();
  }
}

export const stayRoutes: RouteTable = {
  /** First visit: save the proposed stays. `replan` (admin) redoes stays nobody has picked a hotel for. */
  'POST stays/plan': withTrip(
    async (req, { tripId, member }) => {
      const { replan } = await readJson(req, z.object({ replan: z.boolean().default(false) }));
      if (replan && member.role !== 'admin') throw new HttpError(403, 'Only the admin can re-plan stays');
      const db = adminDb();
      const existing = await db.collection(paths.stays(tripId)).get();
      if (existing.size && !replan) return json({ created: 0 });
      const data = await loadTripData(tripId);
      const proposals = proposalsFor(data, await stopsOf(tripId, data));
      const kept = existing.docs.map((d) => Stay.parse(d.data())).filter((s) => s.chosenKey);
      const batch = db.batch();
      for (const d of existing.docs) if (!d.get('chosenKey')) batch.delete(d.ref); // (their hotel lists stay orphaned but unread)
      const now = Date.now();
      let created = 0;
      for (const p of proposals) {
        // Keep stays with a chosen hotel; don't overlap them.
        if (kept.some((k) => p.checkIn < k.checkOut && k.checkIn < p.checkOut)) continue;
        const ref = db.collection(paths.stays(tripId)).doc();
        batch.set(ref, Stay.parse({ id: ref.id, ...p, city: data.trip.destinations[p.destIdx].name, perRoom: 2, createdBy: member.uid, createdAt: now, updatedAt: now }));
        created++;
      }
      await batch.commit();
      return json({ created });
    },
    { perMinute: 10 },
  ),

  'POST stays/add': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ destIdx: z.number().int().min(0).max(19), checkIn: LocalDate, checkOut: LocalDate }));
      const trip = await loadTrip(tripId);
      const dest = trip.destinations[body.destIdx];
      if (!dest) throw new HttpError(400, 'Unknown destination');
      datesOk(body, trip);
      const ref = adminDb().collection(paths.stays(tripId)).doc();
      const now = Date.now();
      await ref.set(Stay.parse({ id: ref.id, ...body, city: dest.name, center: dest.location, perRoom: 2, createdBy: member.uid, createdAt: now, updatedAt: now }));
      return json({ id: ref.id }, { status: 201 });
    },
    { admin: true, perMinute: 20 },
  ),

  'POST stays/update': withTrip(
    async (req, { tripId }) => {
      const body = await readJson(req, z.object({ id: Id, checkIn: LocalDate, checkOut: LocalDate, perRoom: z.number().int().min(1).max(8) }));
      const [stay, trip] = await Promise.all([loadStay(tripId, body.id), loadTrip(tripId)]);
      datesOk(body, trip);
      const changed = stay.checkIn !== body.checkIn || stay.checkOut !== body.checkOut || stay.perRoom !== body.perRoom;
      // Prices were for the old dates / room size: search again.
      const next: Stay = { ...stay, ...body, updatedAt: Date.now() };
      if (changed) delete next.search;
      await stayRef(tripId, body.id).set(Stay.parse(next));
      return json({ ok: true, research: changed && !!stay.search });
    },
    { admin: true, perMinute: 20 },
  ),

  'POST stays/delete': withTrip(
    async (req, { tripId }) => {
      const { id } = await readJson(req, z.object({ id: Id }));
      await adminDb().recursiveDelete(stayRef(tripId, id));
      return json({ ok: true });
    },
    { admin: true, perMinute: 20 },
  ),

  /** Find and score hotels for a stay. Voted hotels are kept; the rest are replaced. */
  'POST stays/search': withTrip(
    async (req, { tripId, member }) => {
      const { id, refresh } = await readJson(req, z.object({ id: Id, refresh: z.boolean().default(false) }));
      await useDailyQuota(member.uid, 'hotels');
      const [stay, data] = await Promise.all([loadStay(tripId, id), loadTripData(tripId)]);
      const { trip, members } = data;
      const stops = (await stopsOf(tripId, data)).filter((s) => s.day >= stay.checkIn && s.day <= stay.checkOut && metersBetween(s.location, stay.center) < 40_000);
      const targets: GeoPoint[] = stops.length ? stops.map((s) => s.location) : [stay.center];

      const found = await searchHotels(
        { near: `${stay.nearName ? `${stay.nearName}, ` : ''}${stay.city}`, center: stay.center, checkIn: stay.checkIn, checkOut: stay.checkOut, adults: stay.perRoom, currency: trip.currency },
        { refresh },
      );
      if (!found) throw new HttpError(502, "Couldn't search hotels right now — try again in a minute.");
      // Only hotels within reach of the plans (Google sometimes adds far-away ones).
      const near = found.hotels.filter((h) => metersBetween(h.location, stay.center) < 25_000);

      const prefs = members.map((m) => m.prefs);
      const budget = groupHotelBudget(prefs);
      const ctx = {
        budget: budget ? { min: toMinor(budget.min, trip.currency), max: toMinor(budget.max, trip.currency) } : null,
        priorities: prefs.map((p) => p?.hotelPriorities ?? []),
        muslim: prefs.some((p) => p?.halalRequired || p?.prayerReminders),
        money: (m: number) => formatMoney(m, trip.currency),
      };
      const muslimWanted = ctx.muslim || ctx.priorities.some((l) => l.includes('prayer_space_nearby') || l.includes('halal_food_nearby'));

      const scored = near.map((h) => {
        const base = {
          ...h,
          ...(h.nightly !== undefined ? { nightlyMinor: toMinor(h.nightly, trip.currency) } : {}),
          ...(h.total !== undefined ? { totalMinor: toMinor(h.total, trip.currency) } : {}),
          travelMin: avgTravelMin(h.location, targets),
        };
        return { base, ...scoreHotel(base, ctx) };
      });
      scored.sort((a, b) => b.score - a.score);
      // Mosque / halal food check for the best few, then score again.
      if (muslimWanted) {
        await Promise.all(
          scored.slice(0, MUSLIM_CHECK_TOP).map(async (s) => {
            Object.assign(s.base, await muslimNearby(s.base.location, metersBetween));
            Object.assign(s, scoreHotel(s.base, ctx));
          }),
        );
        scored.sort((a, b) => b.score - a.score);
      }

      const notes = await whyItFits(scored.slice(0, NOTE_TOP), { budget, stops: stops.map((s) => s.name), muslim: ctx.muslim, priorities: ctx.priorities.flat(), money: ctx.money });

      const db = adminDb();
      const old = await db.collection(paths.hotels(tripId, id)).get();
      const keep = new Map(old.docs.map((d) => HotelOption.safeParse(d.data())).flatMap((r) => (r.success && (Object.keys(r.data.votes).length || r.data.key === stay.chosenKey) ? [[r.data.key, r.data]] : [])));
      const batch = db.batch();
      old.docs.forEach((d) => !keep.has(d.id) && batch.delete(d.ref));
      scored.forEach((s, rank) => {
        const prev = keep.get(s.base.key);
        const { nightly: _n, total: _t, ...fields } = s.base;
        const doc = HotelOption.parse({
          ...fields,
          priceSource: found.source,
          score: s.score,
          why: s.why,
          ...(notes.get(s.base.key) ? { note: notes.get(s.base.key) } : {}),
          rank,
          votes: prev?.votes ?? {},
          ...(prev?.offers ? { offers: prev.offers, offersAt: prev.offersAt } : {}),
        });
        batch.set(hotelRef(tripId, id, doc.key), doc);
      });
      // Voted/chosen hotels no longer in the results keep their old details, ranked last.
      [...keep.values()].filter((k) => !scored.some((s) => s.base.key === k.key)).forEach((k, i) => batch.set(hotelRef(tripId, id, k.key), { ...k, rank: scored.length + i }));
      batch.set(stayRef(tripId, id), { search: { at: Date.now(), source: found.source, count: scored.length }, updatedAt: Date.now() }, { merge: true });
      await batch.commit();
      return json({ count: scored.length, source: found.source, budget, usage: await serpUsage() });
    },
    { perMinute: 6 },
  ),

  /** Booking sites and their prices for one hotel (cached 12 h). */
  'POST stays/offers': withTrip(
    async (req, { tripId }) => {
      const { id, key } = await readJson(req, z.object({ id: Id, key: z.string().max(300) }));
      const [stay, hotel, trip] = await Promise.all([loadStay(tripId, id), loadHotel(tripId, id, key), loadTrip(tripId)]);
      if (offersFresh(hotel.offersAt)) return json({ offers: hotel.offers ?? [] });
      if (!hotel.token) return json({ offers: [] });
      const offers = await hotelOffers(hotel.token, { checkIn: stay.checkIn, checkOut: stay.checkOut, adults: stay.perRoom, currency: trip.currency });
      if (!offers) throw new HttpError(502, "Couldn't load booking sites right now — use the hotel link instead.");
      const saved = offers.map((o) => ({ source: o.source, link: o.link, official: o.official, ...(o.nightly !== undefined ? { nightlyMinor: toMinor(o.nightly, trip.currency) } : {}) }));
      await hotelRef(tripId, id, key).set({ offers: saved, offersAt: Date.now() }, { merge: true });
      return json({ offers: saved });
    },
    { perMinute: 10 },
  ),

  'POST stays/vote': withTrip(
    async (req, { tripId, member }) => {
      const { id, key, vote } = await readJson(req, z.object({ id: Id, key: z.string().max(300), vote: HotelVote.nullable() }));
      await loadHotel(tripId, id, key);
      await hotelRef(tripId, id, key).update({ [`votes.${member.uid}`]: vote ?? FieldValue.delete() });
      return json({ ok: true });
    },
    { perMinute: 60 },
  ),

  /** The admin picks the hotel (or clears the pick with key null). */
  'POST stays/choose': withTrip(
    async (req, { tripId, member }) => {
      const { id, key } = await readJson(req, z.object({ id: Id, key: z.string().max(300).nullable() }));
      const stay = await loadStay(tripId, id);
      const db = adminDb();
      const batch = db.batch();
      if (key) {
        const hotel = await loadHotel(tripId, id, key);
        batch.update(stayRef(tripId, id), { chosenKey: key, updatedAt: Date.now() });
        logActivity(batch, tripId, member.uid, `${member.displayName} picked ${hotel.name} for ${stay.city}`);
        await batch.commit();
        const trip = await loadTrip(tripId);
        await notify(
          trip.memberIds,
          { kind: 'decision', title: `Hotel picked for ${stay.city}`, body: `${hotel.name} — book it and tap “I booked it”.`, url: `/t/${tripId}/bookings?tab=stays`, tag: `stay-${id}` },
          { timeZone: trip.destinations[0].timezone, except: member.uid },
        );
      } else {
          batch.update(stayRef(tripId, id), { chosenKey: FieldValue.delete(), updatedAt: Date.now() });
        await batch.commit();
      }
      return json({ ok: true });
    },
    { admin: true, perMinute: 20 },
  ),

  /** "I booked it": the chosen (or given) hotel becomes a hotel booking for the stay's dates. */
  'POST stays/booked': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ id: Id, key: z.string().max(300).optional(), pnr: z.string().trim().max(20).optional(), travellerUids: z.array(Id).min(1).max(50).optional() }));
      const [stay, trip] = await Promise.all([loadStay(tripId, body.id), loadTrip(tripId)]);
      const key = body.key ?? stay.chosenKey;
      if (!key) throw new HttpError(400, 'Pick a hotel first');
      const hotel = await loadHotel(tripId, body.id, key);
      const dup = await adminDb().collection(paths.bookings(tripId)).where('kind', '==', 'hotel').where('carrier', '==', hotel.name).get();
      if (dup.docs.some((d) => String(d.get('startLocal')).slice(0, 10) === stay.checkIn)) throw new HttpError(409, `${hotel.name} is already booked for these dates`);
      const travellers = body.travellerUids ?? trip.memberIds;
      if (!travellers.every((u) => trip.memberIds.includes(u))) throw new HttpError(400, 'Travellers must be members of this trip');
      const draft: BookingDraft = {
        kind: 'hotel',
        carrier: hotel.name,
        ...(body.pnr ? { pnr: body.pnr } : {}),
        to: { name: hotel.name, location: hotel.location, ...(hotel.address ? { address: hotel.address } : {}) },
        startLocal: `${stay.checkIn}T${clock(hotel.checkInTime, '15:00')}`,
        endLocal: `${stay.checkOut}T${clock(hotel.checkOutTime, '12:00')}`,
        passengerNames: [],
        travellerUids: travellers,
      };
      const bookingId = await addBooking(tripId, draft, member, { source: 'manual' });
      if (stay.chosenKey !== key) await stayRef(tripId, body.id).update({ chosenKey: key, updatedAt: Date.now() });
      return json({ bookingId }, { status: 201 });
    },
    { perMinute: 20 },
  ),
};
