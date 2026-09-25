// Emergency incidents, background jobs, activity feed.
import { z } from 'zod';
import { Id, Millis } from './common.js';

// Expenses live in expenses.ts.

// The document vault lives in vault.ts.

// ─── Emergency resync ───────────────────────────────────────────────────────

export const Incident = z.object({
  id: Id,
  type: z.enum(['flight_delay', 'flight_cancelled', 'transport_disruption', 'weather', 'health', 'other']),
  description: z.string().max(2000),
  attachmentPaths: z.array(z.string().max(300)).max(5).default([]),
  createdBy: Id,
  createdAt: Millis,
  status: z.enum(['open', 'resyncing', 'proposed', 'applied', 'dismissed']),
  resyncJobId: Id.optional(),
});
export type Incident = z.infer<typeof Incident>;

// ─── Background jobs (long AI work; clients listen to the doc) ──────────────

export const JobType = z.enum([
  'social_import',
  'booking_parse',
  'halal_assess',
  'review_analysis',
  'hotel_recommend',
  'split_propose',
  'schedule_arrange',
  'prayer_pairing',
  'document_extract',
  'document_crosscheck',
  'emergency_resync',
]);

export const Job = z.object({
  id: Id,
  type: JobType,
  status: z.enum(['queued', 'running', 'done', 'error']),
  progress: z.number().min(0).max(1).default(0),
  message: z.string().max(300).optional(),
  result: z.unknown().optional(),
  error: z.string().max(1000).optional(),
  createdBy: Id,
  createdAt: Millis,
  updatedAt: Millis,
});
export type Job = z.infer<typeof Job>;

// ─── Activity feed ──────────────────────────────────────────────────────────

export const ActivityEvent = z.object({
  id: Id,
  actorUid: Id, // "system" for AI/server events
  text: z.string().max(300),
  at: Millis,
});
export type ActivityEvent = z.infer<typeof ActivityEvent>;
