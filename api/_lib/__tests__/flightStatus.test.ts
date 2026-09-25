import { describe, expect, it } from 'vitest';
import { flightCode, statusChange, type AvFlight } from '../flightStatus';

const b = { startLocal: '2026-12-07T07:00', endLocal: '2026-12-07T08:05' };
const av = (over: Partial<AvFlight> = {}): AvFlight => ({
  flight_date: '2026-12-07',
  flight_status: 'scheduled',
  flight: { iata: 'MH602', codeshared: null },
  departure: { delay: null, scheduled: '2026-12-07T07:00:00+00:00', estimated: '2026-12-07T07:00:00+00:00' },
  arrival: { delay: null, scheduled: '2026-12-07T08:05:00+00:00', estimated: null },
  ...over,
});

describe('flightCode', () => {
  it('reads IATA codes from the booking', () => {
    expect(flightCode({ carrier: 'MH', number: '602' })).toBe('MH602');
    expect(flightCode({ carrier: 'Malaysia Airlines', number: 'MH 602' })).toBe('MH602');
    expect(flightCode({ carrier: 'AirAsia', number: '602' })).toBeNull();
  });
});

describe('statusChange', () => {
  it('on time or a small delay → nothing', () => {
    expect(statusChange(b, 'MH602', [av()])).toBeNull();
    expect(statusChange(b, 'MH602', [av({ departure: { delay: 15, estimated: '2026-12-07T07:15:00+00:00' } })])).toBeNull();
  });
  it('a delay moves both times (AviationStack local times labelled +00:00)', () => {
    expect(statusChange(b, 'MH602', [av({ departure: { delay: 95, estimated: '2026-12-07T08:35:00+00:00' } })])).toEqual({ type: 'delay', startLocal: '2026-12-07T08:35', endLocal: '2026-12-07T09:40', delayMin: 95 });
  });
  it('cancelled; other days and codeshares ignored', () => {
    expect(statusChange(b, 'MH602', [av({ flight_date: '2026-12-06', flight_status: 'cancelled' }), av({ flight_status: 'cancelled' })])).toEqual({ type: 'cancel' });
    expect(statusChange(b, 'MH602', [av({ flight_date: '2026-12-06', flight_status: 'cancelled' })])).toBeNull();
    const codeshare = av({ flight: { iata: 'WY5101', codeshared: { flight_iata: 'mh602' } }, flight_status: 'cancelled' });
    expect(statusChange(b, 'MH602', [codeshare, av()])).toBeNull();
  });
});
