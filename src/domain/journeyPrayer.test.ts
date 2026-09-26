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

describe('journeyPrayers — times on the right clock', () => {
  const HND = { location: { lat: 35.5494, lng: 139.7798 }, timezone: 'Asia/Tokyo', name: 'Haneda' };

  it("never says a prayer 'starts' before it has started where you board (Asar isn't in yet at 14:30 in KL)", () => {
    // KL Asar ≈ 16:26; Tokyo's Asar (14:09 JST = 13:09 KL time) must not be quoted as KL's.
    const r = journeyPrayers({ kind: 'flight', startAt: '2026-12-01T14:30:00+08:00', endAt: '2026-12-01T22:30:00+09:00', from: KUL, to: HND });
    expect(r.find((p) => p.prayer === 'asr')?.where).toBe('jamak_taqdim');
    expect(r.some((p) => p.where === 'before' && p.prayer === 'asr')).toBe(false);
    // Zuhur is folded into the jamak taqdim line, not listed twice.
    expect(r.filter((p) => p.prayer === 'dhuhr')).toEqual([]);
  });

  it('uses the Malaysian (JAKIM) method for KLIA even without a country code', () => {
    // MWL would say Isyak 8:11 PM; JAKIM's 18° gives ~8:15 PM.
    const r = journeyPrayers({ kind: 'flight', startAt: '2026-12-01T22:30:00+08:00', endAt: '2026-12-02T06:30:00+09:00', from: KUL, to: HND });
    expect(r.find((p) => p.prayer === 'isha')?.text).toMatch(/8:1[5-7] PM/);
  });

  it("jamak ta'khir says when the later prayer's time starts", () => {
    const r = journeyPrayers({ kind: 'flight', startAt: '2026-12-01T09:00:00+08:00', endAt: '2026-12-01T17:00:00+09:00', from: KUL, to: HND });
    expect(r.find((p) => p.where === 'jamak_takhir')?.text).toMatch(/from 5:5\d PM until/);
  });
});
