import { z } from 'zod';
import { CurrencyCode, HalalTier, Id, LocalDate, Millis, PlaceRef } from './common.js';

export const MemberRole = z.enum(['admin', 'member']);
export type MemberRole = z.infer<typeof MemberRole>;

export const TravelPace = z.enum(['relaxed', 'moderate', 'fast']);

export const HotelPriority = z.enum([
  'near_transit',
  'family_rooms',
  'prayer_space_nearby',
  'halal_food_nearby',
  'breakfast_included',
  'budget_first',
  'rating_first',
]);

export const MemberPrefs = z.object({
  /** Nightly hotel budget per room, in the trip currency. */
  hotelBudget: z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() }).optional(),
  /** Daily spend per person (food + activities), in the trip currency. */
  dailyBudget: z.number().nonnegative().optional(),
  halalRequired: z.boolean().default(false),
  /** Lowest acceptable halal tier when halalRequired is true. */
  halalTier: HalalTier.default('certified'),
  prayerReminders: z.boolean().default(false),
  pace: TravelPace.default('moderate'),
  interests: z.array(z.string().max(50)).max(20).default([]),
  hotelPriorities: z.array(HotelPriority).max(7).default([]),
});
export type MemberPrefs = z.infer<typeof MemberPrefs>;

export const Member = z.object({
  uid: Id,
  role: MemberRole,
  displayName: z.string().min(1).max(100),
  photoURL: z.string().url().optional(),
  joinedAt: Millis,
  prefs: MemberPrefs.optional(),
});
export type Member = z.infer<typeof Member>;

export const Destination = PlaceRef.extend({
  /** IANA timezone, e.g. "Asia/Tokyo" — needed for prayer times & schedule. */
  timezone: z.string().max(64),
  countryCode: z.string().length(2).optional(),
});
export type Destination = z.infer<typeof Destination>;

export const TripStatus = z.enum(['planning', 'active', 'completed', 'archived']);

export const Trip = z.object({
  id: Id,
  name: z.string().min(1).max(120),
  destinations: z.array(Destination).min(1).max(20),
  startDate: LocalDate,
  endDate: LocalDate,
  currency: CurrencyCode,
  adminId: Id,
  /** Denormalised for security rules and "my trips" queries. */
  memberIds: z.array(Id).max(50),
  status: TripStatus,
  createdAt: Millis,
  updatedAt: Millis,
});
export type Trip = z.infer<typeof Trip>;

/** A destination as the client picks it (Places Autocomplete). The server adds the timezone. */
export const DestinationInput = Destination.omit({ timezone: true });
export type DestinationInput = z.infer<typeof DestinationInput>;

const tripFields = {
  name: Trip.shape.name,
  destinations: z.array(DestinationInput).min(1).max(20),
  startDate: LocalDate,
  endDate: LocalDate,
  currency: CurrencyCode,
};

const datesInOrder = (t: { startDate?: string; endDate?: string }) =>
  !t.startDate || !t.endDate || t.endDate >= t.startDate;

/** Max trip length — keeps schedules and prayer-time lookups bounded. */
export const MAX_TRIP_DAYS = 60;

const withinMaxLength = (t: { startDate?: string; endDate?: string }) =>
  !t.startDate || !t.endDate || (Date.parse(t.endDate) - Date.parse(t.startDate)) / 86_400_000 < MAX_TRIP_DAYS;

/** Input when the admin creates a trip (server fills ids, admin, timezone, timestamps). */
export const CreateTripInput = z
  .object(tripFields)
  .refine(datesInOrder, { message: 'End date must be on or after start date', path: ['endDate'] })
  .refine(withinMaxLength, { message: `Trips can be at most ${MAX_TRIP_DAYS} days`, path: ['endDate'] });
export type CreateTripInput = z.infer<typeof CreateTripInput>;

/** Admin edits to trip details. Any subset of fields. */
export const UpdateTripInput = z
  .object(tripFields)
  .partial()
  .refine(datesInOrder, { message: 'End date must be on or after start date', path: ['endDate'] })
  .refine(withinMaxLength, { message: `Trips can be at most ${MAX_TRIP_DAYS} days`, path: ['endDate'] });
export type UpdateTripInput = z.infer<typeof UpdateTripInput>;

/** users/{uid} — written by the user themselves on first sign-in. */
export const UserProfile = z.object({
  uid: Id,
  displayName: z.string().min(1).max(100),
  email: z.string().email().max(200).optional(),
  photoURL: z.string().url().max(2000).optional(),
  createdAt: Millis,
});
export type UserProfile = z.infer<typeof UserProfile>;

export const Invite = z.object({
  token: Id,
  tripId: Id,
  createdBy: Id,
  createdAt: Millis,
  expiresAt: Millis,
  maxUses: z.number().int().positive().max(100),
  uses: z.number().int().nonnegative(),
});
export type Invite = z.infer<typeof Invite>;
