// Push notifications: what can be sent, each person's choices, and quiet hours.
import { z } from 'zod';
import { Millis } from './common.js';

export const NOTIFY_KINDS = {
  new_idea: { label: 'New ideas', hint: 'Someone adds a place (bundled — at most one every 10 min)' },
  vote: { label: 'Votes needed', hint: 'Reminder when voting closes in 12 h and you haven’t voted' },
  choose: { label: 'Split votes', hint: 'Votes split and you can pick a middle ground' },
  decide: { label: 'Decisions to make (admin)', hint: 'Everyone has picked — your call' },
  decision: { label: 'Results', hint: 'A place is accepted, kept as backup or rejected' },
  timeline: { label: 'Timeline changes', hint: 'The plan was re-arranged' },
  comment: { label: 'Comments', hint: 'Someone comments on an idea you added, voted on or commented on' },
} as const;
export type NotifyKind = keyof typeof NOTIFY_KINDS;

export const NotifyPrefs = z.object(
  Object.fromEntries(Object.keys(NOTIFY_KINDS).map((k) => [k, z.boolean().default(true)])) as Record<NotifyKind, z.ZodDefault<z.ZodBoolean>>,
);
export type NotifyPrefs = z.infer<typeof NotifyPrefs>;

/** A browser's push subscription (Web Push). Path: users/{uid}/pushSubs/{id} */
export const PushSub = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
  device: z.string().max(120).optional(),
  createdAt: Millis,
});
export type PushSub = z.infer<typeof PushSub>;

/** Waits for the morning: new ideas, results, comments, timeline changes. Time-sensitive ones go through. */
const URGENT: NotifyKind[] = ['vote', 'choose', 'decide'];
const QUIET_FROM = 22;
const QUIET_TO = 8;

export function isQuiet(timeZone: string, now = new Date()): boolean {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now));
  return h >= QUIET_FROM || h < QUIET_TO;
}

export const shouldSend = (kind: NotifyKind, prefs: NotifyPrefs, timeZone: string, now = new Date()) => prefs[kind] && (URGENT.includes(kind) || !isQuiet(timeZone, now));

/** Reminders go out once this close to a deadline. */
export const REMIND_BEFORE_MS = 12 * 3_600_000;
