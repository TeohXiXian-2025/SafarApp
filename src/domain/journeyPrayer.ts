// Prayers that fall around a journey (flight, train, bus, ferry) and where to
// pray them: at the airport / station before boarding, after arriving, by
// combining (jamak) as a traveller, or on board. Guidance, not a ruling —
// the card says to follow your own madhhab. Pure functions.
//
// A traveller (musafir) may combine Zuhur + Asar and Maghrib + Isyak — both in
// the earlier time (jamak taqdim) or both in the later time (jamak ta'khir) —
// and shorten the four-rakaat prayers to two (qasar). Subuh can't be combined.
import type { GeoPoint } from './common.js';
import { prayerTimesOn, type PrayerKey } from './prayer.js';

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
  const atOrigin = windows(j.from.location, j.from.timezone, oOff, [dayShift(depDate, -1), depDate]);
  const atDest = windows(j.to.location, j.to.timezone, dOff, [dayShift(arrDate, -1), arrDate, dayShift(arrDate, 1)]);
  const need = PRAYER_NEED_MIN * 60_000;
  const here = (w: Window[], k: PrayerKey, t: number) => w.find((x) => x.key === k && x.start <= t && t < x.end);

  // Prayers whose time is (partly) spent between boarding and getting out at the other end.
  const affected = atOrigin
    .filter((w) => w.end > boardBy && w.start < dep)
    .concat(atDest.filter((w) => w.start < outAt && w.end > arr - 12 * 3_600_000 && w.start >= dep - 12 * 3_600_000))
    .filter((w, i, all) => all.findIndex((x) => x.key === w.key && Math.abs(x.start - w.start) < 12 * 3_600_000) === i)
    .filter((w) => w.start < outAt && w.end > boardBy)
    .sort((a, b) => a.start - b.start);

  const out: JourneyPrayer[] = [];
  const from = flight ? 'the airport prayer room' : `the station (${j.from.name})`;
  const handled = new Set<PrayerKey>();
  for (const w of affected) {
    if (handled.has(w.key)) continue;
    const originW = here(atOrigin, w.key, Math.max(w.start, dep - 60_000)) ?? w;
    // The window you land in (not tomorrow's).
    const destW = atDest.find((x) => x.key === w.key && x.start <= outAt && x.end > arr) ?? null;
    const L = LABEL[w.key];
    if (originW.start + need <= boardBy && originW.end > originW.start) {
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
        out.push({ prayer: w.key, where: 'jamak_takhir', text: `Jamak ta'khir: pray ${L} and ${LABEL[later]} together (${qasar(earlier)}) after landing, before ${clock(laterW.end, dOff)} ${j.to.name} time.` });
        continue;
      }
    }
    out.push({
      prayer: w.key,
      where: 'on_board',
      text: `${L} falls during the ${flight ? 'flight' : 'journey'} — pray on board: seated if you can't stand, facing the qiblat as best you can, with tayammum if you can't take wudu.`,
    });
  }
  return out;
}
