// Split Tracks: the group goes different ways for one stop and meets back up.
// Built from what the people not going picked (see voting.ts). Pure helpers
// shared by the API and the UI.
import type { SplitTrack } from './plan.js';
import { ceil5 } from './timeline.js';
import type { Member } from './trip.js';

/** Everyone meets back at the original place once the slowest group is back. */
export function reunionAfter(tracks: Pick<SplitTrack, 'key' | 'walkMin' | 'durationMin'>[]): number {
  return ceil5(Math.max(5, ...tracks.map((t) => (t.key === 'A' || t.key === 'F' ? t.durationMin : 2 * t.walkMin + t.durationMin))));
}

const names = (uids: string[], members: Pick<Member, 'uid' | 'displayName'>[]) => {
  const n = uids.map((u) => members.find((m) => m.uid === u)?.displayName ?? 'Someone');
  return n.length <= 2 ? n.join(' and ') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
};
const go = (uids: string[]) => (uids.length === 1 ? 'goes' : 'go');
const has = (uids: string[]) => (uids.length === 1 ? 'has' : 'have');
export const durText = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

export function splitExplanation(tracks: Pick<SplitTrack, 'key' | 'label' | 'memberUids' | 'walkMin'>[], members: Pick<Member, 'uid' | 'displayName'>[], afterMinutes: number): string {
  const main = tracks.find((t) => t.key === 'A');
  const parts = tracks
    .filter((t) => t.memberUids.length)
    .map((t) =>
      t.key === 'A'
        ? `${names(t.memberUids, members)} ${go(t.memberUids)} to ${t.label}.`
        : t.key === 'F'
          ? `${names(t.memberUids, members)} ${has(t.memberUids)} free time nearby.`
          : `${names(t.memberUids, members)} ${go(t.memberUids)} to ${t.label}, ${t.walkMin <= 2 ? 'right next door' : `${t.walkMin} min walk away`}.`,
    );
  return `${parts.join(' ')} Everyone meets back at ${main?.label ?? 'the original place'} after ${durText(afterMinutes)}.`.slice(0, 1000);
}

/** Groups with only one person in them (worth a heads-up in a foreign city). */
export const aloneIn = (tracks: Pick<SplitTrack, 'key' | 'memberUids'>[]) => tracks.filter((t) => t.key !== 'A' && t.memberUids.length === 1);
