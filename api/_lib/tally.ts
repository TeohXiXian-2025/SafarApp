// Shared by the decision routes and the reminders job: making middle grounds,
// closing votes that ran past 24 h, and telling people what changed.
import {
  CHOICE_WINDOW_MS,
  Idea,
  nonGoers,
  readyForAdmin,
  statusFromTally,
  tallyIdea,
  votingClosed,
  waitingToChoose,
  type Member,
  type MiddleOption,
} from '../../src/domain/index.js';
import { adminDb } from './firebaseAdmin.js';
import { buildOptions } from './options.js';
import { notify } from './push.js';
import { ideaDocRef, loadTripData, type TripData } from './schedule.js';
import { logActivity } from './trip.js';

export const STATUS_TEXT: Record<string, string> = {
  backlog: 'everyone approved it — added to the backlog',
  rejected: 'everyone passed on it',
  mixed: 'votes are split — the people not going can pick a middle ground',
};

async function fresh(tripId: string, ideaId: string): Promise<Idea> {
  return Idea.parse((await ideaDocRef(tripId, ideaId).get()).data());
}

/** Middle grounds for `choosers`; keeps options someone already picked. `more` = show different places. */
export async function ensureOptions(tripId: string, data: TripData, ideaId: string, choosers: Member[], more = false): Promise<MiddleOption[]> {
  const idea = await fresh(tripId, ideaId);
  if (idea.options?.length && !more) return idea.options;
  const picked = new Set(Object.values(idea.choices).map((c) => c.optionId));
  const keep = (idea.options ?? []).filter((o) => picked.has(o.id) && o.type !== 'join' && o.type !== 'free_time');
  const shown = (idea.options ?? []).flatMap((o) => (o.place ? [o.place.placeId] : []));
  const onBoard = [...data.ideas.values()].flatMap((i) => (i.place.placeId ? [i.place.placeId] : []));
  const options = await buildOptions({ idea, trip: data.trip, choosers, excludePlaceIds: new Set([...onBoard, ...(more ? shown : [])]), keep });
  await ideaDocRef(tripId, ideaId).update({ options, updatedAt: Date.now() });
  return options;
}

const ideasUrl = (tripId: string, filter: string) => `/t/${tripId}/ideas?filter=${filter}`;
const tz = (data: TripData) => data.trip.destinations[0].timezone;

/** Votes just split: the people not going pick a middle ground (and get options). */
export async function onSplitVotes(tripId: string, data: TripData, idea: Idea) {
  const choosers = nonGoers(idea, data.trip.memberIds);
  await ensureOptions(tripId, data, idea.id, data.members.filter((m) => choosers.includes(m.uid))).catch((e) => console.warn('[options]', e));
  await notify(
    choosers,
    { kind: 'choose', title: `Votes are split on ${idea.place.name}`, body: 'The others still want to go — pick what works for you (you have 24 h).', url: ideasUrl(tripId, 'mixed'), tag: `choose-${idea.id}` },
    { timeZone: tz(data) },
  );
}

/** Everyone not going has picked → the admin's turn. */
export async function onReadyForAdmin(tripId: string, data: TripData, idea: Idea) {
  if (!readyForAdmin(idea, data.trip.memberIds, Date.now())) return;
  await notify(
    [data.trip.adminId],
    { kind: 'decide', title: `Your call: ${idea.place.name}`, body: 'Everyone has picked a middle ground — accept, keep as backup, or reject.', url: ideasUrl(tripId, 'mixed'), tag: `decide-${idea.id}` },
    { timeZone: tz(data) },
  );
}

/** An idea was decided (by votes or the admin). */
export async function onDecided(tripId: string, data: TripData, idea: Idea, status: string, actor?: string) {
  const text: Record<string, [string, string, string]> = {
    backlog: [`✅ ${idea.place.name} is in`, 'It’s in the backlog, ready for the timeline.', 'backlog'],
    rejected: [`${idea.place.name} was passed on`, 'The group decided not to go.', 'rejected'],
    backup: [`${idea.place.name} is a backup`, 'Kept as a plan B.', 'backup'],
  };
  const t = text[status];
  if (!t) return;
  await notify(data.trip.memberIds, { kind: 'decision', title: t[0], body: t[1], url: ideasUrl(tripId, t[2]), tag: `decision-${idea.id}` }, { timeZone: tz(data), except: actor });
}

/** Closes voting that ran past its deadline; returns how many closed. */
export async function closeOverdue(tripId: string, data?: TripData): Promise<number> {
  const d = data ?? (await loadTripData(tripId));
  const now = Date.now();
  const due = [...d.ideas.values()].filter((i) => i.status === 'voting' && votingClosed(i, now));
  if (!due.length) return 0;
  const batch = adminDb().batch();
  const results: [Idea, string][] = [];
  for (const i of due) {
    const status = statusFromTally(tallyIdea(i, d.trip.memberIds), true);
    batch.update(ideaDocRef(tripId, i.id), { status, ...(status === 'mixed' ? { choiceEndsAt: now + CHOICE_WINDOW_MS } : {}), updatedAt: now });
    logActivity(batch, tripId, 'system', `${i.place.name}: voting time is up — ${STATUS_TEXT[status] ?? status}`);
    results.push([i, status]);
  }
  await batch.commit();
  for (const [i, status] of results) {
    if (status === 'mixed') await onSplitVotes(tripId, d, await fresh(tripId, i.id));
    else await onDecided(tripId, d, i, status);
  }
  return due.length;
}

/** People who still have to vote / choose, for the 12 h reminder. */
export const stillToVote = (i: Idea, memberIds: string[]) => tallyIdea(i, memberIds).pending;
export const stillToChoose = (i: Idea, memberIds: string[]) => waitingToChoose(i, memberIds);
