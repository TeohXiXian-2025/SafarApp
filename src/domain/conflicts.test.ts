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
  it('"Listed as halal" never reads as unconfirmed; only "certified only" asks for the certificate', () => {
    const listed = idea({ source: 'google' });
    expect(ideaConflicts(listed, [member('a', { halalRequired: true, halalTier: 'muslim_owned' })])).toEqual([]);
    expect(ideaConflicts(idea({ source: 'osm', tier: 'muslim_owned' }), [member('a', { halalRequired: true, halalTier: 'muslim_owned' })])).toEqual([]);
    const [c] = ideaConflicts(idea({ source: 'google', tier: 'muslim_owned' }), [member('a', { halalRequired: true, halalTier: 'certified' })]);
    expect(c).toMatchObject({ kind: 'halal', severity: 'warning' });
    expect(c.detail).toMatch(/listed as halal on Google Maps/);
  });
  it('community consensus overrides the listing', () => {
    const cs = ideaConflicts(idea({ tier: 'certified', source: 'google' }), [member('a', { halalRequired: true, halalTier: 'certified' })], { communityTier: 'pork_free' });
    expect(cs[0].kind).toBe('halal');
  });
  it('prayer-far only matters to members who want prayer breaks', () => {
    const far = idea({ prayer: { access: 'far', places: [] } }, { category: 'attraction' });
    expect(ideaConflicts(far, [member('a', { prayerReminders: true }), member('b', { prayerReminders: false })]).map((c) => c.uid)).toEqual(['a']);
  });
  it('prayer-far suggests going between prayers', () => {
    const far = idea({ prayer: { access: 'far', places: [] } }, { category: 'attraction', location: { lat: 3.139, lng: 101.6869 } });
    const trip = { startDate: '2026-10-12', endDate: '2026-10-14', destinations: [{ name: 'KL', location: { lat: 3.1, lng: 101.7 }, timezone: 'Asia/Kuala_Lumpur', countryCode: 'MY' }] };
    const [c] = ideaConflicts(far, [member('a', { prayerReminders: true })], { trip });
    expect(c.detail).toMatch(/Works if you go .*after (Dhuhr|Asr|Maghrib)|morning/);
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
