// Automatic flight checks for Emergency Resync (from the reminders job).
// AviationStack's free plan is ~100 calls a month, so a flight is only checked
// in the 6 h before departure, at most every 2 h, under a monthly cap
// (FLIGHT_STATUS_MONTHLY_CAP, default 90). A delay of 30+ min or a cancellation
// becomes an open report the admin reviews (preview → apply); nothing is
// applied automatically.
import { FieldValue } from 'firebase-admin/firestore';
import { Incident, paths, type Booking } from '../../src/domain/index.js';
import { optionalEnv } from './env.js';
import { adminDb } from './firebaseAdmin.js';
import { notify } from './push.js';
import type { TripData } from './schedule.js';

const WINDOW_MS = 6 * 3_600_000;
const EVERY_MS = 2 * 3_600_000;
export const DELAY_MIN = 30;

export interface AvFlight {
  flight_date?: string;
  flight_status?: string;
  departure?: { delay?: number | null; scheduled?: string | null; estimated?: string | null };
  arrival?: { delay?: number | null; scheduled?: string | null; estimated?: string | null };
  flight?: { iata?: string | null; codeshared?: unknown };
}

export type Change = { type: 'delay'; startLocal: string; endLocal: string; delayMin: number } | { type: 'cancel' };

/** "MH602", or carrier "MH" + number "602". Null if it isn't an IATA flight code. */
export function flightCode(b: Pick<Booking, 'carrier' | 'number'>): string | null {
  const n = (b.number ?? '').replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(n) && /[A-Z]/.test(n.slice(0, 2))) return n;
  const c = (b.carrier ?? '').trim().toUpperCase();
  return /^[A-Z0-9]{2}$/.test(c) && /^\d{1,4}[A-Z]?$/.test(n) ? `${c}${n}` : null;
}

// AviationStack labels LOCAL times with "+00:00" — take the wall-clock part.
const local = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? s.slice(0, 16) : null);
const shift = (localTime: string, min: number) => new Date(Date.parse(`${localTime}:00Z`) + min * 60_000).toISOString().slice(0, 16);

/** What the live status means for this booking (null = on time / unknown). */
export function statusChange(b: Pick<Booking, 'startLocal' | 'endLocal'>, code: string, flights: AvFlight[]): Change | null {
  const day = b.startLocal.slice(0, 10);
  const same = flights.filter((f) => f.flight_date === day);
  const f = same.find((x) => x.flight?.iata?.toUpperCase() === code && !x.flight?.codeshared) ?? same[0];
  if (!f) return null;
  if (f.flight_status === 'cancelled') return { type: 'cancel' };
  const dep = local(f.departure?.estimated) ?? (f.departure?.delay ? shift(b.startLocal, f.departure.delay) : null);
  const depDelay = dep ? Math.round((Date.parse(`${dep}:00Z`) - Date.parse(`${b.startLocal}:00Z`)) / 60_000) : 0;
  const arrDelay = Math.max(depDelay, f.arrival?.delay ?? 0);
  if (Math.max(depDelay, arrDelay) < DELAY_MIN) return null;
  const arr = local(f.arrival?.estimated);
  const endLocal = arr && arr > b.endLocal ? arr : shift(b.endLocal, arrDelay);
  return { type: 'delay', startLocal: dep && depDelay > 0 ? dep : b.startLocal, endLocal, delayMin: Math.max(depDelay, arrDelay) };
}

async function takeCall(): Promise<boolean> {
  const cap = Number(process.env.FLIGHT_STATUS_MONTHLY_CAP) || 90;
  const ref = adminDb().doc(`apiUsage/aviationstack_${new Date().toISOString().slice(0, 7)}`);
  return adminDb().runTransaction(async (tx) => {
    const used = Number((await tx.get(ref)).get('count') ?? 0);
    if (used >= cap) return false;
    tx.set(ref, { count: FieldValue.increment(1), updatedAt: Date.now() }, { merge: true });
    return true;
  });
}

async function fetchStatus(code: string): Promise<AvFlight[] | null> {
  const key = optionalEnv('FLIGHT_STATUS_API_KEY');
  if (!key || !(await takeCall())) return null;
  try {
    const res = await fetch(`https://api.aviationstack.com/v1/flights?access_key=${key}&flight_iata=${code}&limit=10`, { signal: AbortSignal.timeout(10_000) });
    const body = (await res.json()) as { data?: AvFlight[] };
    return res.ok && Array.isArray(body.data) ? body.data : null;
  } catch {
    return null;
  }
}

/** Checks this trip's flights leaving soon; returns how many reports were raised. */
export async function checkFlights(tripId: string, data: TripData, now = Date.now()): Promise<number> {
  const db = adminDb();
  let raised = 0;
  for (const b of data.bookings.values()) {
    const leaves = Date.parse(b.startAt);
    if (b.kind !== 'flight' || !(leaves > now && leaves - now <= WINDOW_MS)) continue;
    const code = flightCode(b);
    if (!code) continue;
    const statusRef = db.doc(`${paths.trip(tripId)}/flightStatus/${b.id}`);
    const prev = (await statusRef.get()).data();
    if (prev && now - Number(prev.checkedAt) < EVERY_MS) continue;
    const flights = await fetchStatus(code);
    if (!flights) continue;
    const change = statusChange(b, code, flights);
    const key = change ? (change.type === 'cancel' ? 'cancel' : `${change.startLocal}|${change.endLocal}`) : 'ok';
    await statusRef.set({ checkedAt: now, result: key });
    if (!change || prev?.reported === key) continue;

    const what = `${code}`;
    const text = change.type === 'cancel' ? `${what} is cancelled` : `${what} delayed ${change.delayMin} min — now ${change.startLocal.slice(11)} → ${change.endLocal.slice(11)}`;
    const ref = db.collection(paths.incidents(tripId)).doc();
    await ref.set(
      Incident.parse({
        id: ref.id,
        type: change.type === 'cancel' ? 'flight_cancelled' : 'flight_delay',
        description: `${text} (live flight status)`,
        attachmentPaths: [],
        createdBy: 'system',
        createdAt: now,
        status: 'open',
        bookingId: b.id,
        change: change.type === 'cancel' ? { type: 'cancel' } : { type: 'delay', startLocal: change.startLocal, endLocal: change.endLocal },
      }),
    );
    await statusRef.set({ reported: key }, { merge: true });
    await notify(
      [...new Set([...b.travellerUids, data.trip.adminId])],
      { kind: 'timeline', title: text, body: 'Tap to see what it does to the plan.', url: `/t/${tripId}/bookings`, tag: `flight-${b.id}` },
      { timeZone: data.trip.destinations[0].timezone },
    );
    raised++;
  }
  return raised;
}
