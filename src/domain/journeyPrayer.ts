// Prayers that fall around a journey (flight, train, bus, ferry) and where to
// pray them: at the airport / station before boarding, after arriving, by
// combining (jamak) as a traveller, or on board. Guidance, not a ruling —
// the card says to follow your own madhhab. Pure functions.
//
// A traveller (musafir) may combine Zuhur + Asar and Maghrib + Isyak — both in
// the earlier time (jamak taqdim) or both in the later time (jamak ta'khir) —
// and shorten the four-rakaat prayers to two (qasar). Subuh can't be combined.
import { CalculationMethod, Coordinates, PrayerTimes, Qibla } from 'adhan';
import type { GeoPoint } from './common.js';
import { prayerTimesOn, type PrayerKey } from './prayer.js';

// ─── In the air: prayer times where the plane actually is ───────────────────

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** A point `f` (0–1) of the way along the great circle from a to b. */
export function alongRoute(a: GeoPoint, b: GeoPoint, f: number): GeoPoint {
  const [φ1, λ1, φ2, λ2] = [rad(a.lat), rad(a.lng), rad(b.lat), rad(b.lng)];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (d < 1e-9) return a;
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: deg(Math.atan2(z, Math.sqrt(x * x + y * y))), lng: deg(Math.atan2(y, x)) };
}

/** Compass bearing (0 = north) from a towards b. */
export function bearing(a: GeoPoint, b: GeoPoint): number {
  const [φ1, φ2, Δλ] = [rad(a.lat), rad(b.lat), rad(b.lng - a.lng)];
  return (deg(Math.atan2(Math.sin(Δλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ))) + 360) % 360;
}

/** Where the qibla is from a seat facing forward: "ahead", "to your right", "behind you, on the left"… */
export function qiblaFromSeat(heading: number, qibla: number): string {
  const rel = (qibla - heading + 360) % 360;
  const sides = ['ahead', 'ahead, on the right', 'to your right', 'behind you, on the right', 'behind you', 'behind you, on the left', 'to your left', 'ahead, on the left'];
  return sides[Math.round(rel / 45) % 8];
}

export interface AirPrayer {
  prayer: PrayerKey;
  /** When its time begins where the plane is (UTC ms). */
  at: number;
  where: GeoPoint;
  /** Degrees from north, and from the seat. */
  qibla: number;
  fromSeat: string;
}

/**
 * The prayer times that begin while flying, worked out at the plane's
 * position (great-circle route, even speed) — the way in-flight prayer
 * calculators do it: the sun is where the plane is, not where it took off.
 */
export function inFlightPrayers(from: GeoPoint, to: GeoPoint, depMs: number, arrMs: number, stepMin = 5): AirPrayer[] {
  const out: AirPrayer[] = [];
  const total = arrMs - depMs;
  if (total <= 0) return out;
  const keys: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const heading = (f: number) => bearing(alongRoute(from, to, f), alongRoute(from, to, Math.min(1, f + 0.01)));
  for (let t = depMs; t < arrMs; t += stepMin * 60_000) {
    const f = (t - depMs) / total;
    const p = alongRoute(from, to, f);
    // The local calendar date at the plane (sun time: 1 h per 15°).
    const local = new Date(t + (p.lng / 15) * 3_600_000);
    for (const dayShift of [-1, 0]) {
      const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayShift));
      const pt = new PrayerTimes(new Coordinates(p.lat, p.lng), new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), CalculationMethod.MuslimWorldLeague());
      for (const k of keys) {
        const at = pt[k].getTime();
        if (at >= t && at < t + stepMin * 60_000 && !out.some((o) => o.prayer === k && Math.abs(o.at - at) < 6 * 3_600_000)) {
          const q = Qibla(new Coordinates(p.lat, p.lng));
          out.push({ prayer: k, at, where: p, qibla: Math.round(q), fromSeat: qiblaFromSeat(heading(f), q) });
        }
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export interface JourneyPrayer {
  prayer: PrayerKey;
  where: 'before' | 'after' | 'jamak_taqdim' | 'jamak_takhir' | 'on_board';
  text: string;
}

const LABEL: Record<PrayerKey, string> = { fajr: 'Subuh', dhuhr: 'Zuhur', asr: 'Asar', maghrib: 'Maghrib', isha: 'Isyak' };
/** Be done praying this long before departure (boarding) / allow this long after arrival (getting out). */
const BEFORE_MIN = { flight: 45, other: 15 };
const AFTER_MIN = { flight: 45, other: 15 };
/** Time a prayer needs, incl. wudu. */
const PRAYER_NEED_MIN = 15;

/**
 * Which prayers belong to a journey (shown on its card with what to do) and
 * which stay on the timeline as normal locked prayer blocks: a prayer whose
 * time starts too late to finish before boarding closes, or before you're out
 * at the other end, is the journey's; one you can pray at the airport first,
 * or after arriving, is the timeline's. Minutes around departure / arrival.
 */
export const journeyPrayerSpan = (flight: boolean) => ({ before: (flight ? BEFORE_MIN.flight : BEFORE_MIN.other) + PRAYER_NEED_MIN, after: flight ? AFTER_MIN.flight : AFTER_MIN.other });
const PAIR: Partial<Record<PrayerKey, PrayerKey>> = { dhuhr: 'asr', asr: 'dhuhr', maghrib: 'isha', isha: 'maghrib' };
const EARLIER: PrayerKey[] = ['dhuhr', 'maghrib'];

/** Which of a combined pair can be shortened (qasar): Maghrib stays 3 rakaat. */
const qasar = (earlier: PrayerKey) => (earlier === 'maghrib' ? 'Maghrib 3 rakaat, Isyak shortened to 2' : 'qasar, 2 rakaat each');

const offsetMin = (iso: string) => {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(iso);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
};
const dayShift = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

interface Window {
  key: PrayerKey;
  start: number;
  end: number;
}

/** Prayer windows (UTC ms) at a place over the given dates. Each ends when the next prayer (or sunrise) begins. */
function windows(at: GeoPoint, timeZone: string, offset: number, dates: string[]): Window[] {
  const out: Window[] = [];
  for (const d of dates) {
    const p = prayerTimesOn(d, at, timeZone);
    const next = prayerTimesOn(dayShift(d, 1), at, timeZone);
    const t = (date: string, min: number) => Date.parse(`${date}T00:00:00Z`) + (min - offset) * 60_000;
    out.push(
      { key: 'fajr', start: t(d, p.times.fajr), end: t(d, p.sunrise) },
      { key: 'dhuhr', start: t(d, p.times.dhuhr), end: t(d, p.times.asr) },
      { key: 'asr', start: t(d, p.times.asr), end: t(d, p.times.maghrib) },
      { key: 'maghrib', start: t(d, p.times.maghrib), end: t(d, p.times.isha) },
      { key: 'isha', start: t(d, p.times.isha), end: t(dayShift(d, 1), next.times.fajr) },
    );
  }
  return out;
}

const clock = (ms: number, offset: number) => {
  const d = new Date(ms + offset * 60_000);
  const h = d.getUTCHours();
  return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/**
 * Where to pray each prayer whose time falls while you'd be at the airport /
 * station or travelling. Empty when no prayer is affected.
 */
export function journeyPrayers(j: {
  kind: string;
  startAt: string;
  endAt: string;
  from?: { location: GeoPoint; timezone: string; name: string };
  to: { location: GeoPoint; timezone: string; name: string };
}): JourneyPrayer[] {
  if (j.kind === 'hotel' || !j.from) return [];
  const flight = j.kind === 'flight';
  const dep = Date.parse(j.startAt);
  const arr = Date.parse(j.endAt);
  const [oOff, dOff] = [offsetMin(j.startAt), offsetMin(j.endAt)];
  const boardBy = dep - (flight ? BEFORE_MIN.flight : BEFORE_MIN.other) * 60_000;
  const outAt = arr + (flight ? AFTER_MIN.flight : AFTER_MIN.other) * 60_000;
  const depDate = j.startAt.slice(0, 10);
  const arrDate = j.endAt.slice(0, 10);
  const need = PRAYER_NEED_MIN * 60_000;
  const atOrigin = windows(j.from.location, j.from.timezone, oOff, [dayShift(depDate, -1), depDate]);
  const atDest = windows(j.to.location, j.to.timezone, dOff, [dayShift(arrDate, -1), arrDate, dayShift(arrDate, 1)]);
  const here = (w: Window[], k: PrayerKey, t: number) => w.find((x) => x.key === k && x.start <= t && t < x.end);

  // Only prayers whose time starts during the journey (too late to finish before boarding, and
  // before you're out at the other end). One that starts earlier is prayed at the airport, one
  // that starts later after arriving — those are locked prayer blocks on the timeline instead.
  const from0 = boardBy - need;
  const inSpan = (w: Window) => w.start >= from0 && w.start < outAt;
  // The same prayer already under way at the origin before boarding is the timeline's.
  const prayedBefore = (w: Window) => atOrigin.some((x) => x.key === w.key && x.start < from0 && x.end > from0 && Math.abs(x.start - w.start) < 12 * 3_600_000);
  const affected = [...atOrigin.filter(inSpan), ...atDest.filter(inSpan)]
    .filter((w) => !prayedBefore(w))
    .sort((a, b) => a.start - b.start)
    .filter((w, i, all) => all.findIndex((x) => x.key === w.key && Math.abs(x.start - w.start) < 12 * 3_600_000) === i);

  const out: JourneyPrayer[] = [];
  const airTimes = flight ? inFlightPrayers(j.from.location, j.to.location, dep, arr) : [];
  const from = flight ? 'the airport prayer room' : `the station (${j.from.name})`;
  const handled = new Set<PrayerKey>();
  for (const w of affected) {
    if (handled.has(w.key)) continue;
    // The same prayer's window where you set off — it must already have started
    // (at the origin, on the origin's clock) in time to pray before boarding.
    const originW = atOrigin.find((x) => x.key === w.key && Math.abs(x.start - w.start) < 12 * 3_600_000 && x.start + need <= boardBy && x.end > boardBy - need);
    // The window you land in (not tomorrow's).
    const destW = atDest.find((x) => x.key === w.key && x.start <= outAt && x.end > arr) ?? null;
    const L = LABEL[w.key];
    if (originW) {
      out.push({ prayer: w.key, where: 'before', text: `${L} starts ${clock(originW.start, oOff)} — pray it at ${from} before boarding.` });
      continue;
    }
    if (destW && destW.end - need >= outAt) {
      out.push({ prayer: w.key, where: 'after', text: `Pray ${L} after you arrive at ${j.to.name} — its time lasts until ${clock(destW.end, dOff)} there.` });
      continue;
    }
    const pair = PAIR[w.key];
    if (pair) {
      const earlier = EARLIER.includes(w.key) ? w.key : pair;
      const later = EARLIER.includes(w.key) ? pair : w.key;
      const earlierW = here(atOrigin, earlier, boardBy - need) ?? atOrigin.find((x) => x.key === earlier && x.start + need <= boardBy && x.end > boardBy - 6 * 3_600_000);
      const laterW = atDest.find((x) => x.key === later && x.end - need >= outAt && x.start < outAt + 6 * 3_600_000);
      if (w.key === later && earlierW && earlierW.start + need <= boardBy) {
        out.push({ prayer: w.key, where: 'jamak_taqdim', text: `Jamak taqdim: pray ${LABEL[earlier]} and ${L} together (${qasar(earlier)}) at ${from} before boarding, from ${clock(earlierW.start, oOff)}.` });
        continue;
      }
      if (w.key === earlier && laterW) {
        handled.add(later);
        const from2 = Math.max(laterW.start, outAt);
        out.push({
          prayer: w.key,
          where: 'jamak_takhir',
          text: `Jamak ta'khir: pray ${L} and ${LABEL[later]} together (${qasar(earlier)}) after landing — from ${clock(from2, dOff)} until ${clock(laterW.end, dOff)} ${j.to.name} time.`,
        });
        continue;
      }
    }
    // Where the plane is when its time begins: the time on the departure clock and the qibla from your seat.
    const air = flight ? airTimes.find((a) => a.prayer === w.key) : undefined;
    out.push({
      prayer: w.key,
      where: 'on_board',
      text: air
        ? `${L} begins in the air at about ${clock(air.at, oOff)} (${j.from.name} time) — pray on board: seated if you can't stand; the qiblat is ${air.fromSeat} (${air.qibla}° from north); tayammum if you can't take wudu.`
        : `${L} falls during the ${flight ? 'flight' : 'journey'} — pray on board: seated if you can't stand, facing the qiblat as best you can, with tayammum if you can't take wudu.`,
    });
  }
  // "Pray Zuhur before boarding" is already part of "jamak taqdim: Zuhur and Asar together".
  const combined = new Set(out.filter((p) => p.where === 'jamak_taqdim').map((p) => PAIR[p.prayer]));
  return out.filter((p) => !(p.where === 'before' && combined.has(p.prayer)));
}
