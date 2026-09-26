import { describe, expect, it } from 'vitest';
import { arrangeTrip, dayFrames, daySuggestions, orderByDistance, prayerBreaks, prayerPlaceOnRoute, timeSequence, type DayFrame, type Unit } from './arrange';
import type { DayPrayers } from './prayer';
import { dayWarnings, estimateTravelMin } from './timeline';
import { praysInside } from './placement';

const h = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// KL-like prayer times.
const PRAYERS: DayPrayers = { date: '2026-12-07', sunrise: h('07:05'), times: { fajr: h('05:50'), dhuhr: h('13:05'), asr: h('16:25'), maghrib: h('19:10'), isha: h('20:25') } };
const HOTEL = { lat: 3.1579, lng: 101.6995 };
const near = (dLat: number, dLng = 0) => ({ lat: HOTEL.lat + dLat, lng: HOTEL.lng + dLng });
const frame = (over: Partial<DayFrame> = {}): DayFrame => ({ day: '2026-12-07', start: h('09:00'), end: h('20:30'), base: HOTEL, baseKnown: true, blocks: [], prayers: null, ...over });
const flat = () => 10; // every hop 10 min
const unit = (id: string, duration: number, over: Partial<Unit> = {}): Unit => ({ id, loc: HOTEL, duration, ...over });

describe('timeSequence', () => {
  it('packs stops with travel time from the hotel', () => {
    const t = timeSequence(frame(), [unit('a', 60), unit('b', 90)], { strict: true, travel: flat, buffer: 0 });
    expect(t.placed.map((p) => [p.id, clock(p.start), clock(p.end)])).toEqual([
      ['a', '09:10', '10:10'],
      ['b', '10:20', '11:50'],
    ]);
    expect(t.prayers).toEqual([]);
  });

  it('keeps a buffer on top of the travel time', () => {
    const t = timeSequence(frame(), [unit('a', 60), unit('b', 90)], { strict: true, travel: flat });
    expect(t.placed.map((p) => clock(p.start))).toEqual(['09:20', '10:40']);
  });

  it('plans stops around a locked prayer time, prayed near the stop before', () => {
    // The nearest prayer place is 20 min away: no praying during these visits — they step around the prayer time.
    const far = { prayerWalkMin: 20 };
    const t = timeSequence(frame({ prayers: PRAYERS }), [unit('a', 120, far), unit('b', 60, far), unit('c', 60, far)], { strict: true, travel: flat, buffer: 0 });
    // a 09:10–11:10, b 11:20–12:20; c would run into Dhuhr (13:05–13:35) → after it.
    expect(t.placed.map((p) => [p.id, clock(p.start)])).toEqual([
      ['a', '09:10'],
      ['b', '11:20'],
      ['c', '13:35'], // right after the prayer block (it already includes the walk)
    ]);
    expect(t.prayers.map((p) => [p.key, clock(p.start), clock(p.end), p.afterId])).toEqual([['dhuhr', '13:05', '13:35', 'b']]);
  });

  it('pauses the journey for a prayer that comes due on the way', () => {
    const t = timeSequence(frame({ start: h('12:00'), prayers: PRAYERS }), [unit('a', 60, { prayerWalkMin: 20 }), unit('b', 60, { prayerWalkMin: 20 })], { strict: true, travel: () => 20, buffer: 0 });
    // a 12:20–13:20 would overlap Dhuhr → a after it; the walk to b is split by nothing else.
    expect(t.prayers[0]).toMatchObject({ key: 'dhuhr', start: h('13:05') });
    expect(t.placed.every((p) => p.end <= h('13:05') || p.start >= h('13:35'))).toBe(true);
  });

  it('A → pray → back to A: a visit you can pray at holds the prayer time and gets its time back', () => {
    // No prayer place known (ask staff / a quiet spot there) or one on site: the prayer happens during the visit.
    const t = timeSequence(frame({ prayers: PRAYERS }), [unit('a', 120), unit('b', 120, { prayerWalkMin: 0 })], { strict: true, travel: flat, buffer: 0 });
    // a 09:10–11:10; b 11:20 + 2 h reaches Dhuhr (13:05) → + the 30-min prayer block → 13:50.
    expect(t.placed.map((p) => [p.id, clock(p.start), clock(p.end)])).toEqual([
      ['a', '09:10', '11:10'],
      ['b', '11:20', '13:50'],
    ]);
    expect(t.prayers.map((p) => [p.key, p.afterId])).toEqual([['dhuhr', 'b']]);
  });

  it('lets a long visit run through a prayer time and pray there', () => {
    const t = timeSequence(frame({ prayers: PRAYERS }), [unit('park', 240, { prayerWalkMin: 0 })], { strict: true, travel: flat, buffer: 0 });
    // 09:10 + 4 h reaches Dhuhr at 13:05 → 20 min added for praying there.
    expect([clock(t.placed[0].start), clock(t.placed[0].end)]).toEqual(['09:10', '13:30']);
    expect(t.prayers.map((p) => [p.key, p.afterId])).toEqual([['dhuhr', 'park']]);
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
    const t = timeSequence(frame({ blocks: [{ start: h('10:00'), end: h('12:00') }] }), [unit('a', 60), unit('b', 60)], { strict: true, travel: flat, buffer: 0 });
    expect(t.placed.map((p) => clock(p.start))).toEqual(['12:15', '13:25']);
  });
});

describe('orderByDistance', () => {
  it('visits stops along a line instead of zig-zagging', () => {
    const us = [unit('far', 60, { loc: near(0.03) }), unit('mid', 60, { loc: near(0.02) }), unit('close', 60, { loc: near(0.01) })];
    expect(orderByDistance(HOTEL, us).map((u) => u.id)).toEqual(['close', 'mid', 'far']);
  });
});

describe('arrangeTrip without a hotel', () => {
  it('does not charge travel from a far-away country centre', () => {
    // Destination "South Korea" sits in the middle of the country, ~200 km from Seoul.
    const KOREA = { lat: 35.9078, lng: 127.7669 };
    const seoul = (d: number) => ({ lat: 37.565 + d, lng: 126.982 });
    const r = arrangeTrip(
      [frame({ base: KOREA, baseKnown: false, prayers: PRAYERS })],
      [unit('lotte', 90, { loc: seoul(0), hours: ['Monday: 9:30202fAM2009–20098:00202fPM'] }), unit('square', 75, { loc: seoul(0.007) })],
      { maxStops: 5 },
    );
    expect(r.unplaced).toEqual([]);
    expect(r.days[0].timing.placed.map((p) => clock(p.start))[0] <= '09:30').toBe(true);
    // Prayer breaks are prayed near the stops, not at the country centre.
    expect(r.days[0].timing.prayers.every((p) => Math.abs(p.at.lat - 37.57) < 0.1)).toBe(true);
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

describe('prayerBreaks', () => {
  const stops = [
    { id: 'a', start: h('10:00'), end: h('13:00') },
    { id: 'b', start: h('13:40'), end: h('15:00') },
    { id: 'c', start: h('15:00'), end: h('16:20') },
    { id: 'd', start: h('17:00'), end: h('18:00') },
  ];

  it('puts each prayer at its locked time, near the stop before it', () => {
    const r = prayerBreaks(PRAYERS, stops, HOTEL);
    expect(r.prayers.map((p) => [p.key, clock(p.start), clock(p.end), p.afterId])).toEqual([
      ['dhuhr', '13:05', '13:35', 'a'],
      ['asr', '16:25', '16:55', 'c'],
    ]);
    expect(r.clashes).toEqual([]);
  });

  it('reports a stop planned over a prayer time', () => {
    const r = prayerBreaks(PRAYERS, [...stops.slice(0, 2), { id: 'c', start: h('15:00'), end: h('17:00'), prayerWalkMin: 20 }], HOTEL);
    expect(r.clashes.map((c) => [c.key, c.stopId])).toEqual([['asr', 'c']]);
    // The break stays at its time anyway.
    expect(r.prayers.find((p) => p.key === 'asr')?.start).toBe(h('16:25'));
  });

  it('does not flag a long visit — you pray there', () => {
    const r = prayerBreaks(PRAYERS, [{ id: 'park', start: h('11:00'), end: h('15:00') }], HOTEL);
    expect(r.clashes).toEqual([]);
    expect(r.prayers.map((p) => [p.key, p.afterId])).toEqual([['dhuhr', 'park']]);
  });

  it('skips prayers before the day starts or after it ends', () => {
    const r = prayerBreaks(PRAYERS, [{ id: 'm', start: h('09:00'), end: h('11:00') }], HOTEL);
    expect(r.prayers).toEqual([]);
    expect(r.clashes).toEqual([]);
  });
});

describe('prayerBreaks for the whole day (timeline)', () => {
  it('gives every prayer a block while at the destination, stops or not', () => {
    const r = prayerBreaks(PRAYERS, [], HOTEL, [], [0, 24 * 60]);
    expect(r.prayers.map((p) => [p.key, clock(p.start)])).toEqual([
      ['fajr', '05:50'],
      ['dhuhr', '13:05'],
      ['asr', '16:25'],
      ['maghrib', '19:10'],
      ['isha', '20:25'],
    ]);
    expect(r.prayers.every((p) => p.at === HOTEL)).toBe(true);
  });

  it('skips prayers before landing and while travelling', () => {
    const r = prayerBreaks(PRAYERS, [], HOTEL, [{ start: h('15:00'), end: h('17:00') }], [h('12:00'), 24 * 60]);
    expect(r.prayers.map((p) => p.key)).toEqual(['dhuhr', 'maghrib', 'isha']);
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

  it('plans a same-day international arrival only after landing', () => {
    // KL 13:58 → Seoul 16:58 (both local times, same date): nothing in Seoul before ~18:00.
    const SEOUL = { location: { lat: 37.5665, lng: 126.978 }, timezone: 'Asia/Seoul', countryCode: 'KR' };
    const inbound = { kind: 'flight' as const, startLocal: '2026-09-28T13:58', endLocal: '2026-09-28T16:58', from: { location: KL.location }, to: { location: { lat: 37.46, lng: 126.44 } } };
    const [f] = dayFrames(['2026-09-28'], [inbound], [SEOUL], { pace: 'moderate', praying: false });
    expect(clock(f.start)).toBe('18:00');
    expect(f.blocks).toEqual([]);
    expect(f.baseKnown).toBe(true);
  });

  it('ends the day before a same-day flight home', () => {
    const SEOUL = { location: { lat: 37.5665, lng: 126.978 }, timezone: 'Asia/Seoul', countryCode: 'KR' };
    const home = { kind: 'flight' as const, startLocal: '2026-09-30T18:00', endLocal: '2026-09-30T23:30', from: { location: { lat: 37.46, lng: 126.44 } }, to: { location: KL.location } };
    const [f] = dayFrames(['2026-09-30'], [home], [SEOUL], { pace: 'moderate', praying: false });
    expect(clock(f.end)).toBe('15:30');
  });

  it('knows when the group is at the destination (landing day, leaving day)', () => {
    // A Tokyo-only trip from KL: day 1 is at home until the 23:30 flight; Tokyo from landing 07:40; home at 18:00 on day 4.
    const f = dayFrames(['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04'], [flight, hotel, home], [TOKYO], { pace: 'moderate', praying: true });
    expect(f[0].inTrip?.[0]).toBe(h('23:30'));
    expect(f[1].inTrip).toEqual([h('07:40'), 24 * 60]);
    expect(f[2].inTrip).toEqual([0, 24 * 60]);
    expect(f[3].inTrip).toEqual([0, h('18:00')]);
  });

  it('has no prayer times when nobody asked for prayer breaks', () => {
    expect(dayFrames(['2026-12-02'], [], [KL], { pace: 'relaxed', praying: false })[0]).toMatchObject({ prayers: null, end: h('18:30') });
  });
});

describe('AI Arrange never creates a blocking conflict (or a tight transfer)', () => {
  // Small seeded PRNG so failures are reproducible.
  const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const DAYNAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  it('holds for 300 random trips (hours, closures, trains, prayers, meals)', () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const days = ['2026-12-07', '2026-12-08', '2026-12-09'].slice(0, 1 + Math.floor(r() * 3));
      const frames = days.map((day) =>
        frame({
          day,
          start: h('09:00') + Math.floor(r() * 4) * 30,
          end: h('18:30') + Math.floor(r() * 5) * 30,
          blocks: r() < 0.3 ? [((t) => ({ start: t, end: t + 60 + Math.floor(r() * 4) * 30 }))(h('11:00') + Math.floor(r() * 8) * 30)] : [],
          prayers: r() < 0.6 ? PRAYERS : null,
        }),
      );
      const units = Array.from({ length: 3 + Math.floor(r() * 7) }, (_, i) => {
        const open = 8 + Math.floor(r() * 4);
        const close = 16 + Math.floor(r() * 7);
        const hours = r() < 0.7 ? DAYNAMES.map((d) => (r() < 0.12 ? `${d}: Closed` : `${d}: ${open}:00 AM – ${close - 12}:00 PM`)) : undefined;
        return unit(`u${i}`, 30 + Math.floor(r() * 6) * 30, { loc: near((r() - 0.5) * 0.06, (r() - 0.5) * 0.06), food: r() < 0.3, ...(hours ? { hours } : {}), ...(r() < 0.5 ? { prayerWalkMin: Math.floor(r() * 12) } : {}) });
      });
      const result = arrangeTrip(frames, units, { maxStops: 5 });
      for (const d of result.days) {
        const f = frames.find((x) => x.day === d.day)!;
        const placed = d.timing.placed.map((p) => ({ ...p, unit: units.find((u) => u.id === p.id)! }));
        const items = [
          ...placed.map((p, k) => ({
            id: p.id,
            start: clock(p.start),
            end: clock(p.end),
            orderIndex: k,
            transitMin: k > 0 ? estimateTravelMin(placed[k - 1].unit.loc, p.unit.loc) : undefined,
            ...(praysInside(p.unit.prayerWalkMin) ? { prayInside: true } : {}),
          })),
          ...d.timing.prayers.map((p, k) => ({ id: `pr${k}`, start: clock(p.start), end: clock(p.end), orderIndex: 0, kind: 'prayer' as const })),
          ...f.blocks.map((b, k) => ({ id: `blk${k}`, start: clock(b.start), end: clock(b.end), orderIndex: 0, locked: true })),
        ];
        // Travel is only checked stop→stop (the scheduler routes around trains the same way).
        const blocking = dayWarnings(d.day, items, (id) => units.find((u) => u.id === id)?.hours).filter((w) => (w.severity === 'block' || w.kind === 'tight') && !((w.kind === 'unreachable' || w.kind === 'tight') && items.some((x) => x.id.startsWith('blk'))));
        if (blocking.length) failures.push(`seed ${seed} ${d.day}: ${blocking.map((w) => `${w.itemId} ${w.kind} (${w.text})`).join('; ')}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('daySuggestions', () => {
  it('suggests a shorter visiting order and flags a meal at an odd hour', () => {
    const stops = [
      { id: 'far', start: h('09:00'), end: h('10:00'), loc: near(0.12), name: 'Far' },
      { id: 'close', start: h('10:30'), end: h('11:30'), loc: near(0.03), name: 'Close' },
      { id: 'mid', start: h('12:00'), end: h('13:00'), loc: near(0.06), name: 'Mid' },
      { id: 'cafe', start: h('16:00'), end: h('17:00'), loc: near(0.061), name: 'Cafe', food: true },
    ];
    const s = daySuggestions({ base: HOTEL, baseKnown: true }, stops);
    expect(s.find((x) => x.kind === 'order')?.order).toEqual(['close', 'mid', 'cafe', 'far']);
    expect(s.find((x) => x.kind === 'meal')?.text).toMatch(/Cafe/);
  });

  it('stays quiet when the order is already good', () => {
    const stops = [
      { id: 'a', start: h('09:00'), end: h('10:00'), loc: near(0.01), name: 'A' },
      { id: 'b', start: h('10:30'), end: h('11:30'), loc: near(0.02), name: 'B' },
      { id: 'c', start: h('12:00'), end: h('13:00'), loc: near(0.03), name: 'C' },
    ];
    expect(daySuggestions({ base: HOTEL, baseKnown: true }, stops)).toEqual([]);
  });
});

describe('prayerPlaceOnRoute', () => {
  it('picks the mosque on the way to the next stop, not just the nearest to the last one', () => {
    const from = near(0);
    const to = near(0.03);
    const behind = { name: 'behind', location: near(-0.004) }; // closest to `from`, wrong way
    const onWay = { name: 'onWay', location: near(0.008) };
    expect(prayerPlaceOnRoute([behind, onWay], from, to)?.name).toBe('onWay');
    expect(prayerPlaceOnRoute([behind, onWay], from)?.name).toBe('behind');
    expect(prayerPlaceOnRoute([], from, to)).toBeUndefined();
  });

  it('never picks a place far from both stops just because it is on the line between them', () => {
    const from = near(0);
    const to = near(0.08); // ~9 km away
    const middle = { name: 'middle', location: near(0.04) }; // ~4.4 km from each — too far to walk in a break
    const byTo = { name: 'byTo', location: near(0.078) };
    expect(prayerPlaceOnRoute([middle, byTo], from, to)?.name).toBe('byTo');
  });
});

describe('arrangeTrip — cities and meals', () => {
  const OSAKA = { lat: 34.69, lng: 135.5 };
  const TOKYO = { lat: 35.68, lng: 139.76 };
  const days = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
  const frames = days.map((day) => frame({ day, base: TOKYO, baseKnown: false }));
  // Tokyo on the 10th–11th, Osaka on the 12th–13th.
  const dayCities = new Map(days.map((d, i) => [d, [i < 2 ? 0 : 1]]));

  it('never plans a stop on a day the group is in another city', () => {
    const units = [
      unit('t1', 60, { loc: TOKYO, city: 0 }),
      unit('t2', 60, { loc: { lat: 35.7, lng: 139.8 }, city: 0 }),
      unit('o1', 60, { loc: OSAKA, city: 1 }),
      unit('o2', 60, { loc: { lat: 34.7, lng: 135.52 }, city: 1 }),
      unit('o3', 60, { loc: { lat: 34.67, lng: 135.49 }, city: 1 }),
    ];
    const r = arrangeTrip(frames, units, { maxStops: 5, travel: flat, dayCities });
    const dayOf = new Map(r.days.flatMap((d) => d.timing.placed.map((p) => [p.id, d.day] as const)));
    for (const id of ['t1', 't2']) expect(['2026-11-10', '2026-11-11']).toContain(dayOf.get(id));
    for (const id of ['o1', 'o2', 'o3']) expect(['2026-11-12', '2026-11-13']).toContain(dayOf.get(id));
    expect(r.unplaced).toEqual([]);
  });

  it('adds a lunch slot in the lunch window when a day out has no food stop', () => {
    const units = [unit('a', 150, { loc: TOKYO }), unit('b', 150, { loc: TOKYO }), unit('c', 120, { loc: TOKYO })];
    const r = arrangeTrip([frame({ base: TOKYO })], units, { maxStops: 5, travel: flat, meals: true });
    const lunch = r.days[0].timing.placed.find((p) => p.id === 'meal:lunch');
    expect(lunch).toBeDefined();
    expect(lunch!.start).toBeGreaterThanOrEqual(h('11:30'));
    expect(lunch!.end).toBeLessThanOrEqual(h('14:00'));
    expect(r.days[0].timing.placed.filter((p) => !p.id.startsWith('meal:')).length).toBe(3);
  });

  it("doesn't add a meal when a food stop already covers it", () => {
    const units = [unit('a', 120, { loc: TOKYO }), unit('ramen', 60, { loc: TOKYO, food: true }), unit('c', 120, { loc: TOKYO })];
    const r = arrangeTrip([frame({ base: TOKYO, end: h('16:00') })], units, { maxStops: 5, travel: flat, meals: true });
    expect(r.days[0].timing.placed.some((p) => p.id === 'meal:lunch')).toBe(false);
  });
});

describe('pushForward (travel time on a hand-made day)', () => {
  it('moves only the stop that can’t be reached in time, keeps chosen gaps', async () => {
    const { pushForward } = await import('./arrange');
    const far = { lat: HOTEL.lat + 0.09, lng: HOTEL.lng }; // ~10 km away
    const units = [
      unit('a', 60, { notBefore: h('09:00') }),
      unit('b', 60, { loc: far, notBefore: h('10:05') }), // 5 min after a — far too soon
      unit('c', 60, { loc: far, notBefore: h('15:00') }), // a long gap after b — kept
    ];
    const moved = pushForward(frame(), units, (x, y) => (x === y ? 0 : estimateTravelMin(x, y)));
    expect(moved.has('a')).toBe(false);
    expect(moved.get('b')!).toBeGreaterThanOrEqual(h('10:00') + estimateTravelMin(HOTEL, far) + 10);
    expect(moved.has('c')).toBe(false);
  });
});
