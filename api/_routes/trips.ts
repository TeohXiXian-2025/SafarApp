import { CreateTripInput, Member, paths, Trip, UpdateTripInput, type DestinationInput } from '../../src/domain/index.js';
import { withAuth, withTrip } from '../_lib/auth.js';
import { adminDb } from '../_lib/firebaseAdmin.js';
import { lookupTimezone } from '../_lib/google.js';
import { json, readJson } from '../_lib/http.js';
import type { RouteTable } from '../_lib/routes.js';
import { displayNameFor, loadTrip, logActivity } from '../_lib/trip.js';
import { deleteTripFiles } from '../_lib/vault.js';

async function withTimezones(destinations: DestinationInput[]) {
  return Promise.all(destinations.map(async (d) => ({ ...d, timezone: await lookupTimezone(d.location) })));
}

export const tripRoutes: RouteTable = {
  /** Create a trip; the caller becomes its admin. */
  'POST trips/create': withAuth(
    async (req, { user }) => {
      const input = await readJson(req, CreateTripInput);
      const [destinations, me] = await Promise.all([withTimezones(input.destinations), displayNameFor(user)]);

      const db = adminDb();
      const tripRef = db.collection(paths.trips()).doc();
      const now = Date.now();

      const trip = Trip.parse({
        id: tripRef.id,
        name: input.name.trim(),
        destinations,
        startDate: input.startDate,
        endDate: input.endDate,
        currency: input.currency,
        adminId: user.uid,
        memberIds: [user.uid],
        status: 'planning',
        createdAt: now,
        updatedAt: now,
      });
      const member = Member.parse({ uid: user.uid, role: 'admin', joinedAt: now, ...me });

      const batch = db.batch();
      batch.set(tripRef, trip);
      batch.set(db.doc(paths.member(trip.id, user.uid)), member);
      logActivity(batch, trip.id, user.uid, `${me.displayName} created the trip`);
      await batch.commit();

      return json({ tripId: trip.id }, { status: 201 });
    },
    { perMinute: 10 },
  ),

  /** Edit trip details (admin). */
  'POST trips/update': withTrip(
    async (req, { tripId, member }) => {
      const input = await readJson(req, UpdateTripInput);
      const current = await loadTrip(tripId);

      // Validate the merged result, so e.g. a new endDate can't precede the old startDate.
      const dates = { startDate: input.startDate ?? current.startDate, endDate: input.endDate ?? current.endDate };
      // …and every city's dates still fit inside the (possibly new) trip dates.
      UpdateTripInput.parse({ ...dates, destinations: input.destinations ?? current.destinations.map(({ timezone: _tz, ...d }) => d) });

      const { destinations, ...rest } = input;
      const update: Partial<Trip> = { ...rest, ...dates, updatedAt: Date.now() };
      if (rest.name) update.name = rest.name.trim();
      if (destinations) update.destinations = await withTimezones(destinations);

      const db = adminDb();
      const batch = db.batch();
      batch.update(db.doc(paths.trip(tripId)), update);
      logActivity(batch, tripId, member.uid, `${member.displayName} updated the trip details`);
      await batch.commit();
      return json({ ok: true });
    },
    { admin: true, perMinute: 30 },
  ),

  /** Permanently delete a trip and everything under it (admin). */
  'POST trips/delete': withTrip(
    async (_req, { tripId }) => {
      const db = adminDb();
      const invites = await db.collection('inviteTokens').where('tripId', '==', tripId).get();
      const batch = db.batch();
      invites.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      const memberIds = ((await db.doc(paths.trip(tripId)).get()).get('memberIds') as string[] | undefined) ?? [];
      await db.recursiveDelete(db.doc(paths.trip(tripId)));
      // Vaults live outside the trip doc; uploads (tickets, receipts, documents) in Storage.
      await deleteTripFiles(tripId, memberIds);
      return json({ ok: true });
    },
    { admin: true, perMinute: 5 },
  ),
};
