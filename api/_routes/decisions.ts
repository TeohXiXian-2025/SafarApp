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
import { buildOptions } from '../_lib/options.js';
import { useDailyQuota } from '../_lib/quota.js';
import type { RouteTable } from '../_lib/routes.js';
import { ideaDocRef, leadIdea, loadTripData, type TripData } from '../_lib/schedule.js';
import { applyMove, dissolve } from '../_lib/splits.js';
import { logActivity } from '../_lib/trip.js';

const STATUS_TEXT: Record<string, string> = {
  backlog: 'everyone approved it — added to the backlog',
  rejected: 'everyone passed on it',
  mixed: 'votes are split — the people not going can pick a middle ground',
};

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

/** Middle grounds for `choosers`; keeps options someone already picked. `more` = show different places. */
async function ensureOptions(tripId: string, data: TripData, ideaId: string, choosers: Member[], more = false): Promise<MiddleOption[]> {
  const idea = await loadFresh(tripId, ideaId);
  if (idea.options?.length && !more) return idea.options;
  const picked = new Set(Object.values(idea.choices).map((c) => c.optionId));
  const keep = (idea.options ?? []).filter((o) => picked.has(o.id) && o.type !== 'join' && o.type !== 'free_time');
  const shown = (idea.options ?? []).flatMap((o) => (o.place ? [o.place.placeId] : []));
  const onBoard = [...data.ideas.values()].flatMap((i) => (i.place.placeId ? [i.place.placeId] : []));
  const options = await buildOptions({ idea, trip: data.trip, choosers, excludePlaceIds: new Set([...onBoard, ...(more ? shown : [])]), keep });
  await ideaDocRef(tripId, ideaId).update({ options, updatedAt: Date.now() });
  return options;
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
      if (result.status === 'mixed') {
        const idea = await loadFresh(tripId, body.ideaId);
        const choosers = data.members.filter((m) => nonGoers(idea, data.trip.memberIds).includes(m.uid));
        await ensureOptions(tripId, data, idea.id, choosers).catch((e) => console.warn('[options]', e));
      }
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
      return json({ ok: true });
    },
    { perMinute: 30 },
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
        if (status === 'mixed') await ensureOptions(tripId, data, idea.id, data.members.filter((m) => nonGoers(idea, data.trip.memberIds).includes(m.uid))).catch(() => {});
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
  'POST ideas/sweep': withTrip(
    async (_req, { tripId }) => {
      const now = Date.now();
      const data = await loadTripData(tripId);
      const due = [...data.ideas.values()].filter((i) => i.status === 'voting' && votingClosed(i, now));
      const batch = adminDb().batch();
      const mixed: string[] = [];
      for (const i of due) {
        const status = statusFromTally(tallyIdea(i, data.trip.memberIds), true);
        batch.update(ideaDocRef(tripId, i.id), { status, ...(status === 'mixed' ? { choiceEndsAt: now + CHOICE_WINDOW_MS } : {}), updatedAt: now });
        logActivity(batch, tripId, 'system', `${i.place.name}: voting time is up — ${STATUS_TEXT[status] ?? status}`);
        if (status === 'mixed') mixed.push(i.id);
      }
      if (due.length) await batch.commit();
      for (const id of mixed) {
        const i = data.ideas.get(id)!;
        await ensureOptions(tripId, data, id, data.members.filter((m) => nonGoers(i, data.trip.memberIds).includes(m.uid))).catch(() => {});
      }
      return json({ closed: due.length });
    },
    { perMinute: 6 },
  ),

  'POST ideas/comment': withTrip(
    async (req, { tripId, member }) => {
      const { ideaId, text } = await readJson(req, z.object({ ideaId: Id, text: z.string().trim().min(1).max(500) }));
      await useDailyQuota(member.uid, 'comment');
      await loadFresh(tripId, ideaId);
      const ref = adminDb().collection(paths.comments(tripId, ideaId)).doc();
      await ref.set(IdeaComment.parse({ id: ref.id, uid: member.uid, text, at: Date.now() }));
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

