// How an idea moves from "someone added it" to "on the plan" — shared by the
// server (which enforces it) and the Idea Board (which explains it):
//
//   voting ──everyone 👍──────────────▶ backlog
//          ──everyone 👎──────────────▶ rejected
//          ──more 👎 than 👍───────────▶ backup (plan B; the admin can reopen it)
//          ──mixed, 👍 ≥ 👎──▶ people not going pick a middle ground (24 h)
//                     ──▶ admin: accept (with groups) → backlog | backup | reject
//
// Votes close when every required voter has voted or after 24 h / when the
// admin closes voting (non-voters abstain). Until then a taken-back vote means
// "wait for me" again. A 👍 despite a conflict (not halal enough, alcohol…) must be
// confirmed with a reason; if the conflict changes later, the member is asked
// again. Votes and choices can change until the admin decides.
import type { Conflict } from './conflicts.js';
import type { Idea, MiddleOption, VoteReasonTag } from './idea.js';
import type { SplitTrackKey } from './plan.js';

export const VOTE_WINDOW_MS = 24 * 3_600_000;
export const CHOICE_WINDOW_MS = 24 * 3_600_000;
/** Groups in a split: the main group + up to two alternative places (+ free time). */
export const MAX_ALTERNATIVES = 2;

type VotingIdea = Pick<Idea, 'votes' | 'voters' | 'votingEndsAt' | 'choices' | 'choiceEndsAt' | 'options' | 'status'>;

/**
 * Members who must vote. While an idea is still open for voting that's
 * everyone in the trip now — someone who joins midway is waited for too (the
 * 24 h deadline doesn't move; if they don't vote by then they abstain). Once
 * decided, it's the members who were asked. Split alternatives (`voters: []`)
 * need no vote.
 */
export const requiredVoters = (idea: Pick<Idea, 'voters'> & { status?: Idea['status'] }, memberIds: string[]) => {
  if (idea.voters?.length === 0) return [];
  if (!idea.voters || idea.status === 'voting') return [...memberIds];
  return idea.voters.filter((u) => memberIds.includes(u));
};

/** Required voters plus anyone who joined later and voted anyway. */
export const countedVoters = (idea: Pick<Idea, 'voters' | 'votes'> & { status?: Idea['status'] }, memberIds: string[]) => {
  const req = requiredVoters(idea, memberIds);
  return [...req, ...memberIds.filter((u) => !req.includes(u) && idea.votes[u])];
};

export interface IdeaTally {
  up: number;
  down: number;
  /** Required voters who haven't voted yet. */
  pending: string[];
}

export function tallyIdea(idea: Pick<Idea, 'voters' | 'votes'> & { status?: Idea['status'] }, memberIds: string[]): IdeaTally {
  const counted = countedVoters(idea, memberIds);
  return {
    up: counted.filter((u) => idea.votes[u]?.value === 1).length,
    down: counted.filter((u) => idea.votes[u]?.value === -1).length,
    pending: requiredVoters(idea, memberIds).filter((u) => !idea.votes[u]),
  };
}

/**
 * Status from the votes alone. `closed` = the admin closed voting or the
 * 24 h ran out: non-voters abstain.
 */
export function statusFromTally(t: IdeaTally, closed: boolean): 'voting' | 'backlog' | 'mixed' | 'backup' | 'rejected' {
  if (!closed && t.pending.length) return 'voting';
  if (t.up + t.down === 0) return closed ? 'rejected' : 'voting';
  if (t.down === 0) return 'backlog';
  if (t.up === 0) return 'rejected';
  // Most of the group said no: don't split the group over it — keep it as a plan B.
  if (t.down > t.up) return 'backup';
  return 'mixed';
}

/** Statuses where votes (and choices) can still change. */
export const OPEN_STATUSES: Idea['status'][] = ['voting', 'mixed'];

export const votingClosed = (idea: Pick<Idea, 'votingEndsAt'>, now: number) => !!idea.votingEndsAt && now >= idea.votingEndsAt;

/** People who voted 👎 — they pick a middle ground. */
export const nonGoers = (idea: VotingIdea, memberIds: string[]) => countedVoters(idea, memberIds).filter((u) => idea.votes[u]?.value === -1);

/** Non-goers who haven't picked yet. */
export const waitingToChoose = (idea: VotingIdea, memberIds: string[]) => nonGoers(idea, memberIds).filter((u) => !idea.choices[u]);

/** The admin can decide once everyone has picked or the 24 h are up. */
export const readyForAdmin = (idea: VotingIdea, memberIds: string[], now: number) =>
  idea.status === 'mixed' && (!waitingToChoose(idea, memberIds).length || (!!idea.choiceEndsAt && now >= idea.choiceEndsAt));

// ─── Confirming a 👍 despite a conflict ──────────────────────────────────────

const CONFIRM_KINDS: Conflict['kind'][] = ['halal', 'pork', 'not_friendly', 'alcohol'];

/** Conflicts a member must explicitly accept before a 👍 counts. */
export const mustConfirm = (mine: Conflict[]) => mine.filter((c) => c.severity === 'blocker' || CONFIRM_KINDS.includes(c.kind));

export const ackKey = (mine: Conflict[]) =>
  mustConfirm(mine)
    .map((c) => `${c.kind}:${c.severity}`)
    .sort()
    .join('|');

/** 👍 given before a conflict appeared or changed → ask again. */
export const needsReconfirm = (vote: Idea['votes'][string] | undefined, mine: Conflict[]) =>
  vote?.value === 1 && mustConfirm(mine).length > 0 && vote.ack?.key !== ackKey(mine);

// ─── Middle grounds → groups ────────────────────────────────────────────────

export interface Groups {
  /** Everyone going to the original place (👍, abstained, "join after all", timing). */
  main: string[];
  alternatives: { option: MiddleOption; uids: string[] }[];
  freeTime: string[];
  /** A timing option someone picked — the admin can apply it for the whole group. */
  timing?: MiddleOption;
  /** Non-goers with no choice yet (they get free time if the admin decides now). */
  undecided: string[];
}

export function groupChoices(idea: VotingIdea, memberIds: string[]): Groups {
  const going = new Set(nonGoers(idea, memberIds));
  const g: Groups = { main: memberIds.filter((u) => !going.has(u)), alternatives: [], freeTime: [], undecided: [] };
  for (const u of going) {
    const c = idea.choices[u];
    const opt = c && idea.options?.find((o) => o.id === c.optionId);
    if (!opt) {
      g.undecided.push(u);
      g.freeTime.push(u);
    } else if (opt.type === 'join' || opt.type === 'timing') {
      g.main.push(u);
      if (opt.type === 'timing') g.timing = opt;
    } else if (opt.type === 'free_time') {
      g.freeTime.push(u);
    } else {
      const grp = g.alternatives.find((a) => a.option.id === opt.id);
      if (grp) grp.uids.push(u);
      else g.alternatives.push({ option: opt, uids: [u] });
    }
  }
  // At most two alternative groups (the biggest); anyone in another gets free time rather than being left out.
  g.alternatives.sort((a, b) => b.uids.length - a.uids.length);
  for (const extra of g.alternatives.slice(MAX_ALTERNATIVES)) g.freeTime.push(...extra.uids);
  g.alternatives = g.alternatives.slice(0, MAX_ALTERNATIVES);
  return g;
}

export const TRACK_KEYS: SplitTrackKey[] = ['A', 'B', 'C'];

// ─── What needs me ──────────────────────────────────────────────────────────

export type NeedKind = 'vote' | 'choose' | 'decide' | 'reconfirm';
export interface Need {
  kind: NeedKind;
  ideaId: string;
}

/** Things waiting on one member across the board (for badges and the "Needs you" strip). */
export function needsYou(
  ideas: (VotingIdea & Pick<Idea, 'id' | 'splitId'>)[],
  me: string,
  memberIds: string[],
  isAdmin: boolean,
  myConflicts: (idea: VotingIdea & Pick<Idea, 'id'>) => Conflict[],
  now: number,
): Need[] {
  const out: Need[] = [];
  for (const i of ideas) {
    if (i.status === 'voting' && requiredVoters(i, memberIds).includes(me) && !i.votes[me]) out.push({ kind: 'vote', ideaId: i.id });
    else if (i.status === 'mixed' && nonGoers(i, memberIds).includes(me) && !i.choices[me]) out.push({ kind: 'choose', ideaId: i.id });
    else if (isAdmin && readyForAdmin(i, memberIds, now)) out.push({ kind: 'decide', ideaId: i.id });
    if (['voting', 'mixed', 'backlog', 'scheduled'].includes(i.status) && needsReconfirm(i.votes[me], myConflicts(i))) out.push({ kind: 'reconfirm', ideaId: i.id });
  }
  return out;
}

export const REASON_HINT: Partial<Record<VoteReasonTag, string>> = {
  halal: 'a halal place nearby',
  too_expensive: 'something cheaper nearby',
  been_before: 'something new nearby',
  not_interested: 'something different nearby',
  too_far: 'free time or a closer option',
  timing: 'a better time, or a rest',
};

// ─── Something to do while the others pray ──────────────────────────────────

/**
 * Whether members who don't pray may do this idea during a prayer break
 * without a new vote: a backlog idea (the group accepted it) that none of
 * them voted 👎 on, or a backup idea every one of them voted 👍 on.
 */
export function goodForWhilePraying(idea: Pick<Idea, 'status' | 'votes'>, uids: string[]): boolean {
  if (!uids.length) return false;
  if (idea.status === 'backlog') return uids.every((u) => idea.votes[u]?.value !== -1);
  if (idea.status === 'backup') return uids.every((u) => idea.votes[u]?.value === 1);
  return false;
}
