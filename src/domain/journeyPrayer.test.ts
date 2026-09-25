import { describe, expect, it } from 'vitest';
import { journeyPrayers } from './journeyPrayer';

const KUL = { location: { lat: 2.7456, lng: 101.7072 }, timezone: 'Asia/Kuala_Lumpur', name: 'KLIA' };
const KIX = { location: { lat: 34.4347, lng: 135.244 }, timezone: 'Asia/Tokyo', name: 'Kansai' };

describe('journeyPrayers', () => {
  it('a KL → Osaka day flight: Zuhur at the airport, Asar/Maghrib handled by jamak or on arrival', () => {
    // MH 070: KUL 09:50 (+08) → KIX 18:05 (+09). KL Zuhur ~13:10 is after boarding.
    const r = journeyPrayers({ kind: 'flight', startAt: '2026-11-10T09:50:00+08:00', endAt: '2026-11-10T18:05:00+09:00', from: KUL, to: KIX });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((p) => p.text.length > 10)).toBe(true);
    // Zuhur and Asar both pass during the flight; Asar/Zuhur get combined after landing or prayed on board.
    expect(r.map((p) => p.prayer)).toContain('dhuhr');
    expect(r.find((p) => p.prayer === 'dhuhr')?.where).not.toBe('before');
  });

  it('nothing to do for a short hop between prayers', () => {
    // 09:00 → 10:05 in KL time: Subuh is over, Zuhur hasn't started.
    const r = journeyPrayers({ kind: 'flight', startAt: '2026-12-07T09:00:00+08:00', endAt: '2026-12-07T10:05:00+08:00', from: KUL, to: { ...KUL, name: 'Penang', location: { lat: 5.297, lng: 100.277 } } });
    expect(r).toEqual([]);
  });

  it('a flight leaving after Zuhur starts: pray it at the airport', () => {
    const r = journeyPrayers({ kind: 'flight', startAt: '2026-12-07T14:30:00+08:00', endAt: '2026-12-07T15:35:00+08:00', from: KUL, to: { ...KUL, name: 'Penang', location: { lat: 5.297, lng: 100.277 } } });
    expect(r.find((p) => p.prayer === 'dhuhr')?.where).toBe('before');
  });
});
