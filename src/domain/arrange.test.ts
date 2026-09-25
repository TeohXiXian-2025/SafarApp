import { describe, expect, it } from 'vitest';
import { arrangeTrip, dayFrames, orderByDistance, prayersInGaps, timeSequence, type DayFrame, type Unit } from './arrange';
import type { DayPrayers } from './prayer';

const h = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// KL-like prayer times.
const PRAYERS: DayPrayers = { date: '2026-12-07', sunrise: h('07:05'), times: { fajr: h('05:50'), dhuhr: h('13:05'), asr: h('16:25'), maghrib: h('19:10'), isha: h('20:25') } };
const HOTEL = { lat: 3.1579, lng: 101.6995 };
const near = (dLat: number, dLng = 0) => ({ lat: HOTEL.lat + dLat, lng: HOTEL.lng + dLng });
const frame = (over: Partial<DayFrame> = {}): DayFrame => ({ day: '2026-12-07', start: h('09:00'), end: h('20:30'), base: HOTEL, blocks: [], prayers: null, ...over });
const flat = () => 10; // every hop 10 min
const unit = (id: string, duration: number, over: Partial<Unit> = {}): Unit => ({ id, loc: HOTEL, duration, ...over });

describe('timeSequence', () => {
  it('packs stops with travel time from the hotel', () => {
    const t = timeSequence(frame(), [unit('a', 60), unit('b', 90)], { strict: true, travel: flat });
    expect(t.placed.map((p) => [p.id, clock(p.start), clock(p.end)])).toEqual([
      ['a', '09:10', '10:10'],
      ['b', '10:20', '11:50'],
    ]);
    expect(t.prayers).toEqual([]);
  });

  it('prays Dhuhr before heading to the next stop once it is due', () => {
    const t = timeSequence(frame({ prayers: PRAYERS }), [unit('a', 225, { prayerWalkMin: 5 }), unit('b', 60)], { strict: true, travel: flat });
    // a 09:10–12:55; Dhuhr 13:05 is due before we'd reach b (13:05) → pray 13:05–13:30 near a, then b.
    expect(t.prayers.map((p) => [p.key, clock(p.start), clock(p.end), p.afterId])).toEqual([['dhuhr', '13:05', '13:30', 'a']]);
    expect(clock(t.placed[1].start)).toBe('13:40');
  });

  it('prays on arrival when a prayer would run out during a long visit', () => {
    // Arrive 19:00; Maghrib 19:10 must be prayed by Isha 20:25 — a 2 h visit would miss it, so pray first.
    const t = timeSequence(frame({ start: h('18:50'), end: h('23:00'), prayers: PRAYERS }), [unit('night', 120, { prayerWalkMin: 0 })], { strict: true, travel: flat });
    expect(clock(t.placed[0].start)).toBe('19:30');
    // Isha (20:25, until 23:25) falls during the visit and is prayed right after it.
    expect(t.prayers.map((p) => [p.key, clock(p.start)])).toEqual([
      ['maghrib', '19:10'],
      ['isha', '21:30'],
    ]);
  });

  it('still owes Asr when the day starts late in its window', () => {
    const t = timeSequence(frame({ start: h('18:40'), end: h('23:00'), prayers: PRAYERS }), [unit('x', 30)], { strict: true, travel: flat });
    expect(t.prayers[0]).toMatchObject({ key: 'asr', start: h('18:40') });
  });

  it('waits for opening time, and drops closed / non-fitting stops when strict', () => {
    const mon = ['Monday: 11:00 AM – 3:00 PM', 'Tuesday: Closed'];
    const t = timeSequence(frame(), [unit('opens11', 60, { hours: mon }), unit('closedTue', 60, { hours: ['Monday: Closed'] })], { strict: true, travel: flat });
    expect(clock(t.placed[0].start)).toBe('11:00');
    expect(t.unfit).toEqual([{ id: 'closedTue', reason: 'closed' }]);
    const tooLong = timeSequence(frame(), [unit('x', 300, { hours: mon })], { strict: true, travel: flat });
    expect(tooLong.unfit).toEqual([{ id: 'x', reason: 'hours' }]);
  });

  it('keeps everything when reordering by hand (not strict)', () => {
    const t = timeSequence(frame({ end: h('10:00') }), [unit('a', 120), unit('b', 120)], { strict: false, travel: flat });
    expect(t.placed.map((p) => p.id)).toEqual(['a', 'b']);
    expect(t.unfit).toEqual([]);
  });

  it('steps around a locked train', () => {
    const t = timeSequence(frame({ blocks: [{ start: h('10:00'), end: h('12:00') }] }), [unit('a', 60), unit('b', 60)], { strict: true, travel: flat });
    expect(t.placed.map((p) => clock(p.start))).toEqual(['12:15', '13:25']);
  });
});

describe('orderByDistance', () => {
  it('visits stops along a line instead of zig-zagging', () => {
    const us = [unit('far', 60, { loc: near(0.03) }), unit('mid', 60, { loc: near(0.02) }), unit('close', 60, { loc: near(0.01) })];
    expect(orderByDistance(HOTEL, us).map((u) => u.id)).toEqual(['close', 'mid', 'far']);
  });
});

describe('arrangeTrip', () => {
  const days = ['2026-12-07', '2026-12-08'].map((day) => frame({ day }));

  it('puts each area on its own day', () => {
    const north = [unit('n1', 90, { loc: near(0.2) }), unit('n2', 90, { loc: near(0.21) })];
    const south = [unit('s1', 90, { loc: near(-0.2) }), unit('s2', 90, { loc: near(-0.21) })];
    const r = arrangeTrip(days, [north[0], south[0], north[1], south[1]], { maxStops: 5, travel: flat });
    const ids = r.days.map((d) => d.order.map((u) => u.id).sort());
    expect(ids).toEqual(expect.arrayContaining([['n1', 'n2'], ['s1', 's2']]));
    expect(r.unplaced).toEqual([]);
  });

  it('moves a meal to lunch time', () => {
    const r = arrangeTrip([frame()], [unit('lunch', 60, { food: true, loc: near(0.001) }), unit('museum', 120, { loc: near(0.002) }), unit('park', 90, { loc: near(0.003) })], { maxStops: 5, travel: flat });
    const lunch = r.days[0].timing.placed.find((p) => p.id === 'lunch')!;
    expect(lunch.start).toBeGreaterThanOrEqual(h('11:30'));
    expect(lunch.start).toBeLessThanOrEqual(h('14:00'));
  });

  it('respects the pace and lists what does not fit', () => {
    const us = Array.from({ length: 5 }, (_, i) => unit(`u${i}`, 60, { loc: near(i * 0.001) }));
    const r = arrangeTrip([frame()], us, { maxStops: 3, travel: flat });
    expect(r.days[0].order).toHaveLength(3);
    expect(r.unplaced).toHaveLength(2);
    expect(r.unplaced[0].reason).toBe('time');
  });

  it('moves a stop closed on one day to a day it is open', () => {
    const r = arrangeTrip(days, [unit('tueOnly', 60, { hours: ['Monday: Closed', 'Tuesday: 9:00 AM – 5:00 PM'] }), unit('any', 60)], { maxStops: 5, travel: flat });
    const tue = r.days.find((d) => d.day === '2026-12-08')!;
    expect(tue.order.map((u) => u.id)).toContain('tueOnly');
    expect(r.unplaced).toEqual([]);
  });
});

describe('prayersInGaps', () => {
  const stops = [
    { id: 'a', start: h('10:00'), end: h('13:00') },
    { id: 'b', start: h('13:40'), end: h('15:00') },
    { id: 'c', start: h('15:00'), end: h('18:00') },
  ];

  it('uses the first free gap after the prayer time', () => {
    const r = prayersInGaps(PRAYERS, stops, HOTEL);
    // Dhuhr fits between a and b; Asr (16:25–19:10) only after c ends at 18:00.
    expect(r.prayers.map((p) => [p.key, clock(p.start), p.afterId])).toEqual([
      ['dhuhr', '13:05', 'a'],
      ['asr', '18:00', 'c'],
    ]);
  });

  it('reports a prayer with no gap before its time runs out', () => {
    // Back-to-back from 15:00 to 21:00: no 30-min gap for Asr (until 19:10) or Maghrib (until 20:25).
    const busy = [...stops.slice(0, 2), { id: 'c', start: h('15:00'), end: h('19:05') }, { id: 'd', start: h('19:05'), end: h('21:00') }];
    const r = prayersInGaps(PRAYERS, busy, HOTEL);
    expect(r.missed.map((m) => m.key)).toEqual(['asr', 'maghrib']);
  });

  it('skips prayers before the day starts or after it ends', () => {
    const r = prayersInGaps(PRAYERS, [{ id: 'm', start: h('09:00'), end: h('11:00') }], HOTEL);
    expect(r.prayers).toEqual([]);
    expect(r.missed).toEqual([]);
  });
});

describe('dayFrames', () => {
  const KL = { location: { lat: 3.139, lng: 101.6869 }, timezone: 'Asia/Kuala_Lumpur', countryCode: 'MY' };
  const TOKYO = { location: { lat: 35.6764, lng: 139.65 }, timezone: 'Asia/Tokyo', countryCode: 'JP' };
  const flight = { kind: 'flight' as const, startLocal: '2026-12-01T23:30', endLocal: '2026-12-02T07:40', from: { location: KL.location }, to: { location: { lat: 35.55, lng: 139.78 } } };
  const hotel = { kind: 'hotel' as const, startLocal: '2026-12-02T15:00', endLocal: '2026-12-04T11:00', to: { location: { lat: 35.69, lng: 139.7 } } };
  const home = { kind: 'flight' as const, startLocal: '2026-12-04T18:00', endLocal: '2026-12-05T00:30', from: { location: { lat: 35.55, lng: 139.78 } }, to: { location: KL.location } };

  it('starts after arrival, ends before departure, uses the hotel, and prays on local time', () => {
    const f = dayFrames(['2026-12-01', '2026-12-02', '2026-12-04'], [flight, hotel, home], [KL, TOKYO], { pace: 'moderate', praying: true });
    expect(clock(f[0].end)).toBe('20:30'); // flight at 23:30 minus 2.5 h is later than the pace limit
    expect(clock(f[1].start)).toBe('09:00'); // landed 07:40 + 1 h is before the 9:00 default
    expect(f[1].base).toEqual(hotel.to.location);
    expect(clock(f[2].end)).toBe('15:30'); // 18:00 flight − 2.5 h
    // Day 1 in KL, day 2 in Tokyo: Dhuhr in local time differs (≈13:10 KL vs ≈11:25 Tokyo in December).
    expect(f[0].prayers!.times.dhuhr).toBeGreaterThan(h('12:50'));
    expect(f[1].prayers!.times.dhuhr).toBeLessThan(h('11:45'));
  });

  it('has no prayer times when nobody asked for prayer breaks', () => {
    expect(dayFrames(['2026-12-02'], [], [KL], { pace: 'relaxed', praying: false })[0]).toMatchObject({ prayers: null, end: h('18:30') });
  });
});
