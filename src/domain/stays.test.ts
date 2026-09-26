import { describe, expect, it } from 'vitest';
import { groupHotelBudget, hotelJourneyProblem, nightsWithoutStay, proposeStays, trimProposals, scoreHotel, suggestStayTimes, transportGaps, tripNights, uncoveredNights, type ScoreContext } from './stays';

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

describe('booking a hotel around the flights', () => {
  const KUL = { lat: 2.7456, lng: 101.7072 };
  const SIN = { lat: 1.3644, lng: 103.9915 };
  // SIN 17:00 → KUL 18:05 (both +08:00), and home KUL 10:00 → SIN 11:05 two days later.
  const inbound = { kind: 'flight', carrier: 'MH', number: '602', startLocal: '2026-12-07T17:00', endLocal: '2026-12-07T18:05', startAt: '2026-12-07T17:00:00+08:00', endAt: '2026-12-07T18:05:00+08:00', travellerUids: ['a'], from: { location: SIN, name: 'Changi' }, to: { location: KUL, name: 'KLIA' } };
  const outbound = { kind: 'flight', carrier: 'MH', number: '603', startLocal: '2026-12-09T10:00', endLocal: '2026-12-09T11:05', startAt: '2026-12-09T10:00:00+08:00', endAt: '2026-12-09T11:05:00+08:00', travellerUids: ['a'], from: { location: KUL, name: 'KLIA' }, to: { location: SIN, name: 'Changi' } };
  const stay = (inn: string, out: string) => ({ startLocal: inn, endLocal: out, startAt: `${inn}:00+08:00`, endAt: `${out}:00+08:00`, travellerUids: ['a'], location: KLCC });

  it('refuses a 15:00 check-in before the flight lands, and a check-out after leaving', () => {
    expect(hotelJourneyProblem(stay('2026-12-07T15:00', '2026-12-09T08:00'), [inbound, outbound])).toMatch(/before MH 602 lands at 18:05/);
    expect(hotelJourneyProblem(stay('2026-12-07T19:30', '2026-12-09T12:00'), [inbound, outbound])).toMatch(/after MH 603 leaves at 10:00/);
    expect(hotelJourneyProblem(stay('2026-12-07T19:30', '2026-12-09T07:00'), [inbound, outbound])).toBeNull();
  });

  it("ignores other people's flights", () => {
    expect(hotelJourneyProblem({ ...stay('2026-12-07T15:00', '2026-12-09T12:00'), travellerUids: ['b'] }, [inbound, outbound])).toBeNull();
  });

  it('suggests check-in after landing and check-out before leaving for the airport', () => {
    const s = suggestStayTimes({ checkIn: '2026-12-07', checkOut: '2026-12-09', location: KLCC }, { checkIn: '15:00', checkOut: '12:00' }, [inbound, outbound], ['a']);
    expect(s.checkIn).toBe('2026-12-07T19:35');
    expect(s.checkOut).toBe('2026-12-09T07:00');
    expect(s.notes).toHaveLength(2);
  });
});

describe('transportGaps', () => {
  const trip = { startDate: '2026-12-07', endDate: '2026-12-12', destinations: [{ name: 'Kuala Lumpur', location: KL }, { name: 'Penang', location: PENANG }] };
  const stays = [
    { destIdx: 0, checkIn: '2026-12-07', checkOut: '2026-12-10' },
    { destIdx: 1, checkIn: '2026-12-10', checkOut: '2026-12-12' },
  ];
  const move = (start: string, end: string, from: { lat: number; lng: number }, to: { lat: number; lng: number }) => ({ kind: 'bus', startLocal: start, endLocal: end, from: { location: from }, to: { location: to } });

  it('lists getting there, each city change and getting home until booked', () => {
    expect(transportGaps({ ...trip, stays, bookings: [] }).map((g) => g.kind)).toEqual(['there', 'between', 'home']);
    const all = [move('2026-12-06T23:00', '2026-12-07T07:00', { lat: 1.36, lng: 103.99 }, KL), move('2026-12-10T09:00', '2026-12-10T14:00', KL, PENANG), move('2026-12-12T18:00', '2026-12-12T20:00', PENANG, { lat: 1.36, lng: 103.99 })];
    expect(transportGaps({ ...trip, stays, bookings: all })).toEqual([]);
  });

  it('flags only the missing KL → Penang leg', () => {
    const r = transportGaps({ ...trip, stays, bookings: [move('2026-12-06T23:00', '2026-12-07T07:00', { lat: 1.36, lng: 103.99 }, KL), move('2026-12-12T18:00', '2026-12-12T20:00', PENANG, { lat: 1.36, lng: 103.99 })] });
    expect(r.map((g) => [g.kind, g.from, g.to])).toEqual([['between', 'Kuala Lumpur', 'Penang']]);
  });
});

describe('stays that go missing (Tokyo + Osaka trip)', () => {
  const TOKYO = { name: 'Tokyo', location: { lat: 35.68, lng: 139.76 } };
  const OSAKA = { name: 'Osaka', location: { lat: 34.69, lng: 135.5 } };

  it('re-planning keeps the free nights of a proposal instead of dropping the whole city', () => {
    const proposals = [
      { destIdx: 0, checkIn: '2026-11-10', checkOut: '2026-11-15', center: TOKYO.location },
      { destIdx: 1, checkIn: '2026-11-15', checkOut: '2026-11-18', center: OSAKA.location },
    ];
    // Osaka's picked stay starts a night early: Tokyo keeps 10–14.
    const kept = [{ checkIn: '2026-11-14', checkOut: '2026-11-18' }];
    expect(trimProposals(proposals, kept).map((p) => [p.destIdx, p.checkIn, p.checkOut])).toEqual([[0, '2026-11-10', '2026-11-14']]);
    expect(nightsWithoutStay(tripNights('2026-11-10', '2026-11-18'), kept)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
  });

  it('the city dates decide which city each night is in', () => {
    const r = proposeStays({
      startDate: '2026-11-10',
      endDate: '2026-11-18',
      destinations: [{ ...TOKYO, arriveDate: '2026-11-10', leaveDate: '2026-11-14' }, { ...OSAKA, arriveDate: '2026-11-14', leaveDate: '2026-11-18' }],
      bookings: [],
      stops: [],
    });
    expect(r.map((p) => [p.destIdx, p.checkIn, p.checkOut])).toEqual([
      [0, '2026-11-10', '2026-11-14'],
      [1, '2026-11-14', '2026-11-18'],
    ]);
  });

  it('still asks for the Tokyo → Osaka train when only the Osaka stay exists', () => {
    const gaps = transportGaps({ startDate: '2026-11-10', endDate: '2026-11-18', destinations: [TOKYO, OSAKA], stays: [{ destIdx: 1, checkIn: '2026-11-14', checkOut: '2026-11-18' }], bookings: [] });
    const between = gaps.find((g) => g.kind === 'between');
    expect(between).toMatchObject({ from: 'Tokyo', to: 'Osaka', date: '2026-11-14' });
  });

  it('uses the city dates for the move day, and a booked train clears it', () => {
    const destinations = [{ ...TOKYO, arriveDate: '2026-11-10', leaveDate: '2026-11-13' }, { ...OSAKA, arriveDate: '2026-11-13', leaveDate: '2026-11-18' }];
    expect(transportGaps({ startDate: '2026-11-10', endDate: '2026-11-18', destinations, stays: [], bookings: [] }).find((g) => g.kind === 'between')?.date).toBe('2026-11-13');
    const train = { kind: 'train', startLocal: '2026-11-13T09:00', endLocal: '2026-11-13T11:30', from: { location: TOKYO.location }, to: { location: OSAKA.location } };
    expect(transportGaps({ startDate: '2026-11-10', endDate: '2026-11-18', destinations, stays: [], bookings: [train] }).some((g) => g.kind === 'between')).toBe(false);
  });
});

describe('a city with no booking or plans yet still gets its stay', () => {
  it('KL hotel booked for the first nights → the remaining nights are Penang', () => {
    const r = proposeStays({ startDate: '2026-12-07', endDate: '2026-12-11', destinations: [{ location: KL }, { location: PENANG }], bookings: [hotel('2026-12-07', '2026-12-09')], stops: [] });
    expect(r.map((p) => [p.destIdx, p.checkIn, p.checkOut])).toEqual([
      [0, '2026-12-07', '2026-12-09'],
      [1, '2026-12-09', '2026-12-11'],
    ]);
  });
  it('Osaka hotel booked for the last nights → the first nights are Tokyo', () => {
    const TOKYO = { lat: 35.68, lng: 139.76 };
    const OSAKA = { lat: 34.69, lng: 135.5 };
    const r = proposeStays({ startDate: '2026-11-10', endDate: '2026-11-18', destinations: [{ location: TOKYO }, { location: OSAKA }], bookings: [hotel('2026-11-14', '2026-11-18', OSAKA)], stops: [] });
    expect(r.map((p) => [p.destIdx, p.checkIn, p.checkOut])).toEqual([
      [0, '2026-11-10', '2026-11-14'],
      [1, '2026-11-14', '2026-11-18'],
    ]);
  });
});
