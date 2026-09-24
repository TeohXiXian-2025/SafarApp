import { z } from 'zod';
import { HalalTier, Id, Millis, PlaceRef } from './common.js';

// ─── Halal assessment (the "Halal Radar" verdict for any place) ─────────────

/** Where a halal verdict came from, highest trust first. */
export const HalalSource = z.enum(['verified_certificate', 'community', 'google', 'foursquare', 'osm', 'ai_estimate']);
export type HalalSource = z.infer<typeof HalalSource>;

export const HalalAssessment = z.object({
  /** For food places. Absent for non-food activities. */
  tier: HalalTier.optional(),
  /** Overall Muslim-friendliness of the place/activity. */
  verdict: z.enum(['friendly', 'caution', 'not_friendly', 'unknown']),
  /** Human-readable reasons, e.g. "Bar area serves alcohol". */
  reasons: z.array(z.string().max(200)).max(10),
  flags: z
    .object({
      servesAlcohol: z.boolean().optional(),
      servesPork: z.boolean().optional(),
      halalMenuOptions: z.boolean().optional(),
      prayerSpaceOnSite: z.boolean().optional(),
    })
    .default({}),
  source: HalalSource,
  confidence: z.number().min(0).max(1),
  certificate: z
    .object({ certifier: z.string().max(120), number: z.string().max(80).optional(), expiresAt: Millis.optional() })
    .optional(),
  assessedAt: Millis,
});
export type HalalAssessment = z.infer<typeof HalalAssessment>;

/** One user's report about a place. Path: halalReports/{placeKey}/reports/{uid} */
export const HalalReport = z.object({
  uid: Id,
  tier: HalalTier,
  flags: HalalAssessment.shape.flags,
  note: z.string().max(500).optional(),
  certificatePhotoPath: z.string().max(300).optional(),
  menuPhotoPath: z.string().max(300).optional(),
  visitedAt: Millis.optional(),
  createdAt: Millis,
  updatedAt: Millis,
});
export type HalalReport = z.infer<typeof HalalReport>;

// ─── Review sentiment ("is it worth going?") ────────────────────────────────

export const Sentiment = z.object({
  verdict: z.enum(['highly_recommended', 'mixed', 'skip']),
  score: z.number().min(0).max(1),
  pros: z.array(z.string().max(160)).max(5),
  cons: z.array(z.string().max(160)).max(5),
  basedOn: z.string().max(120), // e.g. "5 Google reviews · 4.6★ (1,203)"
  analyzedAt: Millis,
});
export type Sentiment = z.infer<typeof Sentiment>;

// ─── Idea Board ─────────────────────────────────────────────────────────────

export const IdeaCategory = z.enum(['food', 'attraction', 'activity', 'shopping', 'nature', 'culture', 'nightlife', 'other']);

export const IdeaSource = z.object({
  type: z.enum(['tiktok', 'instagram', 'xiaohongshu', 'manual', 'radar', 'ai', 'split']),
  url: z.string().url().max(2000).optional(),
  caption: z.string().max(2000).optional(),
});

export const IdeaStatus = z.enum(['voting', 'approved', 'mixed', 'split_pending', 'rejected', 'backlog', 'scheduled']);
export type IdeaStatus = z.infer<typeof IdeaStatus>;

export const Idea = z.object({
  id: Id,
  place: PlaceRef.extend({
    category: IdeaCategory,
    openingHours: z.array(z.string().max(120)).max(7).optional(), // Google weekdayDescriptions
    priceLevel: z.number().int().min(0).max(4).optional(),
    rating: z.number().min(0).max(5).optional(),
    ratingCount: z.number().int().nonnegative().optional(),
    photoName: z.string().max(400).optional(), // Places photo resource name
  }),
  source: IdeaSource,
  notes: z.string().max(1000).optional(),
  estDurationMin: z.number().int().min(5).max(24 * 60).default(60),
  halal: HalalAssessment.optional(),
  sentiment: Sentiment.optional(),
  status: IdeaStatus,
  voteSummary: z.object({ up: z.number().int(), down: z.number().int(), total: z.number().int() }).default({ up: 0, down: 0, total: 0 }),
  createdBy: Id,
  createdAt: Millis,
  updatedAt: Millis,
});
export type Idea = z.infer<typeof Idea>;

/** Path: trips/{tripId}/ideas/{ideaId}/votes/{uid} — doc id must equal the voter uid. */
export const Vote = z.object({
  uid: Id,
  value: z.union([z.literal(1), z.literal(-1)]),
  reason: z.string().max(300).optional(),
  at: Millis,
});
export type Vote = z.infer<typeof Vote>;
