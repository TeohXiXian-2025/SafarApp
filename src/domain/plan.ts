// Bookings, split tracks and the scheduled timeline.
import { z } from 'zod';
import { GeoPoint, Id, IsoDateTime, LocalDate, LocalTime, Millis, PlaceRef, PrayerName } from './common.js';

// ─── Bookings (flights, trains, hotels) → locked timeline anchors ───────────

export const BookingKind = z.enum(['flight', 'train', 'bus', 'ferry', 'hotel']);
export type BookingKind = z.infer<typeof BookingKind>;

/** Wall-clock date+time at a place, as printed on a ticket: "2026-12-01T08:15". */
export const LocalDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/);

/** A place on a booking, with the timezone the server looked up for it. */
export const BookingPlace = PlaceRef.extend({ timezone: z.string().max(64) });
export type BookingPlace = z.infer<typeof BookingPlace>;

/**
 * What the client edits/sends: local times + places without timezones.
 * Transport: from → to, start = departure, end = arrival.
 * Hotel: `to` is the hotel, start = check-in, end = check-out.
 */
export const BookingDraft = z.object({
  kind: BookingKind,
  carrier: z.string().max(100).optional(), // airline / operator / hotel name
  number: z.string().max(30).optional(), // flight/train number
  pnr: z.string().max(20).optional(), // booking reference
  from: PlaceRef.optional(),
  to: PlaceRef,
  startLocal: LocalDateTime,
  endLocal: LocalDateTime,
  passengerNames: z.array(z.string().max(100)).max(20).default([]),
  travellerUids: z.array(Id).min(1).max(50),
  notes: z.string().max(500).optional(),
});
export type BookingDraft = z.infer<typeof BookingDraft>;

export const Booking = BookingDraft.omit({ from: true, to: true }).extend({
  id: Id,
  from: BookingPlace.optional(),
  to: BookingPlace,
  /** Absolute instants (with the local UTC offset), e.g. "2026-12-01T08:15:00+08:00". */
  startAt: IsoDateTime,
  endAt: IsoDateTime,
  source: z.enum(['upload', 'text', 'manual']),
  fileRef: z.string().max(300).optional(),
  parseConfidence: z.number().min(0).max(1).optional(),
  createdBy: Id,
  createdAt: Millis,
  updatedAt: Millis,
});
export type Booking = z.infer<typeof Booking>;

// ─── Split tracks ───────────────────────────────────────────────────────────

export const SplitTrack = z.object({
  ideaId: Id,
  memberUids: z.array(Id).min(1),
});

export const Split = z.object({
  id: Id,
  /** The idea that received mixed votes (or clashes with someone's halal needs). */
  sourceIdeaId: Id,
  /** Its status before the split, restored if the split is rejected. */
  sourceStatus: z.enum(['voting', 'backlog', 'mixed']).default('mixed'),
  reason: z.enum(['mixed_votes', 'halal_conflict']),
  trackA: SplitTrack, // original idea
  trackB: SplitTrack, // nearby alternative (created as an idea with source "split")
  /** Everyone meets back at the original place this long after the pair starts. */
  reunion: z.object({ place: PlaceRef, afterMinutes: z.number().int().positive() }),
  /** Walk between the two places, one way. */
  walkMin: z.number().int().nonnegative().default(0),
  explanation: z.string().max(1000),
  status: z.enum(['proposed', 'approved', 'rejected']),
  createdBy: Id.optional(),
  decidedBy: Id.optional(),
  createdAt: Millis,
});
export type Split = z.infer<typeof Split>;

// ─── Scheduled timeline ─────────────────────────────────────────────────────

export const TransitLeg = z.object({
  mode: z.enum(['walk', 'transit', 'drive']),
  minutes: z.number().int().nonnegative(),
  meters: z.number().int().nonnegative(),
  /** The item this leg starts from — recomputed only when that changes (or after 30 days). */
  fromId: Id.optional(),
  at: Millis.optional(),
});
export type TransitLeg = z.infer<typeof TransitLeg>;

export const PrayerPairing = z.object({
  prayer: PrayerName,
  at: LocalTime,
  /** Where to pray; absent when no mosque / prayer room was found nearby. */
  facility: z
    .object({
    name: z.string().max(200),
    location: GeoPoint,
    placeId: z.string().max(256).optional(),
    osmId: z.string().max(64).optional(),
    type: z.enum(['mosque', 'musalla', 'prayer_room', 'other']),
    walkMin: z.number().int().nonnegative(),
  })
    .optional(),
  /** Suggested activity for non-praying members during the prayer break. */
  fillerIdeaId: Id.optional(),
  fillerPlace: PlaceRef.optional(),
});
export type PrayerPairing = z.infer<typeof PrayerPairing>;

export const ScheduleItem = z.object({
  id: Id,
  day: LocalDate,
  start: LocalTime,
  end: LocalTime,
  ref: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('idea'), ideaId: Id }),
    z.object({
      kind: z.literal('booking'),
      bookingId: Id,
      /** span = whole same-day journey; otherwise a single moment of it. */
      event: z.enum(['span', 'depart', 'arrive', 'checkin', 'checkout']),
    }),
    z.object({ kind: z.literal('custom'), title: z.string().max(200), place: PlaceRef.optional() }),
  ]),
  /** "all", or "{splitId}:A" / "{splitId}:B" for split tracks. */
  track: z.string().max(140).default('all'),
  memberUids: z.array(Id).max(50),
  transitFromPrev: TransitLeg.optional(),
  prayer: PrayerPairing.optional(),
  locked: z.boolean().default(false),
  orderIndex: z.number().int().nonnegative(),
  updatedBy: Id,
  updatedAt: Millis,
});
export type ScheduleItem = z.infer<typeof ScheduleItem>;

// ─── Booking → locked timeline anchors ──────────────────────────────────────

export type BookingAnchor = Pick<ScheduleItem, 'day' | 'start' | 'end'> & {
  event: 'span' | 'depart' | 'arrive' | 'checkin' | 'checkout';
};

/**
 * Where a booking pins the timeline. Times are each place's local wall clock,
 * exactly as printed on the ticket.
 * - Transport on one local day (arrival after departure): one "span" block.
 * - Overnight / timezone-crossing journeys: separate depart + arrive moments.
 * - Hotels: check-in and check-out moments.
 */
export function bookingAnchors(b: Pick<BookingDraft, 'kind' | 'startLocal' | 'endLocal'>): BookingAnchor[] {
  const [sDay, sTime] = b.startLocal.split('T');
  const [eDay, eTime] = b.endLocal.split('T');
  if (b.kind === 'hotel') {
    return [
      { event: 'checkin', day: sDay, start: sTime, end: sTime },
      { event: 'checkout', day: eDay, start: eTime, end: eTime },
    ];
  }
  if (sDay === eDay && eTime > sTime) return [{ event: 'span', day: sDay, start: sTime, end: eTime }];
  return [
    { event: 'depart', day: sDay, start: sTime, end: sTime },
    { event: 'arrive', day: eDay, start: eTime, end: eTime },
  ];
}

// ─── AI Arrange jobs ────────────────────────────────────────────────────────

const PrayerKeyZ = z.enum(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);

/** A proposed plan: previewed first, applied by the admin, undoable. Path: trips/{id}/jobs/{jobId} */
export const ArrangeJob = z.object({
  id: Id,
  kind: z.literal('arrange'),
  status: z.enum(['preview', 'applied', 'undone', 'discarded']),
  plan: z.object({
    days: z.array(
      z.object({
        day: LocalDate,
        note: z.string().max(300).optional(),
        travelMin: z.number().int().nonnegative(),
        stops: z.array(z.object({ ideaId: Id, start: LocalTime, end: LocalTime })),
        prayers: z.array(z.object({ key: PrayerKeyZ, start: LocalTime, end: LocalTime })),
      }),
    ),
    unplaced: z.array(z.object({ ideaId: Id, reason: z.enum(['closed', 'hours', 'time']) })),
  }),
  /** The timeline's movable stops before applying — restored by Undo. */
  before: z.array(ScheduleItem).optional(),
  createdBy: Id,
  at: Millis,
  appliedAt: Millis.optional(),
});
export type ArrangeJob = z.infer<typeof ArrangeJob>;
