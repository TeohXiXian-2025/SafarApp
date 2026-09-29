import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { isDemoMate, Member, paths } from '../../src/domain/index.js';
import { adminAuth, adminDb } from './firebaseAdmin.js';
import { handle, HttpError } from './http.js';
import { rateLimit } from './rateLimit.js';

export interface AuthContext {
  user: DecodedIdToken;
}

export interface TripContext extends AuthContext {
  tripId: string;
  member: Member;
}

/**
 * The demo trip's travel mates act through the same routes as people do (see
 * _lib/demo.ts), called from inside this process with a key made at start-up.
 * The key never leaves the process, and it only works for the mates' ids.
 */
const INTERNAL_KEY = randomBytes(32).toString('hex');
export const internalAuth = (uid: string) => `Internal ${INTERNAL_KEY} ${uid}`;

function internalUser(header: string): DecodedIdToken | null {
  const [, key = '', uid = ''] = header.split(' ');
  const ok = key.length === INTERNAL_KEY.length && timingSafeEqual(Buffer.from(key), Buffer.from(INTERNAL_KEY));
  if (!ok || !isDemoMate(uid)) throw new HttpError(401, 'Sign in required');
  return { uid } as DecodedIdToken;
}

/** Verifies the `Authorization: Bearer <Firebase ID token>` header. */
export async function requireUser(req: Request): Promise<DecodedIdToken> {
  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Internal ')) return internalUser(header)!;
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Sign in required');
  try {
    return await adminAuth().verifyIdToken(token);
  } catch {
    throw new HttpError(401, 'Session expired — please sign in again');
  }
}

/** Loads the caller's membership of a trip; 403 if not a member (or not admin when required). */
export async function requireTripMember(uid: string, tripId: string, opts: { admin?: boolean } = {}): Promise<Member> {
  const snap = await adminDb().doc(paths.member(tripId, uid)).get();
  if (!snap.exists) throw new HttpError(403, 'You are not a member of this trip');
  const member = Member.parse(snap.data());
  if (opts.admin && member.role !== 'admin') throw new HttpError(403, 'Only the trip admin can do this');
  return member;
}

interface AuthOptions {
  /** Requests per user per minute for this route. Default 60. */
  perMinute?: number;
}

/** Route wrapper: signed-in user + per-user rate limit + JSON error handling. */
export function withAuth(fn: (req: Request, ctx: AuthContext) => Promise<Response>, opts: AuthOptions = {}) {
  return handle(async (req) => {
    const user = await requireUser(req);
    // The demo mates are shared by every demo trip: no per-user limit for them.
    if (!isDemoMate(user.uid)) await rateLimit(`${user.uid}:${new URL(req.url).pathname}`, opts.perMinute ?? 60, 60);
    return fn(req, { user });
  });
}

/**
 * Route wrapper for trip-scoped endpoints. The trip id comes from the
 * `tripId` query parameter, e.g. POST /api/ideas/import?tripId=abc
 */
export function withTrip(
  fn: (req: Request, ctx: TripContext) => Promise<Response>,
  opts: AuthOptions & { admin?: boolean } = {},
) {
  return withAuth(async (req, { user }) => {
    const tripId = new URL(req.url).searchParams.get('tripId');
    if (!tripId) throw new HttpError(400, 'tripId query parameter is required');
    const member = await requireTripMember(user.uid, tripId, { admin: opts.admin });
    return fn(req, { user, tripId, member });
  }, opts);
}
