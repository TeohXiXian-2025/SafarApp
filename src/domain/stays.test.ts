import { describe, expect, it } from 'vitest';
import { groupHotelBudget, proposeStays, scoreHotel, tripNights, uncoveredNights, type ScoreContext } from './stays';

const KL = { lat: 3.139, lng: 101.6869 };
const PENANG = { lat: 5.4141, lng: 100.3288 };
const KLCC = { lat: 3.1579, lng: 101.7116 };
const hotel = (start: string, end: string, location = KL) => ({ kind: 'hotel', startLocal: `${start}T15:00`, endLocal: `${end}T12:00`, to: { location } });

describe('nights', () => {
  it('a 4-day trip has 3 nights; flags the ones without a hotel', () => {
    const nights = tripNights('2026-12-07', '2026-12-10');
    expect(nights).toEqual(['2026-12-07', '2026-12-08', '2026-12-09']);
    expect(uncoveredNights(nights, [hotel('2026-12-07', '2026-12-09')])).toEqual(['2026-12-09']);
    expect(tripNights('2026-12-07', '2026-12-07')).toEqual([]);
  });
});

describe('proposeStays', () => {
  const base = { startDate: '2026-12-07', endDate: '2026-12-12', destinations: [{ location: KL }, { location: PENANG }] };

  it('no clues: shares the nights over the cities in order', () => {
    const s = proposeStays({ ...base, bookings: [], stops: [] });
    expect(s.map((x) => [x.destIdx, x.checkIn, x.checkOut])).toEqual([
      [0, '2026-12-07', '2026-12-10'],
      [1, '2026-12-10', '2026-12-12'],
    ]);
  });

  it('follows the timeline and a train to Penang, centred on the stops', () => {
    const s = proposeStays({
      ...base,
      bookings: [{ kind: 'train', startLocal: '2026-12-10T08:00', endLocal: '2026-12-10T12:30', from: { location: KL }, to: { location: PENANG } }],
      stops: [
        { day: '2026-12-07', start: '10:00', name: 'Petronas Twin Towers', location: KLCC },
        { day: '2026-12-08', start: '10:00', name: 'Batu Caves', location: { lat: 3.2379, lng: 101.684 } },
      ],
    });
    expect(s.map((x) => [x.destIdx, x.checkIn, x.checkOut])).toEqual([
      [0, '2026-12-07', '2026-12-10'],
      [1, '2026-12-10', '2026-12-12'],
    ]);
    expect(s[0].center.lat).toBeCloseTo((KLCC.lat + 3.2379) / 2, 4);
    expect(['Petronas Twin Towers', 'Batu Caves']).toContain(s[0].nearName);
    expect(s[1].center).toEqual(PENANG);
  });

  it('a booked hotel decides its nights', () => {
    const s = proposeStays({ ...base, bookings: [hotel('2026-12-07', '2026-12-11', PENANG)], stops: [] });
    expect(s.map((x) => [x.destIdx, x.checkIn, x.checkOut])).toEqual([[1, '2026-12-07', '2026-12-12']]);
  });
});

describe('groupHotelBudget', () => {
  it('uses where budgets overlap', () => {
    expect(groupHotelBudget([{ hotelBudget: { min: 100, max: 300 } }, { hotelBudget: { min: 150, max: 250 } }, undefined] as never)).toEqual({ min: 150, max: 250, overlap: true, people: 2 });
  });
  it("falls back to the middle when they don't", () => {
    const b = groupHotelBudget([{ hotelBudget: { min: 50, max: 100 } }, { hotelBudget: { min: 300, max: 500 } }, { hotelBudget: { min: 120, max: 200 } }] as never);
    expect(b?.overlap).toBe(false);
    expect(b).toMatchObject({ min: 120, max: 200 });
  });
  it('null when nobody set one', () => expect(groupHotelBudget([undefined])).toBeNull());
});

describe('scoreHotel', () => {
  const ctx: ScoreContext = { budget: { min: 15000, max: 30000 }, priorities: [[], []], muslim: true, money: (m) => `RM ${m / 100}` };
  const h = { amenities: [], kind: 'hotel' as const, rating: 4.3, reviews: 2000, travelMin: 10, mosqueM: 400, halalNearby: 8 };

  it('prefers in-budget, close, well-rated, near a mosque', () => {
    const good = scoreHotel({ ...h, nightlyMinor: 24000 }, ctx);
    const pricey = scoreHotel({ ...h, nightlyMinor: 45000 }, ctx);
    const far = scoreHotel({ ...h, nightlyMinor: 24000, travelMin: 40 }, ctx);
    const noMosque = scoreHotel({ ...h, nightlyMinor: 24000, mosqueM: undefined, halalNearby: 0 }, ctx);
    expect(good.score).toBeGreaterThan(pricey.score);
    expect(good.score).toBeGreaterThan(far.score);
    expect(good.score).toBeGreaterThan(noMosque.score);
    expect(good.why).toEqual(expect.arrayContaining(['Within budget', '~10 min to your stops', 'Mosque 400 m', '8 halal places nearby']));
    expect(pricey.why).toContain('RM 150 over budget');
  });

  it("the group's priorities change the ranking", () => {
    const cheapFar = { ...h, nightlyMinor: 12000, travelMin: 30 };
    const dearClose = { ...h, nightlyMinor: 32000, travelMin: 6 };
    const thrifty = { ...ctx, priorities: [['budget_first'], ['budget_first']] as ScoreContext['priorities'] };
    expect(scoreHotel(cheapFar, thrifty).score).toBeGreaterThan(scoreHotel(dearClose, thrifty).score);
    expect(scoreHotel(dearClose, ctx).score).toBeGreaterThan(scoreHotel(cheapFar, ctx).score);
  });

  it('free breakfast counts; paid breakfast does not', () => {
    const want = { ...ctx, priorities: [['breakfast_included']] as ScoreContext['priorities'] };
    const free = scoreHotel({ ...h, nightlyMinor: 20000, amenities: ['Free breakfast'] }, want);
    const paid = scoreHotel({ ...h, nightlyMinor: 20000, amenities: ['Breakfast ($)'] }, want);
    expect(free.score).toBeGreaterThan(paid.score);
    expect(free.why).toContain('Free breakfast');
  });
});
