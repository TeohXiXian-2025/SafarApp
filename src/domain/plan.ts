// Bookings, split tracks and the scheduled timeline.
import { z } from 'zod';
import { GeoPoint, Id, IsoDateTime, LocalDate, LocalTime, Millis, PlaceRef, PrayerName } from './common.js';

// ─── Bookings (flights, trains, hotels) → locked timeline anchors ───────────

export const Booking = z.object({
  id: Id,
  kind: z.enum(['flight', 'train', 'bus', 'ferry', 'hotel']),
  carrier: z.string().max(100).optional(), // airline / rail operator / hotel name
  number: z.string().max(30).optional(), // flight/train number
  pnr: z.string().max(20).optional(),
  from: PlaceRef.optional(), // departure station/airport (transport)
  to: PlaceRef.optional(), // arrival station/airport, or the hotel itself
  departAt: IsoDateTime.optional(), // or hotel check-in
  arriveAt: IsoDateTime.optional(), // or hotel check-out
  travellerUids: z.array(Id).max(50),
  fileRef: z.string().max(300).optional(),
  parseConfidence: z.number().min(0).max(1).optional(),
  confirmedBy: Id.optional(), // unset until a human confirms the AI parse
  createdBy: Id,
  createdAt: Millis,
});
export type Booking = z.infer<typeof Booking>;

// ─── Split tracks ───────────────────────────────────────────────────────────

export const SplitTrack = z.object({
  ideaId: Id,
  memberUids: z.array(Id).min(1),
});

export const Split = z.object({
  id: Id,
  /** The idea that received mixed votes. */
  sourceIdeaId: Id,
  reason: z.enum(['mixed_votes', 'halal_conflict']),
  trackA: SplitTrack, // original idea
  trackB: SplitTrack, // AI-proposed alternative (created as an idea with source "split")
  reunion: z.object({ place: PlaceRef, afterMinutes: z.number().int().positive() }),
  explanation: z.string().max(1000),
  status: z.enum(['proposed', 'approved', 'rejected']),
  decidedBy: Id.optional(),
  createdAt: Millis,
});
export type Split = z.infer<typeof Split>;

// ─── Scheduled timeline ─────────────────────────────────────────────────────

export const TransitLeg = z.object({
  mode: z.enum(['walk', 'transit', 'drive']),
  minutes: z.number().int().nonnegative(),
  meters: z.number().int().nonnegative(),
});

export const PrayerPairing = z.object({
  prayer: PrayerName,
  at: LocalTime,
  facility: z.object({
    name: z.string().max(200),
    location: GeoPoint,
    placeId: z.string().max(256).optional(),
    osmId: z.string().max(64).optional(),
    type: z.enum(['mosque', 'musalla', 'prayer_room', 'other']),
    walkMin: z.number().int().nonnegative(),
  }),
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
    z.object({ kind: z.literal('booking'), bookingId: Id }),
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
