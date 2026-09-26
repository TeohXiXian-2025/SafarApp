import { describe, expect, it } from 'vitest';
import { dayWarnings, estimateTravelMin, findSlot, nextSlot, toClock, toMin, tripDays } from './timeline';

const item = (id: string, start: string, end: string, locked = false, orderIndex = 0) => ({ id, start, end, locked, orderIndex });
const HOURS = ['Monday: 9:00 AM – 5:00 PM', 'Tuesday: Closed'];

describe('time helpers', () => {
  it('converts clock times', () => {
    expect(toMin('13:45')).toBe(825);
    expect(toClock(825)).toBe('13:45');
    expect(toClock(2000)).toBe('23:59');
  });

  it('lists every trip day', () => {
    expect(tripDays('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });
});

describe('nextSlot', () => {
  it('starts an empty day at 9:00', () => {
    expect(nextSlot([], 90)).toEqual({ start: '09:00', end: '10:30' });
  });

  it('goes after the last item plus a gap', () => {
    expect(nextSlot([item('a', '10:00', '11:02')], 60)).toEqual({ start: '11:20', end: '12:20' });
  });

  it('steps over a locked booking', () => {
    const day = [item('a', '09:00', '10:00'), item('flight', '10:30', '12:00', true)];
    expect(nextSlot(day, 60)).toEqual({ start: '12:15', end: '13:15' });
  });

  it('fills the morning before a later check-in, but never before an arrival', () => {
    const checkin = { ...item('h', '15:00', '15:00', true), ref: { kind: 'booking' as const, bookingId: 'h', event: 'checkin' as const } };
    expect(nextSlot([checkin], 60)).toEqual({ start: '09:00', end: '10:00' });
    const landing = { ...item('f', '11:40', '11:40', true), ref: { kind: 'booking' as const, bookingId: 'f', event: 'arrive' as const } };
    expect(nextSlot([landing, checkin], 60)).toEqual({ start: '11:55', end: '12:55' });
  });
});

describe('estimateTravelMin', () => {
  it('walks short hops and rides longer ones', () => {
    const klcc = { lat: 3.1579, lng: 101.7116 };
    expect(estimateTravelMin(klcc, { lat: 3.1579, lng: 101.7196 })).toBeLessThan(20); // ~900 m
    expect(estimateTravelMin(klcc, { lat: 3.1428, lng: 101.6958 })).toBeGreaterThan(15); // ~2.4 km
  });
});

describe('dayWarnings', () => {
  const kinds = (w: { itemId: string; kind: string; severity: string }[]) => w.map((x) => [x.itemId, x.kind, x.severity]);

  it('flags outside-hours, overlaps and transfers you cannot make', () => {
    const w = dayWarnings(
      '2026-12-07', // a Monday
      [
        { ...item('a', '08:00', '10:00'), transitMin: 0 },
        { ...item('b', '09:30', '10:30') },
        { ...item('c', '10:40', '11:30'), transitMin: 25 },
      ],
      (id) => (id === 'a' ? HOURS : undefined),
    );
    expect(kinds(w)).toEqual([
      ['a', 'hours', 'block'],
      ['b', 'overlap', 'block'],
      ['c', 'unreachable', 'block'],
    ]);
  });

  it('warns (without blocking) when there is little time to spare or it is about to close', () => {
    const w = dayWarnings(
      '2026-12-07',
      [item('a', '12:00', '13:00'), { ...item('b', '13:30', '16:50'), transitMin: 25 }],
      (id) => (id === 'b' ? HOURS : undefined),
    );
    expect(kinds(w)).toEqual([
      ['b', 'tight', 'risk'],
      ['b', 'closing', 'risk'],
    ]);
    expect(w[0].text).toBe('Only 5 min to spare after the ~25 min trip.');
  });

  it('counts a prayer break between two stops against the transfer', () => {
    const w = dayWarnings(
      '2026-12-07',
      [item('a', '10:00', '12:00'), { ...item('pr', '12:00', '12:25'), kind: 'prayer' as const }, { ...item('b', '12:30', '13:30'), transitMin: 15 }],
      () => undefined,
    );
    expect(w).toEqual([{ itemId: 'b', kind: 'unreachable', severity: 'block', text: "Can't get here in time: the trip takes ~15 min but there's only 5 min after the prayer break." }]);
  });

  it('ignores the parallel groups of a split when checking overlaps', () => {
    const w = dayWarnings('2026-12-07', [item('a', '12:00', '13:30'), { ...item('b', '12:05', '13:15'), kind: 'side' as const }], () => undefined);
    expect(w).toEqual([]);
  });

  it('flags a place closed that day', () => {
    const w = dayWarnings('2026-12-08', [item('a', '10:00', '11:00')], () => HOURS);
    expect(w).toEqual([{ itemId: 'a', kind: 'closed', severity: 'block', text: 'Closed on this day.' }]);
  });
});

describe('findSlot', () => {
  const at = (dLat: number) => ({ lat: 3.15 + dLat, lng: 101.7 });
  const flat = () => 20;

  it('finds the first time inside opening hours with travel both ways', () => {
    // Busy 9–10 and 12–13; a 60-min stop 20 min away each way needs 10:30 (10 + 20 travel + 10 buffer).
    const items = [{ start: 540, end: 600, loc: at(0) }, { start: 720, end: 780, loc: at(0.01) }];
    expect(findSlot({ day: '2026-12-07', items, duration: 60, loc: at(0.02), after: 540, travel: flat })).toBe(630);
  });

  it('respects opening hours and says when nothing fits', () => {
    expect(findSlot({ day: '2026-12-07', items: [], duration: 60, hours: HOURS, after: 480 })).toBe(540);
    expect(findSlot({ day: '2026-12-08', items: [], duration: 60, hours: HOURS })).toBeNull(); // closed Tuesday
    expect(findSlot({ day: '2026-12-07', items: [], duration: 600, hours: HOURS })).toBeNull(); // 10 h won't fit 9–5
  });
});

describe('same-time priority (journey > prayer > hotel > the rest)', () => {
  const it0 = (id: string, ref: any, extra: object = {}) => ({ id, start: '15:00', end: '15:00', orderIndex: 0, ref, ...extra });
  it('orders things that share a minute', async () => {
    const { byTimeAndPriority } = await import('./timeline');
    const list = [
      it0('stop', { kind: 'idea', ideaId: 'x' }),
      it0('checkin', { kind: 'booking', bookingId: 'h', event: 'checkin' }),
      it0('prayer', { kind: 'custom', title: 'Asr' }, { prayer: {} }),
      it0('arrive', { kind: 'booking', bookingId: 'f', event: 'arrive' }),
    ];
    expect([...list].sort(byTimeAndPriority as any).map((x) => x.id)).toEqual(['arrive', 'prayer', 'checkin', 'stop']);
  });
  it('a check-in during a prayer says to pray first', async () => {
    const { dayWarnings } = await import('./timeline');
    const w = dayWarnings(
      '2026-11-10',
      [
        { id: 'p', start: '15:00', end: '15:30', orderIndex: 0, kind: 'prayer', label: 'Asr prayer' },
        { id: 'ci', start: '15:10', end: '15:10', orderIndex: 1, locked: true, checkin: true },
      ],
      () => undefined,
    );
    expect(w.find((x) => x.itemId === 'ci')?.kind).toBe('checkin');
  });
});

describe('planChain — travel between every block', () => {
  const A = { lat: 3.139, lng: 101.6869 };
  const far = { lat: 3.2, lng: 101.75 }; // ~10 km
  const mosque = { lat: 3.142, lng: 101.69 };
  const h = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  it('a stop right after a prayer starts after walking from the mosque', async () => {
    const { planChain, estimateTravelMin } = await import('./timeline');
    const p = planChain(
      [
        { id: 'dhuhr', start: h('13:10'), end: h('13:40'), loc: mosque, fixed: true },
        { id: 'stop', start: h('13:40'), end: h('15:00'), loc: far, fixed: false },
      ],
      estimateTravelMin,
    );
    expect(p.legs.get('stop')!.minutes).toBe(estimateTravelMin(mosque, far));
    expect(p.starts.get('stop')!).toBeGreaterThanOrEqual(h('13:40') + estimateTravelMin(mosque, far) + 10);
  });
  it('a short stop that would run into a prayer moves after it; a long visit prays inside', async () => {
    const { planChain, estimateTravelMin } = await import('./timeline');
    const rows = [
      { id: 'a', start: h('12:30'), end: h('13:30'), loc: A, fixed: false },
      { id: 'dhuhr', start: h('13:10'), end: h('13:40'), loc: A, fixed: true, prayer: true },
    ];
    // Dhuhr falls in the middle of the visit: it stays (you step out to pray) — no chain of pushes to the evening.
    expect(planChain(rows, estimateTravelMin).starts.get('a')).toBe(h('12:30'));
    // Starting inside the prayer time: it waits until after the prayer.
    const late = [{ id: 'x', start: h('11:00'), end: h('12:00'), loc: A, fixed: false }, { id: 'dhuhr', start: h('13:10'), end: h('13:40'), loc: A, fixed: true, prayer: true }, { id: 'b', start: h('13:15'), end: h('14:15'), loc: A, fixed: false }];
    expect(planChain(late, estimateTravelMin).starts.get('b')).toBeGreaterThanOrEqual(h('13:40'));
    // A 2-hour stop added late morning isn't pushed past every prayer of the day.
    const day = [
      { id: 'a', start: h('09:00'), end: h('11:00'), loc: A, fixed: false },
      { id: 'b', start: h('11:15'), end: h('13:15'), loc: A, fixed: false },
      ...[['dhuhr', '13:10'], ['asr', '16:30'], ['maghrib', '19:05'], ['isha', '20:20']].map(([id, t]) => ({ id, start: h(t), end: h(t) + 30, loc: A, fixed: true, prayer: true })),
    ];
    expect(planChain(day, estimateTravelMin).starts.get('b')).toBeLessThan(h('12:00'));
    const park = [{ id: 'disney', start: h('09:00'), end: h('18:00'), loc: far, fixed: false }, { id: 'dhuhr', start: h('11:35'), end: h('12:05'), loc: far, fixed: true }, { id: 'dinner', start: h('18:30'), end: h('19:30'), loc: far, fixed: false }];
    const pp = planChain(park, estimateTravelMin);
    expect(pp.starts.get('disney')).toBe(h('09:00'));
    expect(pp.legs.get('dinner')!.fromId).toBe('disney');
  });
});

it('planChain: after a prayer, only travel beyond the walk the prayer block already includes counts', async () => {
  const { planChain } = await import('./timeline');
  const h = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const P = { lat: 3.14, lng: 101.69 };
  const Q = { lat: 3.2, lng: 101.75 };
  const rows = [
    { id: 'dhuhr', start: h('13:10'), end: h('13:40'), loc: P, fixed: true, prayer: true },
    { id: 'near', start: h('13:45'), end: h('14:45'), loc: P, fixed: false },
    { id: 'far', start: h('14:50'), end: h('15:50'), loc: Q, fixed: false },
  ];
  const p = planChain(rows, (a, b) => (a === b ? 0 : 25));
  expect(p.starts.get('near')).toBe(h('13:45'));
  expect(p.starts.get('far')).toBe(h('15:20')); // 14:45 + 25 min travel + 10 buffer
});

it('planChain: a moment or prayer during a stop never makes the next stop start inside it', async () => {
  const { planChain } = await import('./timeline');
  const h = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const L = (n: number) => ({ lat: 3.1 + n / 100, lng: 101.7 });
  const rows = [
    { id: 'Sy', start: h('09:45'), end: h('11:15'), fixed: false, loc: L(1) },
    { id: 'checkout', start: h('12:00'), end: h('12:00'), fixed: true, loc: L(2) },
    { id: 'dhuhr', start: h('13:10'), end: h('13:40'), fixed: true, prayer: true, loc: L(3) },
    { id: 'a', start: h('14:10'), end: h('15:40'), fixed: false, loc: L(4) },
    { id: 'meal', start: h('14:10'), end: h('15:10'), fixed: false, loc: L(5) },
    { id: 'asr', start: h('16:30'), end: h('17:00'), fixed: true, prayer: true, loc: L(6) },
    { id: 'b', start: h('17:20'), end: h('18:50'), fixed: false, loc: L(7) },
  ];
  const p = planChain(rows, () => 20);
  const placed = rows.filter((r) => !r.fixed).map((r) => ({ id: r.id, s: p.starts.get(r.id)!, e: p.starts.get(r.id)! + (r.end - r.start) })).sort((x, y) => x.s - y.s);
  for (let i = 1; i < placed.length; i++) expect(placed[i].s).toBeGreaterThanOrEqual(placed[i - 1].e);
});
