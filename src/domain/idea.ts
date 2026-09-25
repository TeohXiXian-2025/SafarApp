import { z } from 'zod';
import { GeoPoint, HalalTier, Id, Millis, PlaceRef } from './common.js';

// ─── Halal assessment (the "Halal Radar" verdict for any place) ─────────────

/** Where a halal verdict came from, highest trust first. */
export const HalalSource = z.enum(['verified_certificate', 'community', 'google', 'foursquare', 'osm', 'ai_estimate']);
export type HalalSource = z.infer<typeof HalalSource>;

export const EvidenceSource = z.enum(['google', 'foursquare', 'openstreetmap', 'reviews', 'website', 'place_details', 'nearby', 'community', 'ai']);
export type EvidenceSource = z.infer<typeof EvidenceSource>;

export const NearbyPlace = z.object({
  name: z.string().max(200),
  placeId: z.string().max(300).optional(),
  location: GeoPoint,
  distanceM: z.number().int().nonnegative(),
  walkMin: z.number().int().nonnegative(),
});
export type NearbyPlace = z.infer<typeof NearbyPlace>;

/** How easy it is to pray from here: on site, ≤10 min walk, ≤25 min, further. */
export const PrayerAccess = z.enum(['onsite', 'walkable', 'nearby', 'far', 'unknown']);
export type PrayerAccess = z.infer<typeof PrayerAccess>;

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
  /** Why we reached the verdict — each point names where it came from. */
  evidence: z
    .array(z.object({ text: z.string().max(240), source: EvidenceSource }))
    .max(10)
    .default([]),
  /** Nearest mosques / prayer rooms (all places). */
  prayer: z.object({ access: PrayerAccess, places: z.array(NearbyPlace).max(3) }).optional(),
  /** Halal-listed food nearby (for alternatives and non-food places). */
  halalFood: z.object({ places: z.array(NearbyPlace).max(3) }).optional(),
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

/** halalSummary/{placeKey} — community consensus, written by the server only. */
export const HalalSummary = z.object({
  placeKey: z.string().max(300),
  name: z.string().max(200),
  reportCount: z.number().int().nonnegative(),
  counts: z.partialRecord(HalalTier, z.number().nonnegative()),
  /** Consensus tier, when reports agree strongly enough. */
  tier: HalalTier.optional(),
  disputed: z.boolean(),
  flags: HalalAssessment.shape.flags,
  updatedAt: Millis,
});
export type HalalSummary = z.infer<typeof HalalSummary>;

export const MIN_COMMUNITY_REPORTS = 2;
const YEAR = 365 * 86_400_000;

/**
 * Community consensus from individual reports. Recent reports count fully,
 * reports older than a year count half. A tier wins with ≥ 60% of the weight
 * and at least MIN_COMMUNITY_REPORTS reports; otherwise, with 2+ reports that
 * disagree, the place is "disputed".
 */
export function summarizeReports(
  reports: Pick<HalalReport, 'tier' | 'flags' | 'updatedAt'>[],
  now = Date.now(),
): Pick<HalalSummary, 'reportCount' | 'counts' | 'tier' | 'disputed' | 'flags'> {
  const counts: Partial<Record<HalalTier, number>> = {};
  let total = 0;
  for (const r of reports) {
    const w = now - r.updatedAt > YEAR ? 0.5 : 1;
    counts[r.tier] = (counts[r.tier] ?? 0) + w;
    total += w;
  }
  const [topTier, topWeight] = (Object.entries(counts) as [HalalTier, number][]).sort((a, b) => b[1] - a[1])[0] ?? [];
  const agreed = reports.length >= MIN_COMMUNITY_REPORTS && topWeight / total >= 0.6;
  const majority = (key: keyof HalalReport['flags']) => {
    const said = reports.filter((r) => r.flags?.[key] !== undefined);
    if (!said.length) return undefined;
    return said.filter((r) => r.flags[key]).length * 2 >= said.length;
  };
  return {
    reportCount: reports.length,
    counts,
    ...(agreed ? { tier: topTier } : {}),
    disputed: reports.length >= MIN_COMMUNITY_REPORTS && !agreed,
    flags: {
      ...(majority('servesAlcohol') !== undefined ? { servesAlcohol: majority('servesAlcohol') } : {}),
      ...(majority('servesPork') !== undefined ? { servesPork: majority('servesPork') } : {}),
      ...(majority('halalMenuOptions') !== undefined ? { halalMenuOptions: majority('halalMenuOptions') } : {}),
      ...(majority('prayerSpaceOnSite') !== undefined ? { prayerSpaceOnSite: majority('prayerSpaceOnSite') } : {}),
    },
  };
}

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
export type IdeaCategory = z.infer<typeof IdeaCategory>;

export const IdeaSource = z.object({
  type: z.enum(['tiktok', 'instagram', 'xiaohongshu', 'youtube', 'link', 'screenshot', 'text', 'manual', 'radar', 'ai', 'split']),
  url: z.string().url().max(2000).optional(),
  caption: z.string().max(2000).optional(),
  author: z.string().max(120).optional(),
});
export type IdeaSource = z.infer<typeof IdeaSource>;

/**
 * voting → backlog (everyone 👍) | rejected (everyone 👎) | mixed (split votes:
 * the people not going pick a middle ground, then the admin accepts / backs up / rejects).
 * backup = kept as a plan B. split_pending is legacy (old two-way split proposals).
 */
export const IdeaStatus = z.enum(['voting', 'backlog', 'mixed', 'split_pending', 'rejected', 'scheduled', 'backup']);
export type IdeaStatus = z.infer<typeof IdeaStatus>;

/** Why someone voted 👎 — shapes the middle grounds offered to them. */
export const VOTE_REASONS = {
  not_interested: 'Not interested',
  too_expensive: 'Too expensive',
  too_far: 'Too far',
  halal: 'Halal / food needs',
  been_before: 'Been before',
  timing: 'Too tiring / timing',
  other: 'Other',
} as const;
export const VoteReasonTag = z.enum(['not_interested', 'too_expensive', 'too_far', 'halal', 'been_before', 'timing', 'other']);
export type VoteReasonTag = z.infer<typeof VoteReasonTag>;

/** Doc id of the voter is the map key. */
export const Vote = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
  /** 👎 needs a reason: a tag, plus free text (required for "other"). */
  tag: VoteReasonTag.optional(),
  reason: z.string().max(300).optional(),
  /**
   * 👍 despite a conflict (e.g. "I called — they're halal"): what they
   * confirmed. `key` identifies the conflicts at the time; if they change,
   * the member is asked again.
   */
  ack: z.object({ key: z.string().max(200), text: z.string().max(300), at: Millis }).optional(),
  at: Millis,
});
export type Vote = z.infer<typeof Vote>;

/** A middle ground someone not going can pick. Every option turns into something on the timeline. */
export const MiddleOption = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(['alternative', 'timing', 'join', 'free_time']),
  title: z.string().max(160),
  detail: z.string().max(300),
  /** alternative: the nearby place. */
  place: z
    .object({ placeId: z.string().max(300), name: z.string().max(200), location: GeoPoint, walkMin: z.number().int().nonnegative(), halalListed: z.boolean().optional() })
    .optional(),
  /** timing: when the whole group would go instead ("HH:MM"). */
  window: z.object({ start: z.string().max(5), end: z.string().max(5) }).optional(),
});
export type MiddleOption = z.infer<typeof MiddleOption>;

export const Choice = z.object({
  optionId: z.string().min(1).max(40),
  note: z.string().max(300).optional(),
  /** Picked for them when the 24 h ran out. */
  auto: z.boolean().optional(),
  at: Millis,
});
export type Choice = z.infer<typeof Choice>;

/** A comment on an idea. Path: trips/{id}/ideas/{ideaId}/comments/{commentId} */
export const IdeaComment = z.object({
  id: Id,
  uid: Id,
  text: z.string().min(1).max(500),
  at: Millis,
});
export type IdeaComment = z.infer<typeof IdeaComment>;

export const IdeaPlace = PlaceRef.extend({
  category: IdeaCategory,
  typeLabel: z.string().max(80).optional(), // e.g. "Halal restaurant"
  types: z.array(z.string().max(60)).max(20).default([]),
  openingHours: z.array(z.string().max(160)).max(7).optional(), // Google weekdayDescriptions
  priceLevel: z.number().int().min(0).max(4).optional(),
  rating: z.number().min(0).max(5).optional(),
  ratingCount: z.number().int().nonnegative().optional(),
  website: z.string().url().max(500).optional(),
  /** International format, e.g. "+60 3-2141 0000" — to ask the restaurant directly. */
  phone: z.string().max(40).optional(),
  photoName: z.string().max(600).optional(), // Places photo resource name
  /** Direct image URL resolved once (Google serves it cacheably) — avoids a billed photo call per view. */
  photoUrl: z.string().url().max(2000).optional(),
  photoUrlAt: Millis.optional(),
  photoAttribution: z.string().max(200).optional(),
  /** When these details came from Google — refreshed after PLACE_REFRESH_MS (Google caching terms). */
  fetchedAt: Millis.optional(),
});
export type IdeaPlace = z.infer<typeof IdeaPlace>;

/** Google allows caching place content (except the place ID) for up to 30 days. */
export const PLACE_REFRESH_MS = 30 * 86_400_000;

export const Idea = z.object({
  id: Id,
  /** Shared key for this place across trips (halal reports/summary). */
  placeKey: z.string().max(300),
  place: IdeaPlace,
  source: IdeaSource,
  notes: z.string().max(1000).optional(),
  estDurationMin: z.number().int().min(5).max(24 * 60).default(60),
  halal: HalalAssessment.optional(),
  sentiment: Sentiment.optional(),
  analysis: z.object({ status: z.enum(['pending', 'done', 'error']), at: Millis, error: z.string().max(300).optional() }).optional(),
  status: IdeaStatus,
  votes: z.record(z.string(), Vote).default({}),
  /** Who must vote: the members when it was added (later joiners may vote but aren't waited for). */
  voters: z.array(Id).max(50).optional(),
  /** Voting closes then (non-voters abstain). */
  votingEndsAt: Millis.optional(),
  /** Split votes: middle grounds for the people not going, and what they picked. */
  options: z.array(MiddleOption).max(6).optional(),
  choices: z.record(z.string(), Choice).default({}),
  /** Choosing closes then (anyone who hasn't picked gets free time). */
  choiceEndsAt: Millis.optional(),
  /** A timing middle ground the admin accepted: the group visits in this window. */
  window: z.object({ start: z.string().max(5), end: z.string().max(5) }).optional(),
  /** Set when the admin closes voting early or overrides the result. */
  decidedBy: Id.optional(),
  /** Part of a split pair (the original or its alternative). */
  splitId: Id.optional(),
  /** AI middle-ground suggestions for preference conflicts (keyed by the conflict set). */
  resolution: z
    .object({
      key: z.string().max(500),
      suggestions: z
        .array(
          z.object({
            type: z.enum(['alternative', 'split', 'timing', 'prep']),
            title: z.string().max(120),
            detail: z.string().max(400),
            forUids: z.array(Id).max(50).default([]),
          }),
        )
        .max(5),
      at: Millis,
    })
    .optional(),
  createdBy: Id,
  createdAt: Millis,
  updatedAt: Millis,
});
export type Idea = z.infer<typeof Idea>;

export const placeIsStale = (idea: Pick<Idea, 'place' | 'createdAt'>, now = Date.now()) =>
  !!idea.place.placeId && now - (idea.place.fetchedAt ?? idea.createdAt) > PLACE_REFRESH_MS;

