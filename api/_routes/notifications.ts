// Push subscriptions + notification choices (per person, all trips), and the
// reminders job: closes votes that ran past 24 h and sends "12 h left"
// reminders. The job runs daily from Vercel Cron; point an hourly QStash
// schedule at it (header Authorization: Bearer CRON_SECRET) for exact timing.
// It also checks flights leaving within 6 h for delays (Emergency Resync).
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { NotifyPrefs, readyForAdmin, REMIND_BEFORE_MS } from '../../src/domain/index.js';
import { withAuth } from '../_lib/auth.js';
import { optionalEnv } from '../_lib/env.js';
import { adminDb } from '../_lib/firebaseAdmin.js';
import { handle, HttpError, json, readJson } from '../_lib/http.js';
import { loadPrefs, notify, prefsPath, subsPath } from '../_lib/push.js';
import type { RouteTable } from '../_lib/routes.js';
import { ideaDocRef, loadTripData } from '../_lib/schedule.js';
import { closeOverdue, onReadyForAdmin, stillToChoose, stillToVote } from '../_lib/tally.js';
import { checkFlights } from '../_lib/flightStatus.js';

const subId = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

const Subscription = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

async function reminders(req: Request): Promise<Response> {
  const secret = optionalEnv('CRON_SECRET');
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Unauthorized');
  const db = adminDb();
  const now = Date.now();
  const trips = await db.collection('trips').where('status', 'in', ['planning', 'active']).get();
  let closed = 0;
  let reminded = 0;
  let flights = 0;
  for (const t of trips.docs) {
    try {
      closed += await closeOverdue(t.id);
      const data = await loadTripData(t.id);
      const timeZone = data.trip.destinations[0].timezone;
      flights += await checkFlights(t.id, data, now).catch((e) => (console.error('[reminders] flights', t.id, e), 0));
      const url = (f: string) => `/t/${t.id}/ideas?filter=${f}`;
      for (const idea of data.ideas.values()) {
        const mark = (k: 'vote' | 'choose' | 'decide') => ideaDocRef(t.id, idea.id).update({ [`reminded.${k}`]: now });
        if (idea.status === 'voting' && idea.votingEndsAt && idea.votingEndsAt - now <= REMIND_BEFORE_MS && !idea.reminded?.vote) {
          const hours = Math.max(1, Math.round((idea.votingEndsAt - now) / 3_600_000));
          reminded += await notify(stillToVote(idea, data.trip.memberIds), { kind: 'vote', title: `${hours} h left to vote on ${idea.place.name}`, body: 'After that your vote counts as “no opinion”.', url: url('voting'), tag: `vote-${idea.id}` }, { timeZone });
          await mark('vote');
        }
        if (idea.status === 'mixed' && idea.choiceEndsAt && idea.choiceEndsAt - now <= REMIND_BEFORE_MS && idea.choiceEndsAt > now && !idea.reminded?.choose) {
          reminded += await notify(stillToChoose(idea, data.trip.memberIds), { kind: 'choose', title: `Pick a middle ground for ${idea.place.name}`, body: 'Less than 12 h left — then free time is picked for you.', url: url('mixed'), tag: `choose-${idea.id}` }, { timeZone });
          await mark('choose');
        }
        if (idea.status === 'mixed' && idea.choiceEndsAt && idea.choiceEndsAt <= now && readyForAdmin(idea, data.trip.memberIds, now) && !idea.reminded?.decide) {
          await onReadyForAdmin(t.id, data, idea);
          await mark('decide');
        }
      }
    } catch (err) {
      console.error('[reminders] trip', t.id, err);
    }
  }
  return json({ trips: trips.size, closed, reminded, flights });
}

export const notificationRoutes: RouteTable = {
  /** The public VAPID key browsers subscribe with (null = push not configured on this server). */
  'GET push/key': handle(async () => json({ key: optionalEnv('VAPID_PUBLIC_KEY') ?? null })),

  'POST push/subscribe': withAuth(
    async (req, { user }) => {
      const body = await readJson(req, z.object({ subscription: Subscription, device: z.string().max(120).optional() }));
      await adminDb()
        .doc(`${subsPath(user.uid)}/${subId(body.subscription.endpoint)}`)
        .set({ ...body.subscription, ...(body.device ? { device: body.device } : {}), createdAt: Date.now() });
      return json({ ok: true });
    },
    { perMinute: 10 },
  ),

  'POST push/unsubscribe': withAuth(
    async (req, { user }) => {
      const { endpoint } = await readJson(req, z.object({ endpoint: z.string().url().max(1000) }));
      await adminDb().doc(`${subsPath(user.uid)}/${subId(endpoint)}`).delete();
      return json({ ok: true });
    },
    { perMinute: 10 },
  ),

  'GET push/prefs': withAuth(async (_req, { user }) => {
    const devices = await adminDb().collection(subsPath(user.uid)).count().get();
    return json({ prefs: await loadPrefs(user.uid), devices: devices.data().count });
  }),

  'POST push/prefs': withAuth(
    async (req, { user }) => {
      const { prefs } = await readJson(req, z.object({ prefs: NotifyPrefs.partial() }));
      const next = NotifyPrefs.parse({ ...(await loadPrefs(user.uid)), ...prefs });
      await adminDb().doc(prefsPath(user.uid)).set({ prefs: next, updatedAt: Date.now() });
      return json({ prefs: next });
    },
    { perMinute: 20 },
  ),

  /** Sends a test notification to all of my devices (ignores choices and quiet hours). */
  'POST push/test': withAuth(
    async (_req, { user }) => {
      const sent = await notify([user.uid], { kind: 'decision', title: 'Safar notifications are on ✅', body: 'You’ll hear about votes, split votes and decisions here.', url: '/trips', tag: 'test' }, { timeZone: 'UTC', force: true });
      return json({ sent });
    },
    { perMinute: 4 },
  ),

  'GET cron/reminders': handle(reminders),
  'POST cron/reminders': handle(reminders),
};

