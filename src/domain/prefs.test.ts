import { describe, expect, it } from 'vitest';
import { mergePrefs } from './prefs';
import { MemberPrefs, type Member } from './trip';

const member = (uid: string, prefs?: Partial<MemberPrefs>): Member => ({
  uid,
  role: 'member',
  displayName: uid,
  joinedAt: 0,
  ...(prefs ? { prefs: MemberPrefs.parse(prefs) } : {}),
});

describe('mergePrefs', () => {
  it('intersects hotel budgets and takes the tightest daily budget', () => {
    const g = mergePrefs([
      member('a', { hotelBudget: { min: 100, max: 300 }, dailyBudget: 200 }),
      member('b', { hotelBudget: { min: 150, max: 250 }, dailyBudget: 120 }),
    ]);
    expect(g.hotelBudget).toEqual({ min: 150, max: 250 });
    expect(g.hotelBudgetConflict).toBe(false);
    expect(g.dailyBudget).toBe(120);
  });

  it('flags non-overlapping hotel budgets', () => {
    const g = mergePrefs([
      member('a', { hotelBudget: { min: 400, max: 600 } }),
      member('b', { hotelBudget: { min: 100, max: 200 } }),
    ]);
    expect(g.hotelBudgetConflict).toBe(true);
    expect(g.warnings.join(' ')).toMatch(/don't overlap/);
  });

  it('uses the strictest halal tier among those who require halal', () => {
    const g = mergePrefs([
      member('a', { halalRequired: true, halalTier: 'pork_free' }),
      member('b', { halalRequired: true, halalTier: 'certified' }),
      member('c', { halalRequired: false }),
    ]);
    expect(g.halalRequiredCount).toBe(2);
    expect(g.sharedMealTier).toBe('certified');
    expect(g.warnings.join(' ')).toMatch(/2 of 3 require halal/);
  });

  it('picks the slowest pace and lists who has not answered', () => {
    const g = mergePrefs([member('a', { pace: 'fast' }), member('b', { pace: 'relaxed' }), member('c')]);
    expect(g.pace).toBe('relaxed');
    expect(g.pending.map((m) => m.uid)).toEqual(['c']);
  });

  it('tallies interests', () => {
    const g = mergePrefs([member('a', { interests: ['Food', 'History'] }), member('b', { interests: ['Food'] })]);
    expect(g.interests[0]).toEqual({ label: 'Food', count: 2 });
  });

  it('handles a group with no answers', () => {
    const g = mergePrefs([member('a')]);
    expect(g.hotelBudget).toBeNull();
    expect(g.sharedMealTier).toBeNull();
    expect(g.pace).toBeNull();
  });
});
