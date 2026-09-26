import { describe, expect, it } from 'vitest';
import { fmtClock, openingRanges, planningDate, prayerTimesOn, visitWindows, type DayPrayers } from './prayer';

const day: DayPrayers = { date: '2026-10-12', sunrise: 7 * 60, times: { fajr: 5 * 60 + 45, dhuhr: 13 * 60, asr: 16 * 60 + 15, maghrib: 19 * 60, isha: 20 * 60 + 10 } };

describe('prayerTimesOn', () => {
  it('matches the published Kuala Lumpur times within a few minutes', () => {
    const kl = prayerTimesOn('2026-10-12', { lat: 3.139, lng: 101.6869 }, 'Asia/Kuala_Lumpur', 'MY');
    expect(Math.abs(kl.times.dhuhr - 13 * 60)).toBeLessThanOrEqual(5);
    expect(Math.abs(kl.times.asr - (16 * 60 + 13))).toBeLessThanOrEqual(5);
  });
});

describe('visitWindows', () => {
  it('keeps only gaps the whole visit fits in, longest first', () => {
    const ws = visitWindows(day, 150); // Asr+20 → Maghrib is only 145 min
    expect(ws.map((w) => `${w.after}-${w.before}`)).toEqual(['sunrise-dhuhr', 'dhuhr-asr']);
    expect(ws[1].start).toBe(13 * 60 + 20); // time to pray Dhuhr first
  });
  it('clips to opening hours', () => {
    const ws = visitWindows(day, 90, [[10 * 60, 17 * 60]]);
    expect(ws.map((w) => [fmtClock(w.start), fmtClock(w.end)])).toEqual([
      ['10:00 AM', '1:00 PM'],
      ['1:20 PM', '4:15 PM'],
    ]);
  });
});

describe('openingRanges', () => {
  const hours = ['Monday: 9:00\u202fAM – 5:00\u202fPM', 'Tuesday: Closed', 'Wednesday: Open 24 hours', 'Thursday: 11:00 AM – 2:30 PM, 6:00 – 10:00 PM', 'Friday: 17:00 – 01:00'];
  it('reads Google weekday descriptions', () => {
    expect(openingRanges(hours, '2026-10-12')).toEqual([[540, 1020]]); // Monday
    expect(openingRanges(hours, '2026-10-13')).toEqual([]); // closed
    expect(openingRanges(hours, '2026-10-14')).toBeNull(); // 24 hours
    expect(openingRanges(hours, '2026-10-15')).toEqual([[660, 870], [1080, 1320]]);
    expect(openingRanges(hours, '2026-10-16')).toEqual([[1020, 1440]]); // past midnight
    expect(openingRanges(undefined, '2026-10-12')).toBeNull();
  });
});

describe('planningDate', () => {
  it('uses today during the trip, else the first day', () => {
    const now = new Date('2026-10-13T03:00:00Z');
    expect(planningDate('2026-10-12', '2026-10-15', 'Asia/Tokyo', now)).toBe('2026-10-13');
    expect(planningDate('2026-11-01', '2026-11-05', 'Asia/Tokyo', now)).toBe('2026-11-01');
  });
});

describe('prayer times match the official national tables', () => {
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const near = (got: number, want: string, tol = 2) => expect(Math.abs(got - (Number(want.slice(0, 2)) * 60 + Number(want.slice(3))))).toBeLessThanOrEqual(tol);
  it('Kuala Lumpur, 1 Dec 2026 = JAKIM e-Solat (WLY01) within 2 min', async () => {
    const { prayerTimesOn } = await import('./prayer');
    const p = prayerTimesOn('2026-12-01', { lat: 3.139, lng: 101.6869 }, 'Asia/Kuala_Lumpur');
    // Official: Subuh 05:52, Zohor 13:05, Asar 16:27, Maghrib 19:02, Isyak 20:16.
    near(p.times.fajr, '05:52');
    near(p.times.dhuhr, '13:05');
    near(p.times.asr, '16:27');
    near(p.times.maghrib, '19:02');
    near(p.times.isha, '20:16');
    expect(clock(p.times.fajr) >= '05:50').toBe(true);
  });
  it('Tokyo matches the standard (Aladhan MWL) within 1 min', async () => {
    const { prayerTimesOn } = await import('./prayer');
    const p = prayerTimesOn('2026-12-01', { lat: 35.68, lng: 139.76 }, 'Asia/Tokyo', 'JP');
    near(p.times.fajr, '05:01', 1);
    near(p.times.dhuhr, '11:30', 1);
    near(p.times.asr, '14:10', 1);
    near(p.times.maghrib, '16:28', 1);
    near(p.times.isha, '17:53', 1);
  });
});
