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

  it('a flight leaving after Zuhur starts: Zuhur is prayed at the airport — a timeline block, not on the card', () => {
    const r = journeyPrayers({ kind: 'flight', startAt: '2026-12-07T14:30:00+08:00', endAt: '2026-12-07T15:35:00+08:00', from: KUL, to: { ...KUL, name: 'Penang', location: { lat: 5.297, lng: 100.277 } } });
    expect(r.find((p) => p.prayer === 'dhuhr')).toBeUndefined();
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

  it('a night flight: Isyak (already in before boarding) stays on the timeline; Subuh in the air is on the card', () => {
    const r = journeyPrayers({ kind: 'flight', startAt: '2026-12-01T22:30:00+08:00', endAt: '2026-12-02T06:30:00+09:00', from: KUL, to: HND });
    expect(r.map((p) => p.prayer)).toEqual(['fajr']);
    expect(r[0].where).toBe('on_board');
  });

  it("jamak ta'khir says when the later prayer's time starts", () => {
    const r = journeyPrayers({ kind: 'flight', startAt: '2026-12-01T09:00:00+08:00', endAt: '2026-12-01T17:00:00+09:00', from: KUL, to: HND });
    expect(r.find((p) => p.where === 'jamak_takhir')?.text).toMatch(/from 5:5\d PM until/);
  });
});

describe('card and timeline never show the same prayer', () => {
  it('KL 14:30 → Tokyo: Zuhur on the timeline (airport), Asar/Maghrib/Isyak on the card', async () => {
    const { prayerBreaks, journeySpans } = await import('./arrange');
    const { prayerTimesOn } = await import('./prayer');
    const HND = { location: { lat: 35.5494, lng: 139.7798 }, timezone: 'Asia/Tokyo', name: 'Haneda' };
    const card = journeyPrayers({ kind: 'flight', startAt: '2026-12-01T14:30:00+08:00', endAt: '2026-12-01T22:30:00+09:00', from: KUL, to: HND }).map((p) => p.prayer);
    // The departure day on the KL clock: departs 14:30, arrives 21:30 KL time.
    const kl = prayerTimesOn('2026-12-01', KUL.location, KUL.timezone);
    const spans = journeySpans([{ start: 14 * 60 + 30, end: 14 * 60 + 30, event: 'depart', bookingId: 'f', flight: true }]);
    const timeline = prayerBreaks(kl, [], KUL.location, spans, [0, 24 * 60]).prayers.map((p) => p.key);
    expect(timeline).toContain('dhuhr');
    expect(card).not.toContain('dhuhr');
    for (const k of card) expect(timeline).not.toContain(k);
  });
});

describe('in-flight prayer times (at the plane’s position, like in-flight calculators)', () => {
  it('KL → Osaka: Zuhur starts over the sea earlier than in KL, qibla behind-left while flying north-east', async () => {
    const { inFlightPrayers, qiblaFromSeat } = await import('./journeyPrayer');
    const air = inFlightPrayers(KUL.location, KIX.location, Date.parse('2026-11-10T09:50:00+08:00'), Date.parse('2026-11-10T18:05:00+09:00'));
    const dhuhr = air.find((a) => a.prayer === 'dhuhr')!;
    expect(dhuhr).toBeDefined();
    expect(dhuhr.at).toBeLessThan(Date.parse('2026-11-10T13:05:00+08:00')); // KL's own Zuhur is ~13:05
    expect(dhuhr.where.lng).toBeGreaterThan(101.7);
    expect(dhuhr.fromSeat).toBe('behind you, on the left');
    expect(qiblaFromSeat(290, 292)).toBe('ahead');
    expect(qiblaFromSeat(0, 90)).toBe('to your right');
  });
  it('the flight card names when and where the qiblat is for prayers on board', () => {
    const r = journeyPrayers({ kind: 'flight', startAt: '2026-11-10T09:50:00+08:00', endAt: '2026-11-10T18:05:00+09:00', from: KUL, to: KIX });
    expect(r.find((p) => p.prayer === 'dhuhr')?.text).toMatch(/begins in the air at about 12:\d\d PM \(KLIA time\).*qiblat is behind you, on the left/);
  });
});
