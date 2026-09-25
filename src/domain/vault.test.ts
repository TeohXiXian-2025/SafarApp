import { describe, expect, it } from 'vitest';
import { namesMatch, readinessChecks, readinessStatus, toCountryCode, toIsoDate } from './vault';

const trip = { startDate: '2026-12-07', endDate: '2026-12-12' };
const passport = (validUntil: string, over = {}) => ({ kind: 'passport' as const, fields: { fullName: 'AHMAD FARIS BIN ABDULLAH', nationality: 'MY', validUntil, ...over } });
const flight = (names: string[], over = {}) => ({ id: 'f1', kind: 'flight', carrier: 'MH', number: '52', passengerNames: names, travellerUids: ['me'], startLocal: '2026-12-07T09:00', endLocal: '2026-12-07T16:30', to: { name: 'Narita' }, ...over });
const run = (over: Partial<Parameters<typeof readinessChecks>[0]> = {}) =>
  readinessChecks({ uid: 'me', trip, countries: ['JP'], docs: [], bookings: [], nightsWithoutHotel: [], ...over });
const byKey = (cs: ReturnType<typeof run>) => Object.fromEntries(cs.map((c) => [c.key, c.level]));

describe('names', () => {
  it('ignores titles, order and bin/binti', () => {
    expect(namesMatch('MR AHMAD FARIS', 'AHMAD FARIS BIN ABDULLAH')).toBe(true);
    expect(namesMatch('ABDULLAH/AHMAD FARIS', 'Ahmad Faris bin Abdullah')).toBe(true);
    expect(namesMatch('SITI AMINAH', 'AHMAD FARIS BIN ABDULLAH')).toBe(false);
  });
});

describe('readinessChecks', () => {
  it('nothing added: to-dos, not errors', () => {
    const c = run();
    expect(byKey(c)).toMatchObject({ passport: 'todo', 'visa:JP': 'todo', insurance: 'todo' });
    expect(readinessStatus(c)).toBe('check');
  });

  it('passport under 6 months after the trip is a problem abroad', () => {
    expect(byKey(run({ docs: [passport('2027-03-01')] })).passport).toBe('bad');
    expect(byKey(run({ docs: [passport('2027-08-01')] })).passport).toBe('ok');
    expect(byKey(run({ docs: [passport('2026-12-10')] })).passport).toBe('bad');
    // A domestic trip only needs it valid.
    expect(byKey(run({ countries: ['MY'], docs: [passport('2027-03-01')] })).passport).toBe('ok');
  });

  it("flags a ticket name that doesn't match the passport", () => {
    const ok = run({ docs: [passport('2030-01-01')], bookings: [flight(['AHMAD FARIS/MR'])] });
    expect(ok.some((c) => c.key === 'name:f1')).toBe(false);
    const bad = run({ docs: [passport('2030-01-01')], bookings: [flight(['SITI AMINAH'])] });
    expect(bad.find((c) => c.key === 'name:f1')).toMatchObject({ level: 'warn', label: 'A ticket name may not match the passport' });
    // The group label never contains the names.
    expect(bad.find((c) => c.key === 'name:f1')!.label).not.toMatch(/SITI|AHMAD/);
  });

  it('visa and insurance must cover the dates', () => {
    const c = run({
      docs: [
        passport('2030-01-01'),
        { kind: 'visa', fields: { country: 'JP', validUntil: '2026-12-10' } },
        { kind: 'insurance', fields: { provider: 'Etiqa', validFrom: '2026-12-07', validUntil: '2026-12-11' } },
      ],
    });
    expect(byKey(c)).toMatchObject({ 'visa:JP': 'bad', insurance: 'warn' });
    const good = run({ docs: [passport('2030-01-01'), { kind: 'visa', fields: { country: 'JP' } }, { kind: 'insurance', fields: { validFrom: '2026-12-01', validUntil: '2026-12-31' } }] });
    expect(readinessStatus(good)).toBe('ready');
  });

  it('late arrival on check-in night (after midnight counts for the night before)', () => {
    const hotel = { id: 'h', kind: 'hotel', passengerNames: [], travellerUids: ['me'], startLocal: '2026-12-07T15:00', endLocal: '2026-12-09T12:00', to: { name: 'Hotel Gracery' } };
    const late = run({ bookings: [hotel, flight([], { endLocal: '2026-12-08T01:10' })] });
    expect(late.find((c) => c.key === 'late:f1')?.text).toMatch(/01:10.*Hotel Gracery/);
    expect(run({ bookings: [hotel, flight([])] }).some((c) => c.key.startsWith('late'))).toBe(false);
  });
});

describe('toCountryCode', () => {
  it('accepts alpha-2, the passport alpha-3 and names', () => {
    expect(['MY', 'MYS', 'Malaysia', 'japan', 'D'].map(toCountryCode)).toEqual(['MY', 'MY', 'MY', 'JP', 'DE']);
    expect(toCountryCode('Atlantis')).toBeUndefined();
  });
});

describe('toIsoDate', () => {
  it('reads the formats documents print', () => {
    expect(['2027-02-01', '01 FEB 2027', '1 Feb 2027', '01/02/2027', '14 MAR/MAC 1999'].map(toIsoDate)).toEqual(['2027-02-01', '2027-02-01', '2027-02-01', '2027-02-01', '1999-03-14']);
    expect(toIsoDate('31/02/2027')).toBeUndefined();
  });
});
