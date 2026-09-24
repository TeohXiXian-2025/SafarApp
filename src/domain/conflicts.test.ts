import { describe, expect, it } from 'vitest';
import { conflictKey, ideaConflicts } from './conflicts';
import { Idea, type HalalAssessment } from './idea';
import { MemberPrefs, type Member } from './trip';

const member = (uid: string, prefs?: Partial<MemberPrefs>): Member => ({
  uid,
  role: 'member',
  displayName: uid,
  joinedAt: 0,
  ...(prefs ? { prefs: MemberPrefs.parse(prefs) } : {}),
});

const idea = (halal: Partial<HalalAssessment>, place: Partial<Idea['place']> = {}): Idea =>
  Idea.parse({
    id: 'i1',
    placeKey: 'g_x',
    place: { name: 'X', location: { lat: 1, lng: 1 }, category: 'food', ...place },
    source: { type: 'manual' },
    status: 'voting',
    createdBy: 'a',
    createdAt: 0,
    updatedAt: 0,
    halal: { verdict: 'friendly', reasons: [], flags: {}, source: 'ai_estimate', confidence: 0.6, assessedAt: 0, ...halal },
  });

describe('ideaConflicts', () => {
  it('flags a pork-free restaurant for someone who needs certified halal', () => {
    const cs = ideaConflicts(idea({ tier: 'pork_free' }), [member('aisyah', { halalRequired: true, halalTier: 'certified' }), member('john', { halalRequired: false })]);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ uid: 'aisyah', kind: 'halal', severity: 'blocker' });
  });
  it('accepts a stricter tier than required', () => {
    expect(ideaConflicts(idea({ tier: 'certified' }), [member('a', { halalRequired: true, halalTier: 'muslim_owned' })])).toEqual([]);
  });
  it('warns when halal status is unknown, blocks on pork', () => {
    expect(ideaConflicts(idea({}), [member('a', { halalRequired: true, halalTier: 'pork_free' })])[0].severity).toBe('warning');
    expect(ideaConflicts(idea({ tier: 'muslim_owned', flags: { servesPork: true } }), [member('a', { halalRequired: true })])[0].kind).toBe('pork');
  });
  it('community consensus overrides the listing', () => {
    const cs = ideaConflicts(idea({ tier: 'certified', source: 'google' }), [member('a', { halalRequired: true, halalTier: 'certified' })], { communityTier: 'pork_free' });
    expect(cs[0].kind).toBe('halal');
  });
  it('prayer-far only matters to members who want prayer breaks', () => {
    const far = idea({ prayer: { access: 'far', places: [] } }, { category: 'attraction' });
    expect(ideaConflicts(far, [member('a', { prayerReminders: true }), member('b', { prayerReminders: false })]).map((c) => c.uid)).toEqual(['a']);
  });
  it('budget hint for pricey food against a small daily budget', () => {
    const cs = ideaConflicts(idea({ tier: 'certified' }, { priceLevel: 4 }), [member('a', { dailyBudget: 150 })], { currency: 'MYR' });
    expect(cs[0]).toMatchObject({ kind: 'budget', severity: 'warning' });
  });
  it('members without preferences never conflict; key is stable', () => {
    const cs = ideaConflicts(idea({ verdict: 'not_friendly' }), [member('x'), member('a', { halalRequired: true })]);
    expect(cs.map((c) => c.uid)).toEqual(['a']);
    expect(conflictKey(cs)).toBe('a:not_friendly:blocker');
  });
});
