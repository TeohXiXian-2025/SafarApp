import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Invite, Member, paths } from '../../src/domain/index.js';
import { withAuth, withTrip } from '../_lib/auth.js';
import { adminDb } from '../_lib/firebaseAdmin.js';
import { HttpError, json, readJson } from '../_lib/http.js';
import type { RouteTable } from '../_lib/routes.js';
import { arrayUnion, displayNameFor, loadTrip, logActivity, MAX_MEMBERS } from '../_lib/trip.js';

const DAY = 86_400_000;
const inviteRef = (token: string) => adminDb().doc(paths.inviteToken(token));

function usable(invite: Invite): string | null {
  if (invite.expiresAt < Date.now()) return 'This invite link has expired. Ask the trip admin for a new one.';
  if (invite.uses >= invite.maxUses) return 'This invite link has reached its limit. Ask the trip admin for a new one.';
  return null;
}

async function readInvite(token: string): Promise<Invite> {
  const snap = await inviteRef(token).get();
  if (!snap.exists) throw new HttpError(404, 'Invite link not found. It may have been revoked.');
  return Invite.parse(snap.data());
}

const TokenBody = z.object({ token: Invite.shape.token });

export const inviteRoutes: RouteTable = {
  /** Create a shareable invite link (admin). Returns the token; the client builds the URL. */
  'POST invites/create': withTrip(
    async (req, { tripId, user }) => {
      const input = await readJson(
        req,
        z.object({
          maxUses: z.number().int().min(1).max(MAX_MEMBERS).default(20),
          expiresInDays: z.number().int().min(1).max(30).default(7),
        }),
      );
      const now = Date.now();
      const invite = Invite.parse({
        token: randomBytes(16).toString('base64url'), // 128-bit, unguessable
        tripId,
        createdBy: user.uid,
        createdAt: now,
        expiresAt: now + input.expiresInDays * DAY,
        maxUses: input.maxUses,
        uses: 0,
      });
      await inviteRef(invite.token).set(invite);
      return json(invite, { status: 201 });
    },
    { admin: true, perMinute: 10 },
  ),

  /** List the trip's invite links (admin). */
  'GET invites/list': withTrip(
    async (_req, { tripId }) => {
      const snap = await adminDb().collection('inviteTokens').where('tripId', '==', tripId).get();
      const invites = snap.docs.map((d) => Invite.parse(d.data())).sort((a, b) => b.createdAt - a.createdAt);
      return json({ invites });
    },
    { admin: true },
  ),

  /** Revoke an invite link (admin). */
  'POST invites/revoke': withTrip(
    async (req, { tripId }) => {
      const { token } = await readJson(req, TokenBody);
      const invite = await readInvite(token);
      if (invite.tripId !== tripId) throw new HttpError(404, 'Invite link not found');
      await inviteRef(token).delete();
      return json({ ok: true });
    },
    { admin: true },
  ),

  /** What the join page shows before the user accepts. */
  'GET invites/preview': withAuth(async (req, { user }) => {
    const token = TokenBody.parse({ token: new URL(req.url).searchParams.get('token') }).token;
    const invite = await readInvite(token);
    const trip = await loadTrip(invite.tripId);
    const adminSnap = await adminDb().doc(paths.member(trip.id, trip.adminId)).get();
    return json({
      tripId: trip.id,
      name: trip.name,
      destinations: trip.destinations.map((d) => d.name),
      startDate: trip.startDate,
      endDate: trip.endDate,
      memberCount: trip.memberIds.length,
      adminName: adminSnap.exists ? Member.parse(adminSnap.data()).displayName : null,
      alreadyMember: trip.memberIds.includes(user.uid),
      problem: usable(invite),
    });
  }),

  /** Join a trip via invite link. Idempotent for existing members. */
  'POST invites/accept': withAuth(
    async (req, { user }) => {
      const { token } = await readJson(req, TokenBody);
      const me = await displayNameFor(user);
      const db = adminDb();

      const tripId = await db.runTransaction(async (tx) => {
        const snap = await tx.get(inviteRef(token));
        if (!snap.exists) throw new HttpError(404, 'Invite link not found. It may have been revoked.');
        const invite = Invite.parse(snap.data());
        const trip = await loadTrip(invite.tripId, tx);

        if (trip.memberIds.includes(user.uid)) return trip.id;
        const problem = usable(invite);
        if (problem) throw new HttpError(410, problem);
        if (trip.memberIds.length >= MAX_MEMBERS) throw new HttpError(409, `Trips are limited to ${MAX_MEMBERS} members`);

        const now = Date.now();
        tx.set(db.doc(paths.member(trip.id, user.uid)), Member.parse({ uid: user.uid, role: 'member', joinedAt: now, ...me }));
        tx.update(db.doc(paths.trip(trip.id)), { memberIds: arrayUnion(user.uid), updatedAt: now });
        tx.update(snap.ref, { uses: invite.uses + 1 });
        logActivity(tx, trip.id, user.uid, `${me.displayName} joined the trip`);
        return trip.id;
      });

      return json({ tripId });
    },
    { perMinute: 20 },
  ),
};
