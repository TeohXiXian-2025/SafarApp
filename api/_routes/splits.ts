// Split Tracks: part of the group goes to a nearby alternative and everyone
// meets back up. Any member can ask for a proposal; the admin approves or
// rejects it. An approved pair sits in the backlog and is planned as one stop.
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  estimateTravelMin,
  HalalSummary,
  Id,
  Idea,
  ideaConflicts,
  paths,
  reunionMinutes,
  Split,
  splitExplanation,
  splitGroups,
  type HalalTier,
  type IdeaCategory,
  type Member,
} from '../../src/domain/index.js';
import { withTrip } from '../_lib/auth.js';
import { adminDb } from '../_lib/firebaseAdmin.js';
import { HttpError, json, readJson } from '../_lib/http.js';
import { DEFAULT_DURATION, photoUrl, placeDetails, searchNearby } from '../_lib/places.js';
import { useDailyQuota } from '../_lib/quota.js';
import type { RouteTable } from '../_lib/routes.js';
import { ideaDocRef, itemRef, loadTripData, splitRef, type TripData } from '../_lib/schedule.js';
import { logActivity } from '../_lib/trip.js';
import { ideaItemId } from '../../src/domain/index.js';

const NEEDS: Record<HalalTier, string> = {
  certified: 'certified halal food',
  muslim_owned: 'halal food (Muslim-owned or certified)',
  pork_free: 'pork-free food',
  not_halal: 'a different place',
};

/** How far the alternative may be (≈ 15–20 min walk). */
const ALT_RADIUS_M = 1200;

/** Google place types to look for, by the original's category. */
const ALT_TYPES: Record<IdeaCategory, string[]> = {
  food: ['restaurant'],
  attraction: ['tourist_attraction', 'museum'],
  activity: ['tourist_attraction', 'amusement_park'],
  shopping: ['shopping_mall', 'market'],
  nature: ['park'],
  culture: ['museum', 'art_gallery'],
  nightlife: ['cafe'], // an alcohol-free evening spot
  other: ['tourist_attraction', 'cafe'],
};

const splitsOf = (data: TripData) => [...data.splits.values()];

/** Removes a split: the alternative idea (and its timeline stop) goes, the original is restored. */
export function dissolveSplit(batch: FirebaseFirestore.WriteBatch, tripId: string, split: Split, opts: { restoreOriginal: boolean }) {
  batch.update(splitRef(tripId, split.id), { status: 'rejected' });
  batch.delete(ideaDocRef(tripId, split.trackB.ideaId));
  batch.delete(itemRef(tripId, ideaItemId(split.trackB.ideaId)));
  if (opts.restoreOriginal) {
    batch.update(ideaDocRef(tripId, split.trackA.ideaId), { status: split.sourceStatus, splitId: FieldValue.delete(), updatedAt: Date.now() });
  }
}

export const splitRoutes: RouteTable = {
  /** Propose a split for an idea with mixed votes or a halal clash. `exclude` = alternatives already shown. */
  'POST splits/propose': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ ideaId: Id, exclude: z.array(z.string().max(300)).max(20).default([]) }));
      await useDailyQuota(member.uid, 'analyze');
      const db = adminDb();
      const data = await loadTripData(tripId);
      const idea = data.ideas.get(body.ideaId);
      if (!idea) throw new HttpError(404, 'Idea not found');
      const previous = idea.splitId ? data.splits.get(idea.splitId) : undefined;
      if (previous?.status === 'approved') throw new HttpError(409, 'This idea is already split — cancel that split first');
      if (previous && previous.trackA.ideaId !== idea.id) throw new HttpError(409, 'Propose the split from the original idea');
      const status = previous ? previous.sourceStatus : idea.status;
      if (!['mixed', 'backlog', 'voting'].includes(status)) throw new HttpError(409, 'Only ideas on the board can be split');

      const summary = (await db.doc(paths.halalSummary(idea.placeKey)).get()).data() as HalalSummary | undefined;
      const conflicts = ideaConflicts(idea, data.members, { currency: data.trip.currency, trip: data.trip, ...(summary?.tier ? { communityTier: summary.tier } : {}) });
      const groups = splitGroups(idea, data.members, conflicts);
      if (!groups) throw new HttpError(409, 'Everyone is on the same side — there is nothing to split');

      // Find the alternative near the original.
      const exclude = new Set([...body.exclude, ...[...data.ideas.values()].flatMap((i) => (i.place.placeId ? [i.place.placeId] : []))]);
      const bMembers = data.members.filter((m) => groups.b.includes(m.uid));
      const needsHalal = idea.place.category === 'food' && bMembers.some((m) => m.prefs?.halalRequired);
      const known = needsHalal ? (idea.halal?.halalFood?.places ?? []).filter((p) => p.placeId && !exclude.has(p.placeId)) : [];
      const types = needsHalal ? ['halal_restaurant'] : ALT_TYPES[idea.place.category];
      const found = known.length ? known.map((p) => ({ placeId: p.placeId!, name: p.name })) : ((await searchNearby(idea.place.location, types, ALT_RADIUS_M, 10)) ?? []).filter((p) => !exclude.has(p.placeId));
      if (!found.length) throw new HttpError(404, `No ${needsHalal ? 'halal ' : ''}alternative found within ${ALT_RADIUS_M / 1000} km. Try the admin options instead.`);

      const { place } = await placeDetails(found[0].placeId);
      if (place.photoName) {
        const url = await photoUrl(place.photoName);
        if (url) Object.assign(place, { photoUrl: url, photoUrlAt: Date.now() });
      }
      const walkMin = estimateTravelMin(idea.place.location, place.location);
      const altDuration = place.category === idea.place.category ? idea.estDurationMin : DEFAULT_DURATION[place.category];
      const afterMinutes = reunionMinutes(idea.estDurationMin, altDuration, walkMin);
      const why = bMembers.map((m) => {
        if (conflicts.some((c) => c.uid === m.uid && c.severity === 'blocker' && ['halal', 'pork', 'not_friendly'].includes(c.kind))) {
          return `${m.displayName} needs ${NEEDS[m.prefs?.halalTier ?? 'certified']}`;
        }
        const reason = idea.votes[m.uid]?.reason;
        return reason ? `${m.displayName}: “${reason}”` : `${m.displayName} passed on it`;
      });

      const batch = db.batch();
      if (previous) dissolveSplit(batch, tripId, previous, { restoreOriginal: false });
      const altRef = db.collection(paths.ideas(tripId)).doc();
      const sRef = db.collection(paths.splits(tripId)).doc();
      const now = Date.now();
      batch.set(
        altRef,
        Idea.parse({
          id: altRef.id,
          placeKey: paths.placeKey({ placeId: place.placeId }),
          place,
          source: { type: 'split' },
          notes: `Alternative to ${idea.place.name} for ${bMembers.map((m: Member) => m.displayName).join(', ')}`.slice(0, 1000),
          estDurationMin: altDuration,
          analysis: { status: 'pending', at: now },
          status: 'split_pending',
          votes: {},
          splitId: sRef.id,
          createdBy: member.uid,
          createdAt: now,
          updatedAt: now,
        }),
      );
      const split = Split.parse({
        id: sRef.id,
        sourceIdeaId: idea.id,
        sourceStatus: status,
        reason: groups.reason,
        trackA: { ideaId: idea.id, memberUids: groups.a },
        trackB: { ideaId: altRef.id, memberUids: groups.b },
        reunion: { place: { name: idea.place.name, location: idea.place.location, ...(idea.place.placeId ? { placeId: idea.place.placeId } : {}) }, afterMinutes },
        walkMin,
        explanation: splitExplanation({ groups, members: data.members, original: idea.place.name, alternative: place.name, walkMin, afterMinutes, why }),
        status: 'proposed',
        createdBy: member.uid,
        createdAt: now,
      });
      batch.set(sRef, split);
      batch.update(ideaDocRef(tripId, idea.id), { status: 'split_pending', splitId: sRef.id, updatedAt: now });
      logActivity(batch, tripId, member.uid, `${member.displayName} proposed a split: ${idea.place.name} / ${place.name}`);
      await batch.commit();
      return json({ splitId: sRef.id, altIdeaId: altRef.id, split }, { status: 201 });
    },
    { perMinute: 10 },
  ),

  /** Admin: approve a proposal (both go to the backlog as a pair), or reject / cancel a split. */
  'POST splits/decide': withTrip(
    async (req, { tripId, member }) => {
      const { splitId, action } = await readJson(req, z.object({ splitId: Id, action: z.enum(['approve', 'reject']) }));
      const data = await loadTripData(tripId);
      const split = splitsOf(data).find((s) => s.id === splitId);
      if (!split) throw new HttpError(404, 'That split is no longer open');
      const a = data.ideas.get(split.trackA.ideaId);
      const b = data.ideas.get(split.trackB.ideaId);
      if (a?.status === 'scheduled' || b?.status === 'scheduled') throw new HttpError(409, 'Take the split off the timeline first');

      const batch = adminDb().batch();
      if (action === 'approve') {
        if (split.status !== 'proposed') throw new HttpError(409, 'Already approved');
        if (!a || !b) throw new HttpError(404, 'One of the places was removed — propose again');
        batch.update(splitRef(tripId, split.id), { status: 'approved', decidedBy: member.uid });
        [a, b].forEach((i) => batch.update(ideaDocRef(tripId, i.id), { status: 'backlog', updatedAt: Date.now() }));
        logActivity(batch, tripId, member.uid, `${member.displayName} approved the split: ${a.place.name} / ${b.place.name}`);
      } else {
        dissolveSplit(batch, tripId, split, { restoreOriginal: !!a });
        batch.update(splitRef(tripId, split.id), { decidedBy: member.uid });
        logActivity(batch, tripId, member.uid, `${member.displayName} ${split.status === 'approved' ? 'cancelled' : 'rejected'} the split at ${a?.place.name ?? 'a place'}`);
      }
      await batch.commit();
      return json({ ok: true });
    },
    { admin: true, perMinute: 20 },
  ),
};
