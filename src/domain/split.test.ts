import { describe, expect, it } from 'vitest';
import { reunionMinutes, splitExplanation, splitGroups } from './split';

const members = [{ uid: 'ali', displayName: 'Ali' }, { uid: 'bob', displayName: 'Bob' }, { uid: 'cara', displayName: 'Cara' }];
const up = { value: 1 as const, at: 1 };
const down = { value: -1 as const, at: 1 };

describe('splitGroups', () => {
  it('sends 👎 voters to the alternative', () => {
    expect(splitGroups({ votes: { ali: up, bob: down, cara: up } }, members, [])).toEqual({ a: ['ali', 'cara'], b: ['bob'], reason: 'mixed_votes' });
  });

  it('sends members who cannot go (halal blocker) to the alternative even if they liked it', () => {
    const r = splitGroups({ votes: { ali: up, bob: up, cara: up } }, members, [{ uid: 'ali', severity: 'blocker' }, { uid: 'cara', severity: 'warning' }]);
    expect(r).toEqual({ a: ['bob', 'cara'], b: ['ali'], reason: 'halal_conflict' });
  });

  it('has nothing to split when everyone is on one side', () => {
    expect(splitGroups({ votes: { ali: up, bob: up, cara: up } }, members, [])).toBeNull();
    expect(splitGroups({ votes: { ali: down, bob: down, cara: down } }, members, [])).toBeNull();
  });
});

describe('reunion', () => {
  it('waits for the slower group, walking included', () => {
    expect(reunionMinutes(90, 60, 8)).toBe(90);
    expect(reunionMinutes(60, 60, 8)).toBe(80);
  });

  it('explains who goes where', () => {
    const text = splitExplanation({ groups: { a: ['bob', 'cara'], b: ['ali'], reason: 'halal_conflict' }, members, original: 'Ramen Ya', alternative: 'Halal Ramen', walkMin: 6, afterMinutes: 90, why: ['Ali needs certified halal food'] });
    expect(text).toBe('Bob and Cara go to Ramen Ya. Ali goes to Halal Ramen, 6 min walk away. Ali needs certified halal food. Everyone meets back at Ramen Ya after 1 h 30 min.');
  });
});
