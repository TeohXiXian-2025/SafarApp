// Document Vault storage: vault/{tripId}_{uid} (meta: consent, sharing) with
// docs/{docId}. Clients have no Firestore access here — only the owner, through
// the API. The group sees trips/{id}/readiness/{uid}: check labels only.
import {
  Booking,
  paths,
  Readiness,
  readinessChecks,
  readinessStatus,
  tripNights,
  uncoveredNights,
  VaultDoc,
  type ReadyCheck,
} from '../../src/domain/index.js';
import { adminBucket, adminDb } from './firebaseAdmin.js';
import { loadTrip } from './trip.js';

export const vaultRef = (tripId: string, uid: string) => adminDb().doc(`vault/${tripId}_${uid}`);
export const vaultDocs = (tripId: string, uid: string) => vaultRef(tripId, uid).collection('docs');
export const readinessRef = (tripId: string, uid: string) => adminDb().doc(`${paths.trip(tripId)}/readiness/${uid}`);

export async function loadVault(tripId: string, uid: string) {
  const [meta, docs] = await Promise.all([vaultRef(tripId, uid).get(), vaultDocs(tripId, uid).get()]);
  return {
    consentAt: meta.get('consentAt') as number | undefined,
    share: meta.get('share') === true,
    docs: docs.docs.map((d) => VaultDoc.safeParse(d.data())).flatMap((r) => (r.success ? [r.data] : [])),
  };
}

/** Runs the checks and, if the owner shares, publishes the labels to the group. */
export async function refreshReadiness(tripId: string, uid: string): Promise<ReadyCheck[]> {
  const db = adminDb();
  const [trip, vault, bookingsSnap] = await Promise.all([loadTrip(tripId), loadVault(tripId, uid), db.collection(paths.bookings(tripId)).get()]);
  const bookings = bookingsSnap.docs.map((d) => Booking.safeParse(d.data())).flatMap((r) => (r.success ? [r.data] : []));
  const checks = readinessChecks({
    uid,
    trip,
    countries: trip.destinations.map((d) => d.countryCode).filter((c): c is string => !!c),
    docs: vault.docs,
    bookings,
    nightsWithoutHotel: uncoveredNights(tripNights(trip.startDate, trip.endDate), bookings),
  });
  if (vault.share && vault.consentAt) {
    await readinessRef(tripId, uid).set(
      Readiness.parse({ uid, status: readinessStatus(checks), items: checks.slice(0, 20).map((c) => ({ level: c.level, label: c.label })), updatedAt: Date.now() }),
    );
  } else {
    await readinessRef(tripId, uid).delete();
  }
  return checks;
}

/** Everything of one person's vault for a trip: records, files and the shared status. */
export async function deleteVault(tripId: string, uid: string) {
  const db = adminDb();
  await Promise.all([
    db.recursiveDelete(vaultRef(tripId, uid)),
    readinessRef(tripId, uid).delete(),
    adminBucket().deleteFiles({ prefix: `trips/${tripId}/users/${uid}/vault/` }).catch(() => {}),
  ]);
}

/** When a trip is deleted: every member's vault and all uploaded files. */
export async function deleteTripFiles(tripId: string, memberIds: string[]) {
  await Promise.all(memberIds.map((u) => adminDb().recursiveDelete(vaultRef(tripId, u))));
  await adminBucket().deleteFiles({ prefix: `trips/${tripId}/` }).catch(() => {});
}
