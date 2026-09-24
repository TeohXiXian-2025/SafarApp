// ============================================================
// Safar domain — shared primitives.
// Used by both the client (src/) and the Vercel functions (api/),
// so keep this folder free of browser- or Node-only imports.
// Relative imports use `.js` so Node ESM can resolve them on Vercel.
// ============================================================
import { z } from 'zod';

/** Firestore document id: short, URL-safe. */
export const Id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

/** Epoch milliseconds. */
export const Millis = z.number().int().nonnegative();

/** Calendar date in the trip's local timezone, e.g. "2026-12-01". */
export const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Wall-clock time in the trip's local timezone, e.g. "13:30". */
export const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** ISO-8601 instant with offset, e.g. "2026-12-01T08:15:00+09:00". */
export const IsoDateTime = z.string().datetime({ offset: true });

export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/);

export const GeoPoint = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

/** A real-world place, resolved via Google Places (placeId) or OSM. */
export const PlaceRef = z.object({
  placeId: z.string().max(256).optional(), // Google place id
  osmId: z.string().max(64).optional(), // e.g. "node/123456"
  name: z.string().min(1).max(200),
  address: z.string().max(300).optional(),
  location: GeoPoint,
});
export type PlaceRef = z.infer<typeof PlaceRef>;

/**
 * The 3-tier halal label (+ not_halal), strictest first. A member's requirement
 * is satisfied by a place whose tier is at the same index or lower.
 * Extra nuance ("has halal menu options", "serves alcohol") lives in flags on
 * the halal assessment, not in this ladder.
 */
export const HALAL_TIERS = ['certified', 'muslim_owned', 'pork_free', 'not_halal'] as const;
export const HalalTier = z.enum(HALAL_TIERS);
export type HalalTier = z.infer<typeof HalalTier>;

export function tierSatisfies(placeTier: HalalTier, required: HalalTier): boolean {
  return HALAL_TIERS.indexOf(placeTier) <= HALAL_TIERS.indexOf(required);
}

export const PrayerName = z.enum(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
export type PrayerName = z.infer<typeof PrayerName>;
