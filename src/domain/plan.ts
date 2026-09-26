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
  /** Hotel bookings made from a stay's hotel list ("I booked it"). */
  stayId: Id.optional(),
  fileRef: z.string().max(300).optional(),
  parseConfidence: z.number().min(0).max(1).optional(),
  createdBy: Id,
  createdAt: Millis,
  updatedAt: Millis,
});
export type Booking = z.infer<typeof Booking>;

// ─── Split tracks ───────────────────────────────────────────────────────────

/**
 * One group of a split. A = the original place (everyone not stepping out),
 * B / C = a nearby alternative (its own idea), F = free time nearby (no place).
 */
export const SplitTrackKey = z.enum(['A', 'B', 'C', 'F']);
export type SplitTrackKey = z.infer<typeof SplitTrackKey>;
export const SplitTrack = z.object({
  key: SplitTrackKey,
  ideaId: Id.optional(),
  memberUids: z.array(Id).max(50),
  label: z.string().max(200),
  /** One way from the original place. */
  walkMin: z.number().int().nonnegative().default(0),
  /** Time spent there. */
  durationMin: z.number().int().nonnegative().default(0),
});
export type SplitTrack = z.infer<typeof SplitTrack>;

/** Old two-way splits (trackA / trackB) read as tracks. */
function legacySplit(raw: unknown) {
  const r = raw as Record<string, any> | null;
  if (!r || r.tracks || !r.trackA) return raw;
  return {
    ...r,
    tracks: [
      { key: 'A', ideaId: r.trackA.ideaId, memberUids: r.trackA.memberUids, label: r.reunion?.place?.name ?? 'Original' },
      { key: 'B', ideaId: r.trackB.ideaId, memberUids: r.trackB.memberUids, label: 'Alternative', walkMin: r.walkMin ?? 0 },
    ],
  };
}

export const Split = z.preprocess(
  legacySplit,
  z.object({
    id: Id,
    /** The idea the group split over. */
    sourceIdeaId: Id,
    reason: z.enum(['mixed_votes', 'halal_conflict', 'opt_out']),
    tracks: z.array(SplitTrack).min(1).max(4),
    /** Everyone meets back at the original place this long after the split starts. */
    reunion: z.object({ place: PlaceRef, afterMinutes: z.number().int().positive() }),
    explanation: z.string().max(1000),
    /** proposed is legacy; splits are created approved (the admin accepted the idea with its groups). */
    status: z.enum(['proposed', 'approved', 'rejected']),
    createdBy: Id.optional(),
    decidedBy: Id.optional(),
    createdAt: Millis,
    updatedAt: Millis.optional(),
  }),
);
export type Split = z.infer<typeof Split>;

// ─── Scheduled timeline ─────────────────────────────────────────────────────

export const TransitLeg = z.object({
  mode: z.enum(['walk', 'transit', 'drive']),
  minutes: z.number().int().nonnegative(),
  meters: z.number().int().nonnegative(),
  /**
   * Who measured it: Google Routes (absent = Google, older legs), or
   * openrouteservice when Google was out (walking exact; a longer trip is its
   * road time turned into a public-transport estimate).
   */
  source: z.enum(['google', 'ors']).optional(),
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
    /** Found by a backup source when Google was out ("OpenStreetMap") — credited on the card. */
    via: z.string().max(40).optional(),
    /** The nearest one, but further than a walk (walkMin = the trip there): pray at a quiet spot, or go. */
    far: z.boolean().optional(),
  })
    .optional(),
  /**
   * Why the place is where it is: at the visit the prayer falls in, near the
   * stop before / after it, near the hotel or station (a day with no stops
   * around it), or a member chose it. `basisName` = that stop / hotel.
   */
  basis: z.enum(['inside', 'before', 'after', 'hotel', 'station', 'area', 'chosen']).optional(),
  basisName: z.string().max(200).optional(),
  /** A place a member picked (the time stays locked); kept while the plan stays around there. */
  chosen: z.object({ name: z.string().max(200), location: GeoPoint, placeId: z.string().max(256).optional(), by: Id, at: Millis }).optional(),
  /** Suggested activity for non-praying members during the prayer break. */
  fillerIdeaId: Id.optional(),
  fillerPlace: PlaceRef.optional(),
  /**
   * What each member who isn't praying chose to do during the break (their
   * own short side-track; everyone meets back at the prayer place after).
   */
  fillerPicks: z
    .record(
      z.string(),
      z.object({
        kind: z.enum(['idea', 'place', 'rest']),
        title: z.string().max(200),
        ideaId: Id.optional(),
        place: PlaceRef.optional(),
        /**
         * Where this group meets the others again: the prayer place (close by), the next
         * stop (nearer to it), or a point in between; `at` = when.
         */
        meet: z.object({ kind: z.enum(['prayer', 'next', 'middle']), name: z.string().max(200), location: GeoPoint, at: LocalTime }).optional(),
        at: Millis,
      }),
    )
    .default({}),
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
    z.object({
      kind: z.literal('custom'),
      title: z.string().max(200),
      place: PlaceRef.optional(),
      /** A lunch / dinner stop at a restaurant (not an Idea Board idea). */
      meal: z.enum(['lunch', 'dinner']).optional(),
      phone: z.string().max(40).optional(),
    }),
  ]),
  /** "all", or "{splitId}:A" / "{splitId}:B" for split tracks. */
  track: z.string().max(140).default('all'),
  memberUids: z.array(Id).max(50),
  transitFromPrev: TransitLeg.optional(),
  prayer: PrayerPairing.optional(),
  /** Its start was set by hand (📌): it keeps it instead of following the stop before. */
  pinned: z.boolean().optional(),
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
export function bookingAnchors(b: Pick<BookingDraft, 'kind' | 'startLocal' | 'endLocal'> & { startAt?: string; endAt?: string }): BookingAnchor[] {
  const [sDay, sTime] = b.startLocal.split('T');
  const [eDay, eTime] = b.endLocal.split('T');
  if (b.kind === 'hotel') {
    return [
      { event: 'checkin', day: sDay, start: sTime, end: sTime },
      { event: 'checkout', day: eDay, start: eTime, end: eTime },
    ];
  }
  // One block only when both ends read the same clock: a KL 08:00 → Bangkok
  // 09:05 flight is two moments (KL time, then Bangkok time), not 08:00–09:05.
  if (sDay === eDay && eTime > sTime && sameZone(b)) return [{ event: 'span', day: sDay, start: sTime, end: eTime }];
  return [
    { event: 'depart', day: sDay, start: sTime, end: sTime },
    { event: 'arrive', day: eDay, start: eTime, end: eTime },
  ];
}

/** Both ends of a journey use the same UTC offset (unknown → assume yes). */
export const sameZone = (b: { startAt?: string; endAt?: string }) => !b.startAt || !b.endAt || b.startAt.slice(19) === b.endAt.slice(19);

/** How long before departure to be at the airport / station. */
export const leaveBeforeMin = (kind: BookingKind) => (kind === 'flight' ? 150 : 45);

// ─── AI Arrange jobs ────────────────────────────────────────────────────────

const PrayerKeyZ = z.enum(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);

/** A proposed plan: previewed first, applied by the admin, undoable. Path: trips/{id}/jobs/{jobId} */
export const ArrangeJob = z.object({
  id: Id,
  kind: z.literal('arrange'),
  status: z.enum(['preview', 'applied', 'undone', 'discarded']),
  /** Just this day (the rest of the trip stays as it is); absent = the whole trip. */
  day: LocalDate.optional(),
  plan: z.object({
    days: z.array(
      z.object({
        day: LocalDate,
        note: z.string().max(300).optional(),
        travelMin: z.number().int().nonnegative(),
        stops: z.array(z.object({ ideaId: Id, start: LocalTime, end: LocalTime })),
        prayers: z.array(z.object({ key: PrayerKeyZ, start: LocalTime, end: LocalTime })),
        /** Lunch / dinner slots the plan added (the day had no food stop then), with the restaurant picked. */
        meals: z
          .array(
            z.object({
              key: z.enum(['lunch', 'dinner']),
              start: LocalTime,
              end: LocalTime,
              place: PlaceRef.optional(),
              phone: z.string().max(40).optional(),
              /** "Listed as halal · Google Maps" etc. */
              halal: z.string().max(120).optional(),
            }),
          )
          .default([]),
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
