import { z } from 'zod';
import { Id, Member, paths } from '../../src/domain/index.js';
import { withTrip } from '../_lib/auth.js';
import { adminDb } from '../_lib/firebaseAdmin.js';
import { HttpError, json, readJson } from '../_lib/http.js';
import type { RouteTable } from '../_lib/routes.js';
import { arrayRemove, loadTrip, logActivity, retallyOpenIdeas } from '../_lib/trip.js';

const UidBody = z.object({ uid: Id });

async function loadMember(tripId: string, uid: string): Promise<Member> {
  const snap = await adminDb().doc(paths.member(tripId, uid)).get();
  if (!snap.exists) throw new HttpError(404, 'That person is not a member of this trip');
  return Member.parse(snap.data());
}

export const memberRoutes: RouteTable = {
  /** Remove someone from the trip (admin). */
  'POST members/remove': withTrip(
    async (req, { tripId, member: admin }) => {
      const { uid } = await readJson(req, UidBody);
      if (uid === admin.uid) throw new HttpError(400, 'Use "Leave trip" to remove yourself');
      const target = await loadMember(tripId, uid);

      const db = adminDb();
      const batch = db.batch();
      batch.delete(db.doc(paths.member(tripId, uid)));
      batch.update(db.doc(paths.trip(tripId)), { memberIds: arrayRemove(uid), updatedAt: Date.now() });
      logActivity(batch, tripId, admin.uid, `${admin.displayName} removed ${target.displayName}`);
      await batch.commit();
      await retallyOpenIdeas(tripId);
      return json({ ok: true });
    },
    { admin: true, perMinute: 20 },
  ),

  /** Make another member the admin; the current admin becomes a member. */
  'POST members/transfer-admin': withTrip(
    async (req, { tripId, member: admin }) => {
      const { uid } = await readJson(req, UidBody);
      if (uid === admin.uid) throw new HttpError(400, 'You are already the admin');
      const target = await loadMember(tripId, uid);

      const db = adminDb();
      const batch = db.batch();
      batch.update(db.doc(paths.member(tripId, uid)), { role: 'admin' });
      batch.update(db.doc(paths.member(tripId, admin.uid)), { role: 'member' });
      batch.update(db.doc(paths.trip(tripId)), { adminId: uid, updatedAt: Date.now() });
      logActivity(batch, tripId, admin.uid, `${admin.displayName} made ${target.displayName} the trip admin`);
      await batch.commit();
      return json({ ok: true });
    },
    { admin: true, perMinute: 10 },
  ),

  /** Leave a trip. The admin must hand over admin first (or delete the trip if alone). */
  'POST members/leave': withTrip(
    async (_req, { tripId, member }) => {
      if (member.role === 'admin') {
        const trip = await loadTrip(tripId);
        throw new HttpError(
          400,
          trip.memberIds.length > 1
            ? 'Make someone else the admin before leaving'
            : "You're the only member — delete the trip instead",
        );
      }
      const db = adminDb();
      const batch = db.batch();
      batch.delete(db.doc(paths.member(tripId, member.uid)));
      batch.update(db.doc(paths.trip(tripId)), { memberIds: arrayRemove(member.uid), updatedAt: Date.now() });
      logActivity(batch, tripId, member.uid, `${member.displayName} left the trip`);
      await batch.commit();
      await retallyOpenIdeas(tripId);
      return json({ ok: true });
    },
    { perMinute: 10 },
  ),
};
