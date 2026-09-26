import { describe, expect, it } from 'vitest';
import { firstFit, gapOptions, journeyZones, placeAt } from './placement';
import { planChain, type ChainRow } from './timeline';

const P = (lat: number, lng: number) => ({ lat, lng });
const [X, Y, Z] = [P(35.0, 135.7), P(35.02, 135.7), P(35.04, 135.7)];
/** 20 min between different places, 0 at the same one. */
const travel = (a: { lat: number }, b: { lat: number }) => (a.lat === b.lat ? 0 : 20);
const stop = (id: string, start: number, end: number, loc = X, extra: Partial<ChainRow> = {}): ChainRow => ({ id, start, end, fixed: false, loc, ...extra });
const prayer = (id: string, start: number, end: number, loc = X): ChainRow => ({ id, start, end, fixed: true, prayer: true, loc });
const DAY = '2026-12-07'; // a Monday
const HOURS = ['Monday: 9:00 AM – 5:00 PM', 'Tuesday: Closed'];

describe('firstFit', () => {
  it('starts an empty day at opening time', () => {
    expect(firstFit(DAY, [], { id: 'c', duration: 60, loc: X, hours: HOURS }, travel)?.start).toBe(9 * 60);
  });

  it('leaves room for travel + buffer after the stop before', () => {
    const p = firstFit(DAY, [stop('a', 540, 600)], { id: 'c', duration: 60, loc: Y }, travel, [], 600)!;
    expect(p.start).toBe(630);
    expect(p.legIn).toEqual({ fromId: 'a', minutes: 20 });
  });

  it('never lands on a prayer time', () => {
    const p = firstFit(DAY, [prayer('dhuhr', 780, 810)], { id: 'c', duration: 60, loc: X }, travel, [], 740)!;
    expect(p.start).toBeGreaterThanOrEqual(810);
  });

  it('keeps out of a journey', () => {
    const zones = journeyZones([{ start: 14 * 60, end: 14 * 60, event: 'depart', bookingId: 'f', kind: 'flight', label: 'your flight' }]);
    expect(firstFit(DAY, [], { id: 'c', duration: 60, loc: X }, travel, zones, 10 * 60)?.start).toBe(10 * 60);
    expect(firstFit(DAY, [], { id: 'c', duration: 60, loc: X }, travel, zones, 11 * 60)).toBeNull();
  });

  it('is exactly what the server re-timing keeps (no push after saving → no overlap)', () => {
    // Random days: whatever firstFit suggests, re-timing the day with it in place changes nothing.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 200; n++) {
      const rows: ChainRow[] = [prayer('dhuhr', 760 + Math.floor(rnd() * 30), 790 + Math.floor(rnd() * 30), Z)];
      let t = 480 + Math.floor(rnd() * 120);
      for (let k = 0; k < 3; k++) {
        const len = 30 + Math.floor(rnd() * 6) * 15;
        rows.push(stop(`s${k}`, t, t + len, [X, Y, Z][k % 3]));
        t += len + 30 + Math.floor(rnd() * 120);
      }
      const cand = { id: 'c', duration: 45 + Math.floor(rnd() * 4) * 15, loc: [X, Y, Z][Math.floor(rnd() * 3)] };
      const p = firstFit(DAY, rows, cand, travel);
      if (!p) continue;
      const before = planChain(rows, travel, undefined, { tight: true }).starts;
      const after = planChain([...rows, { id: 'c', start: p.start, end: p.end, fixed: false, loc: cand.loc, pinned: true }], travel, undefined, { tight: true }).starts;
      expect(after.get('c')).toBe(p.start);
      // Nothing else starts later (a stop after it may even start earlier: a shorter trip from the new one).
      for (const r of rows) if (!r.fixed) expect(after.get(r.id)!).toBeLessThanOrEqual(before.get(r.id)!);
    }
  });
});

describe('placeAt', () => {
  it('says why it does not fit', () => {
    expect(placeAt('2026-12-08', [], { id: 'c', duration: 60, hours: HOURS }, 600, travel).problem).toBe('closed');
    expect(placeAt(DAY, [], { id: 'c', duration: 60, hours: HOURS }, 16 * 60 + 30, travel).problem).toBe('hours');
    expect(placeAt(DAY, [], { id: 'c', duration: 90 }, 23 * 60, travel).problem).toBe('midnight');
  });

  it('A → pray → back to A: a stop you can pray at holds the prayer and gets its time back', () => {
    const rows = [prayer('asr', 15 * 60 + 30, 16 * 60)];
    const p = placeAt(DAY, rows, { id: 'c', duration: 60, loc: X, prayInside: true }, 15 * 60, travel);
    expect(p.ok).toBe(true);
    expect(p.start).toBe(15 * 60);
    expect(p.prayerInside).toBe(30);
    expect(p.end).toBe(16 * 60 + 30);
    // A place without a prayer room can't start inside the prayer — but it may not run through it either.
    const q = placeAt(DAY, rows, { id: 'c', duration: 60, loc: X }, 15 * 60, travel);
    expect(q.prayerInside).toBe(0);
  });
});

describe('gapOptions', () => {
  it('offers every gap with the time it would start and what it pushes', () => {
    const rows = [stop('a', 540, 600, X), stop('b', 660, 720, X)];
    const opts = gapOptions(DAY, rows, { id: 'c', duration: 60, loc: Y }, travel);
    expect(opts.map((o) => o.key)).toEqual(['^|a', 'a|b', 'b|$']);
    const mid = opts[1].placement;
    expect(mid.start).toBe(630); // 10:00 + 20 min + 10 min buffer
    // Chained tightly, b followed a at 10:00 (same place); now it follows the new stop: 11:30 + 30 → 12:00.
    expect(mid.pushed).toEqual([{ id: 'b', by: 120 }]);
    // Before a (from 8:00): it goes first and a moves later to make room for the trip.
    expect(opts[0].placement.start).toBe(480);
    expect(opts[0].placement.pushed).toEqual([
      { id: 'a', by: 30 },
      { id: 'b', by: 30 },
    ]);
    // After b (which follows a straight away at 10:00–11:00): 11:00 + 20 + 10.
    expect(opts[2].placement.start).toBe(690);
  });

  it('does not open a gap between a visit and the prayer inside it', () => {
    const rows = [stop('a', 12 * 60, 15 * 60, X), prayer('dhuhr', 13 * 60, 13 * 60 + 30)];
    expect(gapOptions(DAY, rows, { id: 'c', duration: 30, loc: X }, travel).map((o) => o.key)).toEqual(['^|a', 'a|$']);
  });

  it('marks a gap too short before a prayer time', () => {
    const rows = [stop('a', 12 * 60, 12 * 60 + 30, X), prayer('dhuhr', 13 * 60, 13 * 60 + 30)];
    const o = gapOptions(DAY, rows, { id: 'c', duration: 60, loc: X }, travel).find((g) => g.key === 'a|dhuhr')!;
    expect(o.placement.ok).toBe(false);
    expect(o.placement.problem).toBe('full');
  });

  it('a stop you can pray at still needs room to start before the prayer time', () => {
    const rows = [stop('a', 9 * 60 + 45, 11 * 60 + 15, X), prayer('dhuhr', 11 * 60 + 35, 12 * 60 + 5, Y)];
    const o = gapOptions(DAY, rows, { id: 'c', duration: 90, loc: Z, prayInside: true }, travel).find((g) => g.key === 'a|dhuhr')!;
    expect(o.placement.ok).toBe(false);
  });
});
