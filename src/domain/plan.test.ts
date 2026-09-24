import { describe, expect, it } from 'vitest';
import { bookingAnchors } from './plan';

describe('bookingAnchors', () => {
  it('same-day train → one span block', () => {
    expect(bookingAnchors({ kind: 'train', startLocal: '2026-12-02T09:00', endLocal: '2026-12-02T11:15' })).toEqual([
      { event: 'span', day: '2026-12-02', start: '09:00', end: '11:15' },
    ]);
  });
  it('overnight flight → depart + arrive on different days', () => {
    expect(bookingAnchors({ kind: 'flight', startLocal: '2026-12-01T23:30', endLocal: '2026-12-02T07:40' })).toEqual([
      { event: 'depart', day: '2026-12-01', start: '23:30', end: '23:30' },
      { event: 'arrive', day: '2026-12-02', start: '07:40', end: '07:40' },
    ]);
  });
  it('westbound flight landing "earlier" the same day → separate moments', () => {
    const a = bookingAnchors({ kind: 'flight', startLocal: '2026-12-10T10:00', endLocal: '2026-12-10T09:00' });
    expect(a.map((x) => x.event)).toEqual(['depart', 'arrive']);
  });
  it('hotel → check-in and check-out', () => {
    expect(bookingAnchors({ kind: 'hotel', startLocal: '2026-12-01T15:00', endLocal: '2026-12-05T12:00' }).map((x) => x.event)).toEqual([
      'checkin',
      'checkout',
    ]);
  });
});
