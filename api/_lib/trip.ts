import { FieldValue, type Transaction, type WriteBatch } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { paths, Trip, UserProfile } from '../../src/domain/index.js';
import { adminDb } from './firebaseAdmin.js';
import { HttpError } from './http.js';

export const MAX_MEMBERS = 50;

/** Appends an entry to the trip's live activity feed within a batch/transaction. */
export function logActivity(w: WriteBatch | Transaction, tripId: string, actorUid: string, text: string) {
  const ref = adminDb().collection(paths.activity(tripId)).doc();
  const doc = { id: ref.id, actorUid, text: text.slice(0, 300), at: Date.now() };
  // Transaction.set and WriteBatch.set share a signature.
  (w as WriteBatch).set(ref, doc);
}

/** Best display name for a user: their profile, then token claims, then email. */
export async function displayNameFor(user: DecodedIdToken): Promise<{ displayName: string; photoURL?: string }> {
  const snap = await adminDb().doc(paths.user(user.uid)).get();
  const profile = snap.exists ? UserProfile.safeParse(snap.data()) : null;
  const displayName =
    (profile?.success && profile.data.displayName) || user.name || user.email?.split('@')[0] || 'Traveller';
  const photoURL = (profile?.success && profile.data.photoURL) || user.picture || undefined;
  return { displayName: String(displayName).slice(0, 100), ...(photoURL ? { photoURL } : {}) };
}

export async function loadTrip(tripId: string, tx?: Transaction): Promise<Trip> {
  const ref = adminDb().doc(paths.trip(tripId));
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Trip not found');
  return Trip.parse(snap.data());
}

export const arrayUnion = FieldValue.arrayUnion;
export const arrayRemove = FieldValue.arrayRemove;

/**
 * After someone leaves or is removed, ideas that were only waiting on their
 * vote can now be decided. Re-tallies every open idea against the current members.
 */
export async function retallyOpenIdeas(tripId: string) {
  const { Idea, ideaStatusFromVotes, tallyVotes } = await import('../../src/domain/index.js');
  const db = adminDb();
  const trip = await loadTrip(tripId);
  const open = await db.collection(paths.ideas(tripId)).where('status', '==', 'voting').get();
  const batch = db.batch();
  let changed = 0;
  for (const d of open.docs) {
    const idea = Idea.parse(d.data());
    const next = ideaStatusFromVotes(tallyVotes(idea.votes, trip.memberIds));
    if (next !== idea.status) {
      batch.update(d.ref, { status: next, updatedAt: Date.now() });
      changed++;
    }
  }
  if (changed) await batch.commit();
}
