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
