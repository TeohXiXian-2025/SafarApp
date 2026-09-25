// Split Tracks on the server: create a split from the groups people picked,
// move someone between groups (opting out of / back into an accepted plan,
// leaving the trip), and dissolve it. Keeps alternative ideas and timeline
// stops in step with the split.
import { FieldValue, type WriteBatch } from 'firebase-admin/firestore';
import {
  Idea,
  ideaItemId,
  paths,
  reunionAfter,
  Split,
  splitExplanation,
  toMin,
  type MiddleOption,
  type SplitTrack,
  type SplitTrackKey,
} from '../../src/domain/index.js';
import { adminDb } from './firebaseAdmin.js';
import { HttpError } from './http.js';
import { DEFAULT_DURATION, photoUrl, placeDetails } from './places.js';
import { dayItems, ideaDocRef, itemRef, loadTripData, pairIds, refreshDay, splitRef, writeStops, type TripData } from './schedule.js';

export const freeItemId = (splitId: string) => `free_${splitId}`;

/** A new idea for an alternative place (its own Halal Radar check runs from the client). */
async function altIdea(tripId: string, source: Idea, option: MiddleOption, splitId: string, actor: string, status: Idea['status']): Promise<Idea> {
  const { place } = await placeDetails(option.place!.placeId);
  if (place.photoName) {
    const url = await photoUrl(place.photoName);
    if (url) Object.assign(place, { photoUrl: url, photoUrlAt: Date.now() });
  }
  const ref = adminDb().collection(paths.ideas(tripId)).doc();
  const now = Date.now();
  return Idea.parse({
    id: ref.id,
    placeKey: paths.placeKey({ placeId: place.placeId }),
    place,
    source: { type: 'split' },
    notes: `Alternative to ${source.place.name}`,
    estDurationMin: place.category === source.place.category ? source.estDurationMin : DEFAULT_DURATION[place.category],
    analysis: { status: 'pending', at: now },
    status,
    votes: {},
    voters: [],
    choices: {},
    splitId,
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
  });
}

/** Recomputes the main group, timings, meeting time and explanation. */
function finish(split: Split, data: TripData, main: Idea): Split {
  const others = new Set(split.tracks.filter((t) => t.key !== 'A').flatMap((t) => t.memberUids));
  const tracks = split.tracks.map((t) =>
    t.key === 'A' ? { ...t, memberUids: data.trip.memberIds.filter((u) => !others.has(u)), durationMin: main.estDurationMin } : t.key === 'F' ? { ...t, durationMin: main.estDurationMin } : t,
  );
  const afterMinutes = reunionAfter(tracks);
  return {
    ...split,
    tracks,
    reunion: { ...split.reunion, afterMinutes },
    explanation: splitExplanation(tracks, data.members, afterMinutes),
    updatedAt: Date.now(),
  };
}

export type Target = { kind: 'main' } | { kind: 'free' } | { kind: 'alt'; option: MiddleOption };

/**
 * Builds the new split state for moving `uids` to `target`. Creates the
 * alternative's idea when it's a new place; drops groups that end up empty.
 * Returns null when nobody is left outside the main group (no split needed).
 */
async function moveMembers(tripId: string, data: TripData, main: Idea, split: Split | null, uids: string[], target: Target, actor: string) {
  const splitId = split?.id ?? adminDb().collection(paths.splits(tripId)).doc().id;
  let tracks: SplitTrack[] = (split?.tracks ?? [{ key: 'A', ideaId: main.id, memberUids: [], label: main.place.name, walkMin: 0, durationMin: main.estDurationMin }]).map((t) => ({
    ...t,
    memberUids: t.memberUids.filter((u) => !uids.includes(u)),
  }));
  const created: Idea[] = [];
  if (target.kind === 'free') {
    const f = tracks.find((t) => t.key === 'F');
    if (f) f.memberUids.push(...uids);
    else tracks.push({ key: 'F', memberUids: [...uids], label: 'Free time nearby', walkMin: 0, durationMin: main.estDurationMin });
  } else if (target.kind === 'alt') {
    const placeId = target.option.place!.placeId;
    const existing = tracks.find((t) => t.ideaId && data.ideas.get(t.ideaId)?.place.placeId === placeId);
    if (existing) existing.memberUids.push(...uids);
    else {
      const key = (['B', 'C'] as SplitTrackKey[]).find((k) => !tracks.some((t) => t.key === k && t.memberUids.length));
      if (!key) throw new HttpError(409, 'There are already two alternative groups — join one of them or take free time');
      tracks = tracks.filter((t) => t.key !== key); // an empty group with that letter is replaced
      const idea = await altIdea(tripId, main, target.option, splitId, actor, main.status === 'scheduled' ? 'scheduled' : 'backlog');
      created.push(idea);
      tracks.push({ key, ideaId: idea.id, memberUids: [...uids], label: idea.place.name, walkMin: target.option.place!.walkMin, durationMin: idea.estDurationMin });
    }
  }
  const emptied = tracks.filter((t) => t.key !== 'A' && !t.memberUids.length);
  tracks = tracks.filter((t) => t.key === 'A' || t.memberUids.length).sort((a, b) => a.key.localeCompare(b.key));
  const base: Split = split ?? {
    id: splitId,
    sourceIdeaId: main.id,
    reason: 'mixed_votes',
    tracks,
    reunion: { place: { name: main.place.name, location: main.place.location, ...(main.place.placeId ? { placeId: main.place.placeId } : {}) }, afterMinutes: main.estDurationMin },
    explanation: '',
    status: 'approved',
    createdBy: actor,
    createdAt: Date.now(),
  };
  const next = tracks.length > 1 ? finish({ ...base, tracks }, data, main) : null;
  return { next, created, emptied, splitId };
}

/** Deletes a group's alternative idea and its timeline stop. */
function dropTrack(batch: WriteBatch, tripId: string, t: SplitTrack, splitId: string) {
  if (t.ideaId && t.key !== 'A') {
    batch.delete(ideaDocRef(tripId, t.ideaId));
    batch.delete(itemRef(tripId, ideaItemId(t.ideaId)));
  }
  if (t.key === 'F') batch.delete(itemRef(tripId, freeItemId(splitId)));
}

/**
 * Applies a group change and keeps everything in step: split doc, main idea's
 * splitId, alternative ideas, and — if it's on the timeline — the stops.
 */
export async function applyMove(tripId: string, mainId: string, uids: string[], target: Target, actor: string, opts: { reason?: Split['reason'] } = {}) {
  const data = await loadTripData(tripId);
  const main = data.ideas.get(mainId);
  if (!main) throw new HttpError(404, 'Idea not found');
  const split = main.splitId ? (data.splits.get(main.splitId) ?? null) : null;
  const { next, created, emptied, splitId } = await moveMembers(tripId, data, main, split?.status === 'approved' ? split : null, uids, target, actor);

  const batch = adminDb().batch();
  created.forEach((i) => batch.set(ideaDocRef(tripId, i.id), i));
  emptied.forEach((t) => dropTrack(batch, tripId, t, splitId));
  if (next) {
    batch.set(splitRef(tripId, splitId), Split.parse({ ...next, ...(opts.reason && !split ? { reason: opts.reason } : {}) }));
    batch.update(ideaDocRef(tripId, main.id), { splitId, updatedAt: Date.now() });
  } else if (split) {
    batch.update(splitRef(tripId, split.id), { status: 'rejected', updatedAt: Date.now() });
    batch.update(ideaDocRef(tripId, main.id), { splitId: FieldValue.delete(), updatedAt: Date.now() });
  }
  await batch.commit();
  await restage(tripId, main.id);
  return { split: next, created };
}

/** Ends a split: alternative ideas and their stops go; the main idea stays. */
export function dissolve(batch: WriteBatch, tripId: string, split: Split) {
  batch.update(splitRef(tripId, split.id), { status: 'rejected', updatedAt: Date.now() });
  split.tracks.filter((t) => t.key !== 'A').forEach((t) => dropTrack(batch, tripId, t, split.id));
  const main = split.tracks.find((t) => t.key === 'A')?.ideaId ?? split.sourceIdeaId;
  batch.update(ideaDocRef(tripId, main), { splitId: FieldValue.delete(), updatedAt: Date.now() });
}

/** If the idea is on the timeline, rewrite its stop(s) at the same time so groups and members match. */
export async function restage(tripId: string, mainId: string) {
  const snap = await itemRef(tripId, ideaItemId(mainId)).get();
  if (!snap.exists) return;
  const item = snap.data() as { day: string; start: string; orderIndex: number };
  const data = await loadTripData(tripId);
  const main = data.ideas.get(mainId);
  if (!main) return;
  const current = await dayItems(tripId, item.day);
  const mainItem = current.find((i) => i.id === ideaItemId(mainId));
  const batch = adminDb().batch();
  (mainItem ? pairIds(mainItem, current) : []).forEach((g) => batch.delete(itemRef(tripId, g.id)));
  const ids = writeStops(batch, tripId, { data, idea: main, day: item.day, start: toMin(item.start), orderIndex: item.orderIndex, actor: 'system' });
  ids.forEach((id) => batch.update(ideaDocRef(tripId, id), { status: 'scheduled', updatedAt: Date.now() }));
  await batch.commit();
  await refreshDay(tripId, item.day, data);
}
