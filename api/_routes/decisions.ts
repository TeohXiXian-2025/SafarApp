// From "someone added it" to "on the plan" (see src/domain/voting.ts):
//   ideas/vote      👍 / 👎 (reason required) / take back — 👍 despite a conflict needs a confirmation
//   ideas/options   middle grounds for the people not going (or for opting out later)
//   ideas/choose    a person not going picks a middle ground
//   ideas/decide    admin: accept (builds the groups) · backup · reject · close voting · reopen
//   ideas/optout    after acceptance: "I can't go anymore" → a middle ground (no approval needed)
//   ideas/optin     back to the main group
//   ideas/sweep     closes voting that ran past its 24 h
//   ideas/comment   comments on an idea
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  ackKey,
  estimateTravelMin,
  GeoPoint,
  CHOICE_WINDOW_MS,
  groupChoices,
  HalalSummary,
  Id,
  Idea,
  IdeaComment,
  ideaConflicts,
  mustConfirm,
  nonGoers,
  OPEN_STATUSES,
  paths,
  statusFromTally,
  tallyIdea,
  VoteReasonTag,
  votingClosed,
  type Conflict,
  type Member,
  type MiddleOption,
} from '../../src/domain/index.js';
import { withTrip } from '../_lib/auth.js';
import { adminDb } from '../_lib/firebaseAdmin.js';
import { HttpError, json, readJson } from '../_lib/http.js';
import { useDailyQuota } from '../_lib/quota.js';
import type { RouteTable } from '../_lib/routes.js';
import { ideaDocRef, leadIdea, loadTripData, type TripData } from '../_lib/schedule.js';
import { applyMove, dissolve } from '../_lib/splits.js';
import { notify } from '../_lib/push.js';
import { closeOverdue, ensureOptions, onDecided, onReadyForAdmin, onSplitVotes, STATUS_TEXT } from '../_lib/tally.js';
import { logActivity } from '../_lib/trip.js';


async function conflictsFor(data: TripData, idea: Idea): Promise<Conflict[]> {
  const summary = (await adminDb().doc(paths.halalSummary(idea.placeKey)).get()).data() as HalalSummary | undefined;
  return ideaConflicts(idea, data.members, { currency: data.trip.currency, trip: data.trip, ...(summary?.tier ? { communityTier: summary.tier } : {}) });
}

async function loadFresh(tripId: string, ideaId: string, tx?: FirebaseFirestore.Transaction): Promise<Idea> {
  const ref = ideaDocRef(tripId, ideaId);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Idea not found');
  return Idea.parse(snap.data());
}

const VoteBody = z.object({
  ideaId: Id,
  value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
  tag: VoteReasonTag.optional(),
  reason: z.string().trim().max(300).optional(),
  /** Confirmation text when voting 👍 despite a conflict. */
  ack: z.string().trim().min(2).max(300).optional(),
});

export const decisionRoutes: RouteTable = {
  'POST ideas/vote': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, VoteBody);
      if (body.value === -1 && !body.tag) throw new HttpError(400, 'Pick a reason for 👎');
      if (body.value === -1 && body.tag === 'other' && !body.reason) throw new HttpError(400, 'Type a short reason');
      const data = await loadTripData(tripId);
      const current = data.ideas.get(body.ideaId);
      if (!current) throw new HttpError(404, 'Idea not found');
      if (current.splitId && data.splits.get(current.splitId)?.tracks.some((t) => t.key !== 'A' && t.ideaId === current.id)) {
        throw new HttpError(409, 'This is an alternative in a split — vote on the original place');
      }

      // 👍 despite a conflict must be confirmed (and is re-asked if the conflict changes).
      const mine = (await conflictsFor(data, current)).filter((c) => c.uid === member.uid);
      const toConfirm = mustConfirm(mine);
      if (body.value === 1 && toConfirm.length && !body.ack) {
        throw new HttpError(409, 'Please confirm you still want to go', { code: 'confirm', conflicts: toConfirm });
      }
      const ack = body.value === 1 && toConfirm.length ? { key: ackKey(mine), text: body.ack!, at: Date.now() } : undefined;

      const now = Date.now();
      const result = await adminDb().runTransaction(async (tx) => {
        const idea = await loadFresh(tripId, body.ideaId, tx);
        const accepted = idea.status === 'backlog' || idea.status === 'scheduled';
        // Re-confirming a 👍 on an accepted idea (the conflict changed since).
        if (accepted && body.value === 1 && idea.votes[member.uid]?.value === 1) {
          tx.update(ideaDocRef(tripId, idea.id), { [`votes.${member.uid}.ack`]: ack ?? FieldValue.delete(), updatedAt: now });
          return { status: idea.status, changed: false };
        }
        if (!OPEN_STATUSES.includes(idea.status)) {
          throw new HttpError(409, accepted ? "Voting is over — use \"I can't go\" on the card to step out" : 'Voting on this idea is closed');
        }
        const votes = { ...idea.votes };
        if (body.value === 0) delete votes[member.uid];
        else votes[member.uid] = { value: body.value, ...(body.tag && body.value === -1 ? { tag: body.tag } : {}), ...(body.reason ? { reason: body.reason } : {}), ...(ack ? { ack } : {}), at: now };
        const next = { ...idea, votes };
        // Until the deadline (or the admin closes voting) a taken-back vote means "wait for me" again.
        const status = statusFromTally(tallyIdea(next, data.trip.memberIds), votingClosed(idea, now));
        // Only people still not going keep a choice.
        const goers = new Set(nonGoers({ ...next, status }, data.trip.memberIds));
        const choices = Object.fromEntries(Object.entries(idea.choices).filter(([u]) => goers.has(u)));
        tx.update(ideaDocRef(tripId, idea.id), {
          votes,
          choices,
          status,
          ...(status === 'mixed' && idea.status !== 'mixed' ? { choiceEndsAt: now + CHOICE_WINDOW_MS } : {}),
          updatedAt: now,
        });
        if (status !== idea.status && status !== 'voting') logActivity(tx, tripId, 'system', `${idea.place.name}: ${STATUS_TEXT[status]}`);
        return { status, changed: status !== idea.status };
      });
      const after = await loadFresh(tripId, body.ideaId);
      if (result.status === 'mixed' && (result.changed || !after.options?.length)) await onSplitVotes(tripId, data, after);
      else if (result.status === 'mixed') await onReadyForAdmin(tripId, data, after);
      else if (result.changed) await onDecided(tripId, data, after, result.status);
      return json({ status: result.status });
    },
    { perMinute: 60 },
  ),

  /** Middle grounds: for the people not going (split votes), or for me stepping out of an accepted idea. */
  'POST ideas/options': withTrip(
    async (req, { tripId, member }) => {
      const { ideaId, more } = await readJson(req, z.object({ ideaId: Id, more: z.boolean().default(false) }));
      await useDailyQuota(member.uid, 'options');
      const data = await loadTripData(tripId);
      const idea = data.ideas.get(ideaId);
      if (!idea) throw new HttpError(404, 'Idea not found');
      const lead = leadIdea(data, idea);
      if (!['mixed', 'backlog', 'scheduled'].includes(lead.status)) throw new HttpError(409, 'Middle grounds are for split votes or accepted ideas');
      const uids = lead.status === 'mixed' ? nonGoers(lead, data.trip.memberIds) : [member.uid];
      const options = await ensureOptions(tripId, data, lead.id, data.members.filter((m) => uids.includes(m.uid)), more);
      return json({ options });
    },
    { perMinute: 10 },
  ),

  /** A person not going picks a middle ground (can change it until the admin decides). */
  'POST ideas/choose': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ ideaId: Id, optionId: z.string().min(1).max(40), note: z.string().trim().max(300).optional() }));
      const data = await loadTripData(tripId);
      await adminDb().runTransaction(async (tx) => {
        const idea = await loadFresh(tripId, body.ideaId, tx);
        if (idea.status !== 'mixed') throw new HttpError(409, 'Choosing is only open while votes are split');
        if (!nonGoers(idea, data.trip.memberIds).includes(member.uid)) throw new HttpError(403, 'Only people who voted 👎 pick a middle ground');
        if (!idea.options?.some((o) => o.id === body.optionId)) throw new HttpError(400, 'That option is no longer available');
        tx.update(ideaDocRef(tripId, idea.id), { [`choices.${member.uid}`]: { optionId: body.optionId, ...(body.note ? { note: body.note } : {}), at: Date.now() }, updatedAt: Date.now() });
      });
      await onReadyForAdmin(tripId, data, await loadFresh(tripId, body.ideaId));
      return json({ ok: true });
    },
    { perMinute: 30 },
  ),

  /**
   * Someone not going suggests their own place instead of Safar's options.
   * It joins the options (others not going can pick it too) and is picked for them.
   */
  'POST ideas/propose': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ ideaId: Id, place: z.object({ placeId: z.string().min(1).max(300), name: z.string().min(1).max(200), location: GeoPoint }) }));
      const data = await loadTripData(tripId);
      const optionId = `own_${body.place.placeId.slice(-12)}`;
      let others: string[] = [];
      let placeName = '';
      await adminDb().runTransaction(async (tx) => {
        const idea = await loadFresh(tripId, body.ideaId, tx);
        if (idea.status !== 'mixed') throw new HttpError(409, 'Suggestions are only open while votes are split');
        const goers = nonGoers(idea, data.trip.memberIds);
        if (!goers.includes(member.uid)) throw new HttpError(403, 'Only people who voted 👎 suggest an alternative');
        if (body.place.placeId === idea.place.placeId) throw new HttpError(400, "That's the place being voted on");
        const walkMin = estimateTravelMin(idea.place.location, body.place.location);
        if (walkMin > 45) throw new HttpError(400, `${body.place.name} is too far from ${idea.place.name} to meet back up — pick somewhere closer.`);
        const options = idea.options ?? [];
        if (options.filter((o) => o.proposedBy).length >= 4 && !options.some((o) => o.id === optionId)) throw new HttpError(409, 'There are already 4 suggestions — pick one of them');
        const option: MiddleOption = {
          id: optionId,
          type: 'alternative',
          title: `Go to ${body.place.name}`,
          detail: `Suggested by ${member.displayName} · ${walkMin} min walk · meet the group back at ${idea.place.name}`,
          place: { placeId: body.place.placeId, name: body.place.name, location: body.place.location, walkMin },
          proposedBy: member.uid,
        };
        const next = [...options.filter((o) => o.id !== optionId), option];
        tx.update(ideaDocRef(tripId, idea.id), { options: next, [`choices.${member.uid}`]: { optionId, at: Date.now() }, updatedAt: Date.now() });
        others = goers.filter((u) => u !== member.uid);
        placeName = idea.place.name;
      });
      await notify(
        others,
        { kind: 'choose', title: `${member.displayName} suggested another place`, body: `Instead of ${placeName}: ${body.place.name}. You can pick it too.`, url: `/t/${tripId}/ideas?filter=mixed`, tag: `choose-${body.ideaId}` },
        { timeZone: data.trip.destinations[0].timezone, except: member.uid },
      );
      await onReadyForAdmin(tripId, data, await loadFresh(tripId, body.ideaId));
      return json({ optionId }, { status: 201 });
    },
    { perMinute: 20 },
  ),

  /** Admin: accept (with the groups people picked) · backup · reject · close voting now · reopen. */
  'POST ideas/decide': withTrip(
    async (req, { tripId, member }) => {
      const { ideaId, action } = await readJson(req, z.object({ ideaId: Id, action: z.enum(['accept', 'backup', 'reject', 'close', 'reopen', 'backlog']) }));
      const data = await loadTripData(tripId);
      const found = data.ideas.get(ideaId);
      if (!found) throw new HttpError(404, 'Idea not found');
      const idea = leadIdea(data, found);
      if (idea.status === 'scheduled') throw new HttpError(409, `${idea.place.name} is on the timeline — take it off first`);
      const split = idea.splitId ? data.splits.get(idea.splitId) : undefined;
      const now = Date.now();
      const log = (text: string) => {
        const b = adminDb().batch();
        logActivity(b, tripId, member.uid, `${member.displayName} ${text}`);
        return b;
      };

      if (action === 'close') {
        if (idea.status !== 'voting') throw new HttpError(409, 'Voting is already closed');
        const status = statusFromTally(tallyIdea(idea, data.trip.memberIds), true);
        const b = log(`closed voting on ${idea.place.name}`);
        // Closing = the deadline is now: non-voters abstain from here on.
        b.update(ideaDocRef(tripId, idea.id), { status, votingEndsAt: now, ...(status === 'mixed' ? { choiceEndsAt: now + CHOICE_WINDOW_MS } : {}), updatedAt: now });
        await b.commit();
        if (status === 'mixed') await onSplitVotes(tripId, data, await loadFresh(tripId, idea.id));
        else await onDecided(tripId, data, idea, status, member.uid);
        return json({ status });
      }

      if (action === 'accept' || action === 'backlog') {
        if (!['mixed', 'voting', 'backup', 'rejected'].includes(idea.status)) throw new HttpError(409, 'Already accepted');
        const groups = idea.status === 'mixed' ? groupChoices(idea, data.trip.memberIds) : null;
        const b = log(`accepted ${idea.place.name}`);
        const autoChoices = Object.fromEntries((groups?.undecided ?? []).map((u) => [`choices.${u}`, { optionId: 'free', auto: true, at: now }]));
        b.update(ideaDocRef(tripId, idea.id), {
          status: 'backlog',
          decidedBy: member.uid,
          ...autoChoices,
          ...(groups?.timing?.window ? { window: groups.timing.window } : {}),
          updatedAt: now,
        });
        await b.commit();
        // Build the groups one by one (each may create an alternative idea).
        for (const g of groups?.alternatives ?? []) await applyMove(tripId, idea.id, g.uids, { kind: 'alt', option: g.option }, member.uid, { reason: 'mixed_votes' });
        if (groups?.freeTime.length) await applyMove(tripId, idea.id, groups.freeTime, { kind: 'free' }, member.uid, { reason: 'mixed_votes' });
        await onDecided(tripId, data, idea, 'backlog', member.uid);
        return json({ status: 'backlog' });
      }

      // backup / reject / reopen: any split goes (people get their choices back if it's reopened).
      const b = log(action === 'backup' ? `kept ${idea.place.name} as a backup` : action === 'reject' ? `rejected ${idea.place.name}` : `reopened voting on ${idea.place.name}`);
      if (split && split.status === 'approved') dissolve(b, tripId, split);
      b.update(ideaDocRef(tripId, idea.id), {
        status: action === 'backup' ? 'backup' : action === 'reject' ? 'rejected' : 'voting',
        ...(action === 'reopen'
          ? { decidedBy: FieldValue.delete(), votingEndsAt: now + 24 * 3_600_000, choices: {}, options: FieldValue.delete(), choiceEndsAt: FieldValue.delete(), window: FieldValue.delete() }
          : { decidedBy: member.uid }),
        updatedAt: now,
      });
      await b.commit();
      if (action !== 'reopen') await onDecided(tripId, data, idea, action === 'backup' ? 'backup' : 'rejected', member.uid);
      return json({ ok: true });
    },
    { admin: true, perMinute: 30 },
  ),

  /** After acceptance: step out to a middle ground (no approval needed — it doesn't change the main plan). */
  'POST ideas/optout': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ ideaId: Id, optionId: z.string().min(1).max(40), note: z.string().trim().max(300).optional() }));
      const data = await loadTripData(tripId);
      const found = data.ideas.get(body.ideaId);
      if (!found) throw new HttpError(404, 'Idea not found');
      const idea = leadIdea(data, found);
      if (idea.status !== 'backlog' && idea.status !== 'scheduled') throw new HttpError(409, 'Only accepted ideas can be stepped out of — vote 👎 instead');
      const option = idea.options?.find((o) => o.id === body.optionId);
      if (!option) throw new HttpError(400, 'That option is no longer available');
      if (option.type === 'timing') throw new HttpError(400, "A different time would change everyone's plan — ask the admin");
      const target = option.type === 'join' ? ({ kind: 'main' } as const) : option.type === 'free_time' ? ({ kind: 'free' } as const) : ({ kind: 'alt', option } as const);
      await applyMove(tripId, idea.id, [member.uid], target, member.uid, { reason: 'opt_out' });
      const b = adminDb().batch();
      b.update(ideaDocRef(tripId, idea.id), { [`choices.${member.uid}`]: { optionId: option.id, ...(body.note ? { note: body.note } : {}), at: Date.now() } });
      logActivity(b, tripId, member.uid, option.type === 'join' ? `${member.displayName} is back with the group at ${idea.place.name}` : `${member.displayName} stepped out of ${idea.place.name}: ${option.title}`);
      await b.commit();
      return json({ ok: true });
    },
    { perMinute: 20 },
  ),

  /** Back to the main group. */
  'POST ideas/optin': withTrip(
    async (req, { tripId, member }) => {
      const { ideaId } = await readJson(req, z.object({ ideaId: Id }));
      const data = await loadTripData(tripId);
      const found = data.ideas.get(ideaId);
      if (!found) throw new HttpError(404, 'Idea not found');
      const idea = leadIdea(data, found);
      await applyMove(tripId, idea.id, [member.uid], { kind: 'main' }, member.uid);
      const b = adminDb().batch();
      b.update(ideaDocRef(tripId, idea.id), { [`choices.${member.uid}`]: FieldValue.delete() });
      logActivity(b, tripId, member.uid, `${member.displayName} is back with the group at ${idea.place.name}`);
      await b.commit();
      return json({ ok: true });
    },
    { perMinute: 20 },
  ),

  /** Closes voting that ran past its deadline (called when the board opens). */
  'POST ideas/sweep': withTrip(async (_req, { tripId }) => json({ closed: await closeOverdue(tripId) }), { perMinute: 6 }),

  'POST ideas/comment': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ ideaId: Id, text: z.string().trim().min(1).max(500), mentions: z.array(Id).max(20).default([]) }));
      const { ideaId, text } = body;
      await useDailyQuota(member.uid, 'comment');
      const idea = await loadFresh(tripId, ideaId);
      const trip = (await loadTripData(tripId)).trip;
      const mentions = [...new Set(body.mentions)].filter((u) => trip.memberIds.includes(u) && u !== member.uid);
      const ref = adminDb().collection(paths.comments(tripId, ideaId)).doc();
      await ref.set(IdeaComment.parse({ id: ref.id, uid: member.uid, text, mentions, at: Date.now() }));
      // @-mentioned people always hear about it…
      await notify(mentions, { kind: 'comment', title: `${member.displayName} mentioned you · ${idea.place.name}`, body: text.slice(0, 140), url: `/t/${tripId}/ideas`, tag: `comment-${idea.id}` }, { timeZone: trip.destinations[0].timezone, except: member.uid });
      // …and the person who added it, everyone who voted, and earlier commenters (throttled).
      const earlier = (await adminDb().collection(paths.comments(tripId, ideaId)).select('uid').get()).docs.map((d) => d.get('uid') as string);
      await notify(
        [idea.createdBy, ...Object.keys(idea.votes), ...earlier].filter((u) => trip.memberIds.includes(u) && !mentions.includes(u)),
        { kind: 'comment', title: `${member.displayName} on ${idea.place.name}`, body: text.slice(0, 140), url: `/t/${tripId}/ideas`, tag: `comment-${idea.id}` },
        { timeZone: trip.destinations[0].timezone, except: member.uid, throttleKey: `comment:${idea.id}`, throttle: 300 },
      );
      return json({ id: ref.id }, { status: 201 });
    },
    { perMinute: 20 },
  ),

  'POST ideas/comment-delete': withTrip(
    async (req, { tripId, member }) => {
      const { ideaId, commentId } = await readJson(req, z.object({ ideaId: Id, commentId: Id }));
      const ref = adminDb().doc(`${paths.comments(tripId, ideaId)}/${commentId}`);
      const snap = await ref.get();
      if (!snap.exists) return json({ ok: true });
      if (snap.data()?.uid !== member.uid && member.role !== 'admin') throw new HttpError(403, 'You can only delete your own comments');
      await ref.delete();
      return json({ ok: true });
    },
    { perMinute: 30 },
  ),
};

