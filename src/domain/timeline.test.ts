import { describe, expect, it } from 'vitest';
import { dayWarnings, estimateTravelMin, nextSlot, toClock, toMin, tripDays } from './timeline';

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
  it('flags overlaps, tight transfers and opening hours', () => {
    const w = dayWarnings(
      '2026-12-07', // a Monday
      [
        { ...item('a', '08:00', '10:00'), transitMin: 0 },
        { ...item('b', '09:30', '10:30') },
        { ...item('c', '10:40', '11:30'), transitMin: 25 },
      ],
      (id) => (id === 'a' ? HOURS : undefined),
    );
    expect(w.map((x) => [x.itemId, x.kind])).toEqual([
      ['a', 'hours'],
      ['b', 'overlap'],
      ['c', 'tight'],
    ]);
  });

  it('counts a prayer break between two stops against the transfer', () => {
    const w = dayWarnings(
      '2026-12-07',
      [
        item('a', '10:00', '12:00'),
        { ...item('pr', '12:00', '12:25'), kind: 'prayer' as const },
        { ...item('b', '12:30', '13:30'), transitMin: 15 },
      ],
      () => undefined,
    );
    expect(w).toEqual([{ itemId: 'b', kind: 'tight', text: 'Only 5 min to get here after the prayer break — the trip takes about 15 min.' }]);
  });

  it('ignores the parallel half of a split when checking overlaps', () => {
    const w = dayWarnings('2026-12-07', [item('a', '12:00', '13:30'), { ...item('b', '12:05', '13:15'), kind: 'side' as const }], () => undefined);
    expect(w).toEqual([]);
  });

  it('flags a place closed that day', () => {
    const w = dayWarnings('2026-12-08', [item('a', '10:00', '11:00')], () => HOURS);
    expect(w).toEqual([{ itemId: 'a', kind: 'closed', text: 'Closed on this day.' }]);
  });
});
