// The demo trip (see api/_lib/demo.ts):
//   demo/start            no account needed → a guest + their own copy of the demo trip
//   demo/keep             the guest made a real account → their trip isn't deleted
//   demo/build-template   (CRON_SECRET) rebuild the template the copies come from
import { FieldValue } from 'firebase-admin/firestore';
import { buildTemplate, deleteExpired, keepDemo, startDemo } from '../_lib/demo.js';
import { optionalEnv } from '../_lib/env.js';
import { adminDb } from '../_lib/firebaseAdmin.js';
import { handle, HttpError, json } from '../_lib/http.js';
import { rateLimit } from '../_lib/rateLimit.js';
import type { RouteTable } from '../_lib/routes.js';
import { withTrip } from '../_lib/auth.js';
import { isDemoTrip } from '../../src/domain/index.js';

/** New demo trips per day, for everyone together (each costs a few Firestore writes and map lookups). */
const perDay = () => Number(optionalEnv('DEMO_PER_DAY')) || 150;

const requireCronSecret = (req: Request) => {
  const secret = optionalEnv('CRON_SECRET');
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Unauthorized');
};

export const demoRoutes: RouteTable = {
  'POST demo/start': handle(async (req) => {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
    // Generous per address: a whole venue (judges, a class) can share one Wi-Fi address. The daily cap bounds the cost.
    await rateLimit(`demo:${ip}`, 30, 3600);
    const day = new Date().toISOString().slice(0, 10);
    const counter = adminDb().doc(`config/demoCount-${day}`);
    const used = await adminDb().runTransaction(async (tx) => {
      const n = ((await tx.get(counter)).get('n') as number | undefined) ?? 0;
      if (n >= perDay()) return n;
      tx.set(counter, { n: FieldValue.increment(1), day }, { merge: true });
      return n;
    });
    if (used >= perDay()) throw new HttpError(429, 'Lots of people are trying the demo today — please come back tomorrow, or sign up to plan your own trip.');
    return json(await startDemo(), { status: 201 });
  }),

  'POST demo/keep': withTrip(async (_req, { tripId, user }) => {
    if (!isDemoTrip(tripId)) throw new HttpError(400, 'Not a demo trip');
    await keepDemo(tripId, user.uid);
    return json({ ok: true });
  }),

  'POST demo/build-template': handle(async (req) => {
    requireCronSecret(req);
    const lines: string[] = [];
    const result = await buildTemplate((s) => (lines.push(s), console.log('[demo]', s)));
    return json({ ...result, log: lines });
  }),

  'POST demo/cleanup': handle(async (req) => {
    requireCronSecret(req);
    return json({ deleted: await deleteExpired() });
  }),
};
