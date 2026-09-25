// When someone leaves (or is removed from) a trip: their votes and choices
// stop counting, open ideas are re-tallied (they may now be decided), they
// leave any split group (empty groups — and splits with only the main group
// left — go away), they're taken off timeline stops, and their Document
// Vault for the trip (records, files, shared status) is deleted.
import { FieldValue } from 'firebase-admin/firestore';
import { CHOICE_WINDOW_MS, OPEN_STATUSES, paths, statusFromTally, tallyIdea, votingClosed } from '../../src/domain/index.js';
import { adminDb } from './firebaseAdmin.js';
import { ideaDocRef, loadTripData } from './schedule.js';
import { applyMove } from './splits.js';
import { deleteVault } from './vault.js';

/** Call after the member doc is deleted and `memberIds` no longer has them. */
export async function cleanupMember(tripId: string, uid: string) {
  await deleteVault(tripId, uid);
  const db = adminDb();
  const data = await loadTripData(tripId);
  const now = Date.now();
  const batch = db.batch();
  let writes = 0;

  for (const idea of data.ideas.values()) {
    if (!idea.votes[uid] && !idea.choices[uid] && !idea.voters?.includes(uid)) continue;
    const votes = { ...idea.votes };
    delete votes[uid];
    const choices = { ...idea.choices };
    delete choices[uid];
    const voters = idea.voters?.filter((u) => u !== uid);
    const update: Record<string, unknown> = { votes, choices, ...(voters ? { voters } : {}), updatedAt: now };
    if (OPEN_STATUSES.includes(idea.status)) {
      const status = statusFromTally(tallyIdea({ ...idea, votes, voters }, data.trip.memberIds), votingClosed(idea, now));
      update.status = status;
      if (status === 'mixed' && idea.status !== 'mixed') update.choiceEndsAt = now + CHOICE_WINDOW_MS;
    }
    batch.update(ideaDocRef(tripId, idea.id), update);
    writes++;
  }

  const items = await db.collection(paths.schedule(tripId)).where('memberUids', 'array-contains', uid).get();
  items.docs.forEach((d) => batch.update(d.ref, { memberUids: FieldValue.arrayRemove(uid) }));
  if (writes || !items.empty) await batch.commit();

  // Splits: moving them to the main group drops them (it's rebuilt from the current members).
  for (const s of data.splits.values()) {
    if (s.status !== 'approved' || !s.tracks.some((t) => t.memberUids.includes(uid))) continue;
    const main = s.tracks.find((t) => t.key === 'A')?.ideaId;
    if (main) await applyMove(tripId, main, [uid], { kind: 'main' }, 'system').catch((e) => console.warn('[cleanup] split', s.id, e));
  }
}
