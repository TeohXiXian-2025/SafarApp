import { describe, expect, it } from 'vitest';
import { ideaStatusFromVotes, tallyVotes } from './idea';

const v = (value: 1 | -1) => ({ value, at: 0 });
const members = ['a', 'b', 'c'];

describe('idea voting', () => {
  it('stays in voting until everyone has voted', () => {
    const t = tallyVotes({ a: v(1), b: v(1) }, members);
    expect(t).toEqual({ up: 2, down: 0, pending: ['c'] });
    expect(ideaStatusFromVotes(t)).toBe('voting');
  });
  it('unanimous yes → backlog', () => {
    expect(ideaStatusFromVotes(tallyVotes({ a: v(1), b: v(1), c: v(1) }, members))).toBe('backlog');
  });
  it('unanimous no → rejected', () => {
    expect(ideaStatusFromVotes(tallyVotes({ a: v(-1), b: v(-1), c: v(-1) }, members))).toBe('rejected');
  });
  it('split → mixed (split-track candidate)', () => {
    expect(ideaStatusFromVotes(tallyVotes({ a: v(1), b: v(-1), c: v(1) }, members))).toBe('mixed');
  });
  it('admin closing early treats non-voters as abstaining', () => {
    expect(ideaStatusFromVotes(tallyVotes({ a: v(1) }, members), true)).toBe('backlog');
    expect(ideaStatusFromVotes(tallyVotes({ a: v(1), b: v(-1) }, members), true)).toBe('mixed');
    expect(ideaStatusFromVotes(tallyVotes({}, members), true)).toBe('rejected');
  });
  it('ignores votes from people who have left the trip', () => {
    const t = tallyVotes({ a: v(1), b: v(1), c: v(1), gone: v(-1) }, members);
    expect(t.down).toBe(0);
    expect(ideaStatusFromVotes(t)).toBe('backlog');
  });
});

import { summarizeReports } from './idea';

describe('summarizeReports', () => {
  const r = (tier: 'certified' | 'muslim_owned' | 'pork_free' | 'not_halal', ageDays = 1, flags = {}) => ({
    tier,
    flags,
    updatedAt: Date.now() - ageDays * 86_400_000,
  });
  it('needs at least 2 agreeing reports for a consensus', () => {
    expect(summarizeReports([r('muslim_owned')]).tier).toBeUndefined();
    expect(summarizeReports([r('muslim_owned'), r('muslim_owned')]).tier).toBe('muslim_owned');
  });
  it('marks strong disagreement as disputed', () => {
    const s = summarizeReports([r('certified'), r('not_halal')]);
    expect(s.tier).toBeUndefined();
    expect(s.disputed).toBe(true);
  });
  it('weights old reports at half', () => {
    // 2 old "not_halal" (1.0) vs 2 recent "muslim_owned" (2.0) → 67% muslim_owned
    expect(summarizeReports([r('not_halal', 500), r('not_halal', 500), r('muslim_owned'), r('muslim_owned')]).tier).toBe('muslim_owned');
  });
  it('majority flags', () => {
    const s = summarizeReports([r('pork_free', 1, { servesAlcohol: true }), r('pork_free', 1, { servesAlcohol: true }), r('pork_free', 1, {})]);
    expect(s.flags.servesAlcohol).toBe(true);
  });
});
