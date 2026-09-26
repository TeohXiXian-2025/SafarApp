import { describe, expect, it } from 'vitest';
import { fitsPrayerBreak, meetPoint } from './prayerSplit';

const mosque = { name: 'Kyoto Mosque', location: { lat: 35.0, lng: 135.76 } };
/** ~n metres north of the mosque. */
const north = (m: number) => ({ lat: 35.0 + m / 111_000, lng: 135.76 });

describe('meetPoint', () => {
  it('meets at the prayer place when the other activity is a short walk away', () => {
    expect(meetPoint({ pick: north(400), prayer: mosque, prayerEnd: 13 * 60 + 30 })).toMatchObject({ kind: 'prayer', name: 'Kyoto Mosque', at: 13 * 60 + 30 });
  });

  it('meets at the next stop when that is nearer to it', () => {
    const next = { name: 'Nishiki Market', location: north(2100), start: 14 * 60 };
    expect(meetPoint({ pick: north(2000), prayer: mosque, prayerEnd: 13 * 60 + 30, next })).toMatchObject({ kind: 'next', name: 'Nishiki Market', at: 14 * 60 });
  });

  it('otherwise meets halfway, a little after the prayer', () => {
    const m = meetPoint({ pick: north(2000), prayer: mosque, prayerEnd: 13 * 60 + 30 });
    expect(m.kind).toBe('middle');
    expect(m.location.lat).toBeCloseTo(north(1000).lat, 4);
    expect(m.at).toBeGreaterThan(13 * 60 + 30);
  });
});

describe('fitsPrayerBreak', () => {
  it('needs time to get there, stay a while and get back', () => {
    expect(fitsPrayerBreak({ pick: north(300), prayer: mosque, start: 13 * 60, end: 13 * 60 + 30 }).fits).toBe(true);
    // 4 km away with only a 30-minute break and nothing after: no time left there.
    expect(fitsPrayerBreak({ pick: north(4000), prayer: mosque, start: 13 * 60, end: 13 * 60 + 30 }).fits).toBe(false);
    // …but fine when the next stop is right by it an hour and a half later.
    const next = { name: 'Gion', location: north(4100), start: 14 * 60 + 30 };
    expect(fitsPrayerBreak({ pick: north(4000), prayer: mosque, start: 13 * 60, end: 13 * 60 + 30, next }).fits).toBe(true);
  });
});
