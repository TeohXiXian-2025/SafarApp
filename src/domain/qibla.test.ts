import { describe, expect, it } from 'vitest';
import { compassPoint, distanceToKaabaKm, qiblaBearing, sunGuide, sunPosition, turnBetween } from './qibla';

describe('qibla', () => {
  it('points west-north-west from Kyoto and Kuala Lumpur', () => {
    expect(qiblaBearing(35.0116, 135.7681)).toBeGreaterThan(288);
    expect(qiblaBearing(35.0116, 135.7681)).toBeLessThan(295);
    expect(qiblaBearing(3.139, 101.6869)).toBeCloseTo(292.5, 0);
    expect(compassPoint(qiblaBearing(35.0116, 135.7681))).toBe('WNW');
  });

  it('measures the distance to Makkah', () => {
    const km = distanceToKaabaKm(35.0116, 135.7681);
    expect(km).toBeGreaterThan(9000);
    expect(km).toBeLessThan(9400);
  });

  it('turns the short way round', () => {
    expect(turnBetween(350, 10)).toBe(20);
    expect(turnBetween(10, 350)).toBe(-20);
    expect(turnBetween(0, 180)).toBe(-180);
  });
});

describe('sun', () => {
  it('is due south and high at local noon in the northern mid-latitudes (equinox)', () => {
    // 2026-03-20 12:00 UTC at lng 0 → local solar noon (± equation of time).
    const s = sunPosition(new Date('2026-03-20T12:07:00Z'), 35, 0);
    expect(s.azimuth).toBeGreaterThan(175);
    expect(s.azimuth).toBeLessThan(185);
    expect(s.altitude).toBeGreaterThan(50);
    expect(s.altitude).toBeLessThan(60);
  });

  it('rises in the east and sets in the west', () => {
    const morning = sunPosition(new Date('2026-03-20T07:00:00Z'), 35, 0);
    const evening = sunPosition(new Date('2026-03-20T17:00:00Z'), 35, 0);
    expect(morning.azimuth).toBeGreaterThan(60);
    expect(morning.azimuth).toBeLessThan(120);
    expect(evening.azimuth).toBeGreaterThan(240);
    expect(evening.azimuth).toBeLessThan(300);
  });

  it('gives no sun guide at night', () => {
    expect(sunGuide(new Date('2026-03-20T00:00:00Z'), 35, 0)).toBeNull();
  });

  it('gives a turn that lands on the qibla', () => {
    const at = new Date('2026-09-28T02:18:00Z'); // 11:18 in Kyoto
    const g = sunGuide(at, 35.0116, 135.7681)!;
    expect(g).not.toBeNull();
    const facing = g.ref === 'sun' ? g.sunAzimuth : (g.sunAzimuth + 180) % 360;
    expect(Math.abs(turnBetween((facing + g.turn + 360) % 360, qiblaBearing(35.0116, 135.7681)))).toBeLessThan(0.001);
  });
});
