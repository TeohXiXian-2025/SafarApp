// Split Tracks: when the group disagrees on a place (mixed votes) or it clashes
// with someone's halal needs, part of the group goes somewhere nearby instead
// and everyone meets back up. Pure helpers shared by the API and the UI.
import type { Conflict } from './conflicts.js';
import type { Idea } from './idea.js';
import { ceil5 } from './timeline.js';
import type { Member } from './trip.js';

export interface SplitGroups {
  /** Go to the original place. */
  a: string[];
  /** Go to the alternative. */
  b: string[];
  reason: 'mixed_votes' | 'halal_conflict';
}

/**
 * Who goes where: members who voted 👎 or can't go as-is (a blocker, e.g. not
 * halal enough) take the alternative; everyone else keeps the original.
 * null when there's nobody on one side.
 */
export function splitGroups(idea: Pick<Idea, 'votes'>, members: Pick<Member, 'uid'>[], conflicts: Pick<Conflict, 'uid' | 'severity'>[]): SplitGroups | null {
  const blocked = new Set(conflicts.filter((c) => c.severity === 'blocker').map((c) => c.uid));
  const b = members.filter((m) => blocked.has(m.uid) || idea.votes[m.uid]?.value === -1).map((m) => m.uid);
  const a = members.filter((m) => !b.includes(m.uid)).map((m) => m.uid);
  if (!a.length || !b.length) return null;
  return { a, b, reason: b.some((u) => blocked.has(u)) ? 'halal_conflict' : 'mixed_votes' };
}

/** Both groups start together; B walks over, visits, walks back; everyone meets at A. */
export const reunionMinutes = (durA: number, durB: number, walkMin: number) => ceil5(Math.max(durA, walkMin + durB + walkMin));

const names = (uids: string[], members: Pick<Member, 'uid' | 'displayName'>[]) => {
  const n = uids.map((u) => members.find((m) => m.uid === u)?.displayName ?? 'Someone');
  return n.length <= 2 ? n.join(' and ') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
};
const go = (uids: string[]) => (uids.length === 1 ? 'goes' : 'go');
const dur = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

export function splitExplanation(opts: {
  groups: SplitGroups;
  members: Pick<Member, 'uid' | 'displayName'>[];
  original: string;
  alternative: string;
  walkMin: number;
  afterMinutes: number;
  why: string[];
}): string {
  const { groups, members } = opts;
  const why = opts.why.length ? ` ${opts.why.slice(0, 3).join('; ')}.` : '';
  return (
    `${names(groups.a, members)} ${go(groups.a)} to ${opts.original}. ` +
    `${names(groups.b, members)} ${go(groups.b)} to ${opts.alternative}, ${opts.walkMin} min walk away.${why} ` +
    `Everyone meets back at ${opts.original} after ${dur(opts.afterMinutes)}.`
  ).slice(0, 1000);
}
