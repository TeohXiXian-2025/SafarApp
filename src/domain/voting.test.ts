import { describe, expect, it } from 'vitest';
import type { Conflict } from './conflicts';
import type { Idea, MiddleOption } from './idea';
import { ackKey, groupChoices, needsReconfirm, needsYou, nonGoers, readyForAdmin, statusFromTally, tallyIdea, waitingToChoose } from './voting';

const up = { value: 1 as const, at: 1 };
const down = { value: -1 as const, tag: 'too_expensive' as const, at: 1 };
const ALL = ['ali', 'bob', 'cara', 'dan'];
const idea = (over: Partial<Idea> = {}) => ({ id: 'i1', status: 'voting' as Idea['status'], votes: {}, choices: {}, voters: ALL, ...over }) as Idea;
const opt = (id: string, type: MiddleOption['type']): MiddleOption => ({ id, type, title: id, detail: '' });
const OPTIONS = [opt('a1', 'alternative'), opt('a2', 'alternative'), opt('time', 'timing'), opt('join', 'join'), opt('free', 'free_time')];
const halalBlock: Conflict = { uid: 'ali', name: 'Ali', kind: 'pork', severity: 'blocker', detail: 'Serves pork.' };

describe('tally and status', () => {
  it('waits for every required voter', () => {
    const t = tallyIdea(idea({ votes: { ali: up, bob: up } }), ALL);
    expect(t).toEqual({ up: 2, down: 0, pending: ['cara', 'dan'] });
    expect(statusFromTally(t, false)).toBe('voting');
  });

  it('decides once everyone voted', () => {
    expect(statusFromTally(tallyIdea(idea({ votes: { ali: up, bob: up, cara: up, dan: up } }), ALL), false)).toBe('backlog');
    expect(statusFromTally(tallyIdea(idea({ votes: { ali: down, bob: down, cara: down, dan: down } }), ALL), false)).toBe('rejected');
    expect(statusFromTally(tallyIdea(idea({ votes: { ali: up, bob: down, cara: up, dan: up } }), ALL), false)).toBe('mixed');
  });

  it('after the deadline, non-voters abstain', () => {
    expect(statusFromTally(tallyIdea(idea({ votes: { ali: up } }), ALL), true)).toBe('backlog');
    expect(statusFromTally(tallyIdea(idea({ votes: {} }), ALL), true)).toBe('rejected');
  });

  it('someone who joins later is not waited for, but their vote counts', () => {
    const members = [...ALL, 'eve'];
    const all4 = { ali: up, bob: up, cara: up, dan: up };
    expect(statusFromTally(tallyIdea(idea({ votes: all4 }), members), false)).toBe('backlog');
    expect(statusFromTally(tallyIdea(idea({ votes: { ...all4, eve: down } }), members), false)).toBe('mixed');
  });

  it('someone who leaves no longer counts or blocks', () => {
    const left = ALL.filter((u) => u !== 'dan');
    expect(statusFromTally(tallyIdea(idea({ votes: { ali: up, bob: up, cara: up, dan: down } }), left), false)).toBe('backlog');
    expect(statusFromTally(tallyIdea(idea({ votes: { ali: up, bob: up, cara: up } }), left), false)).toBe('backlog');
  });
});

describe('middle grounds', () => {
  const mixed = (choices: Idea['choices'] = {}, over: Partial<Idea> = {}) =>
    idea({ status: 'mixed', votes: { ali: down, bob: up, cara: down, dan: down }, options: OPTIONS, choices, choiceEndsAt: 1000, ...over });

  it('only the people not going choose', () => {
    expect(nonGoers(mixed(), ALL)).toEqual(['ali', 'cara', 'dan']);
    expect(waitingToChoose(mixed({ ali: { optionId: 'a1', at: 1 } }), ALL)).toEqual(['cara', 'dan']);
  });

  it('groups by choice: same alternative together, join/timing with the main group, free time apart', () => {
    const g = groupChoices(mixed({ ali: { optionId: 'a1', at: 1 }, cara: { optionId: 'a1', at: 1 }, dan: { optionId: 'join', at: 1 } }), ALL);
    expect(g.main).toEqual(['bob', 'dan']);
    expect(g.alternatives.map((a) => [a.option.id, a.uids])).toEqual([['a1', ['ali', 'cara']]]);
    expect(g.freeTime).toEqual([]);
  });

  it('three different choices → main + two alternatives + free time', () => {
    const g = groupChoices(mixed({ ali: { optionId: 'a1', at: 1 }, cara: { optionId: 'a2', at: 1 }, dan: { optionId: 'free', at: 1 } }), ALL);
    expect(g.alternatives.map((a) => a.uids)).toEqual([['ali'], ['cara']]);
    expect(g.freeTime).toEqual(['dan']);
  });

  it('a timing pick keeps them with the group and proposes the time', () => {
    const g = groupChoices(mixed({ ali: { optionId: 'time', at: 1 }, cara: { optionId: 'join', at: 1 }, dan: { optionId: 'join', at: 1 } }), ALL);
    expect(g.main).toEqual(['bob', 'ali', 'cara', 'dan']);
    expect(g.timing?.id).toBe('time');
  });

  it('undecided people get free time when the admin decides', () => {
    const g = groupChoices(mixed({ ali: { optionId: 'a1', at: 1 } }), ALL);
    expect(g.undecided).toEqual(['cara', 'dan']);
    expect(g.freeTime).toEqual(['cara', 'dan']);
  });

  it('a changed vote changes who chooses: 👎 → 👍 drops out of the choosers', () => {
    const i = mixed({ ali: { optionId: 'a1', at: 1 } }, { votes: { ali: up, bob: up, cara: down, dan: down } });
    expect(nonGoers(i, ALL)).toEqual(['cara', 'dan']);
    expect(groupChoices(i, ALL).alternatives).toEqual([]);
  });

  it('the admin can decide when everyone chose, or after the deadline', () => {
    const all = { ali: { optionId: 'a1', at: 1 }, cara: { optionId: 'join', at: 1 }, dan: { optionId: 'free', at: 1 } };
    expect(readyForAdmin(mixed({ ali: { optionId: 'a1', at: 1 } }), ALL, 500)).toBe(false);
    expect(readyForAdmin(mixed({ ali: { optionId: 'a1', at: 1 } }), ALL, 1000)).toBe(true);
    expect(readyForAdmin(mixed(all), ALL, 500)).toBe(true);
  });
});

describe('confirming a 👍 despite a conflict', () => {
  it('asks again when the conflict changes after the vote', () => {
    const vote = { value: 1 as const, at: 1, ack: { key: ackKey([halalBlock]), text: 'I called, they have a halal menu', at: 1 } };
    expect(needsReconfirm(vote, [halalBlock])).toBe(false);
    expect(needsReconfirm(vote, [halalBlock, { ...halalBlock, kind: 'alcohol', severity: 'warning' }])).toBe(true);
    expect(needsReconfirm({ value: 1, at: 1 }, [halalBlock])).toBe(true);
    expect(needsReconfirm({ value: 1, at: 1 }, [{ ...halalBlock, kind: 'budget', severity: 'warning' }])).toBe(false);
  });
});

describe('needsYou', () => {
  it('lists votes, choices, admin decisions and reconfirmations', () => {
    const ideas = [
      idea({ id: 'v' }),
      idea({ id: 'm', status: 'mixed', votes: { ali: down, bob: up, cara: up, dan: up }, options: OPTIONS, choiceEndsAt: 10 }),
      idea({ id: 'r', status: 'backlog', votes: { ali: up, bob: up, cara: up, dan: up } }),
    ];
    const conflicts = (i: { id: string }) => (i.id === 'r' ? [halalBlock] : []);
    expect(needsYou(ideas, 'ali', ALL, false, conflicts, 0).map((n) => `${n.kind}:${n.ideaId}`)).toEqual(['vote:v', 'choose:m', 'reconfirm:r']);
    expect(needsYou(ideas, 'bob', ALL, true, () => [], 20).map((n) => `${n.kind}:${n.ideaId}`)).toEqual(['vote:v', 'decide:m']);
  });
});
