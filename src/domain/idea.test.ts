import { describe, expect, it } from 'vitest';
import { summarizeReports, trustWeight } from './idea';

const now = Date.parse('2026-09-25T00:00:00Z');
const r = (uid: string, tier: 'certified' | 'muslim_owned' | 'pork_free' | 'not_halal', ageDays = 1) => ({ uid, tier, flags: {}, updatedAt: now - ageDays * 86_400_000 });

describe('trustWeight', () => {
  it('new reporters count 1; track record moves it between 0.5 and 1.5', () => {
    expect(trustWeight(null)).toBe(1);
    expect(trustWeight({ agree: 3, disagree: 0 })).toBeCloseTo(1.3);
    expect(trustWeight({ agree: 20, disagree: 0 })).toBe(1.5);
    expect(trustWeight({ agree: 1, disagree: 2 })).toBeCloseTo(0.7);
    expect(trustWeight({ agree: 0, disagree: 9 })).toBe(0.5);
  });
});

describe('summarizeReports', () => {
  it('two agreeing reports settle it; one each way is disputed', () => {
    expect(summarizeReports([r('a', 'muslim_owned'), r('b', 'muslim_owned')], now).tier).toBe('muslim_owned');
    const split = summarizeReports([r('a', 'muslim_owned'), r('b', 'not_halal')], now);
    expect(split.tier).toBeUndefined();
    expect(split.disputed).toBe(true);
  });

  it('trusted reporters outweigh unreliable ones', () => {
    const reports = [r('good', 'not_halal'), r('bad1', 'muslim_owned'), r('bad2', 'muslim_owned')];
    // Equal trust: 2 of 3 (67%) says Muslim-owned.
    expect(summarizeReports(reports, now).tier).toBe('muslim_owned');
    const weights: Record<string, number> = { good: 1.5, bad1: 0.5, bad2: 0.5 };
    // 1.5 vs 1.0 → 60% for not_halal.
    expect(summarizeReports(reports, now, (u) => weights[u]).tier).toBe('not_halal');
  });

  it('reports older than a year count half', () => {
    const s = summarizeReports([r('a', 'pork_free', 400), r('b', 'muslim_owned'), r('c', 'muslim_owned', 500)], now);
    expect(s.counts).toEqual({ pork_free: 0.5, muslim_owned: 1.5 });
  });
});
