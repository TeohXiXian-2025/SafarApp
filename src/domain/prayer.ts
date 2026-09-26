// Prayer times (computed offline with adhan) and the visit windows between
// them — so a place with no mosque nearby can still work if the group goes
// after one prayer and is back before the next. Pure functions.
import { CalculationMethod, CalculationParameters, Coordinates, Madhab, PrayerTimes } from 'adhan';
import type { GeoPoint } from './common.js';

export type PrayerKey = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export const PRAYER_LABEL: Record<PrayerKey, string> = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };

/**
 * Local method by country; Muslim World League elsewhere (it matches Aladhan
 * and most published timetables within a minute). Where a national body's
 * official table differs from the textbook method, it's calibrated against
 * that table (checked Sep 2026 for a whole year, several zones):
 * - Malaysia (JAKIM e-Solat): Subuh / Isyak at 18° plus JAKIM's safety
 *   minutes — the old 20° Subuh was 8–12 min early; now within 1–2 min.
 * - Indonesia (Kemenag): +2 min ihtiyat on top of the 20° / 18° method.
 */
export function calcMethod(countryCode?: string): CalculationParameters {
  switch (countryCode?.toUpperCase()) {
    case 'MY': {
      const p = new CalculationParameters('Other', 18, 18);
      p.madhab = Madhab.Shafi;
      p.adjustments = { fajr: 1, sunrise: 0, dhuhr: 2, asr: 1, maghrib: 1, isha: 1 };
      return p;
    }
    case 'ID': {
      const p = CalculationMethod.Singapore();
      p.adjustments = { fajr: 2, sunrise: 0, dhuhr: 2, asr: 2, maghrib: 2, isha: 1 };
      return p;
    }
    case 'SG': case 'BN': return CalculationMethod.Singapore();
    case 'TR': return CalculationMethod.Turkey();
    case 'SA': return CalculationMethod.UmmAlQura();
    case 'AE': return CalculationMethod.Dubai();
    case 'QA': return CalculationMethod.Qatar();
    case 'KW': return CalculationMethod.Kuwait();
    case 'EG': return CalculationMethod.Egyptian();
    case 'PK': case 'IN': case 'BD': return CalculationMethod.Karachi();
    case 'US': case 'CA': return CalculationMethod.NorthAmerica();
    default: return CalculationMethod.MuslimWorldLeague();
  }
}

/**
 * The country a timezone belongs to, for the zones whose local calculation
 * method differs from the default — so an airport or place with no country
 * code (e.g. KLIA on a booking) still uses JAKIM's method, not MWL's.
 */
const ZONE_COUNTRY: Record<string, string> = {
  'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY', 'Asia/Singapore': 'SG', 'Asia/Brunei': 'BN',
  'Asia/Jakarta': 'ID', 'Asia/Pontianak': 'ID', 'Asia/Makassar': 'ID', 'Asia/Jayapura': 'ID',
  'Europe/Istanbul': 'TR', 'Asia/Riyadh': 'SA', 'Asia/Dubai': 'AE', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW',
  'Africa/Cairo': 'EG', 'Asia/Karachi': 'PK', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dhaka': 'BD',
};
export const countryOfZone = (timeZone: string) => ZONE_COUNTRY[timeZone] ?? (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Toronto|Vancouver|Edmonton|Winnipeg|Halifax|Detroit)/.test(timeZone) ? 'US' : undefined);

/** Minutes after midnight, in the place's timezone. */
function localMinutes(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return n('hour') * 60 + n('minute');
}

export interface DayPrayers {
  date: string; // YYYY-MM-DD
  /** Minutes after local midnight. */
  sunrise: number;
  times: Record<PrayerKey, number>;
}

export function prayerTimesOn(date: string, at: GeoPoint, timeZone: string, countryCode?: string): DayPrayers {
  const [y, m, d] = date.split('-').map(Number);
  const p = new PrayerTimes(new Coordinates(at.lat, at.lng), new Date(y, m - 1, d), calcMethod(countryCode ?? countryOfZone(timeZone)));
  const min = (x: Date) => localMinutes(x, timeZone);
  return { date, sunrise: min(p.sunrise), times: { fajr: min(p.fajr), dhuhr: min(p.dhuhr), asr: min(p.asr), maghrib: min(p.maghrib), isha: min(p.isha) } };
}

export interface VisitWindow {
  /** Pray this one first (nearby / at the hotel)… */
  after: PrayerKey | 'sunrise';
  /** …and be done before this one starts. */
  before: PrayerKey;
  start: number;
  end: number;
}

/** Time to pray before heading out. */
export const PRAY_MIN = 20;
/** Night visits are left out — most places are closed and it's rarely the plan. */
const GAPS: [VisitWindow['after'], PrayerKey][] = [
  ['sunrise', 'dhuhr'],
  ['dhuhr', 'asr'],
  ['asr', 'maghrib'],
  ['maghrib', 'isha'],
];

/**
 * Stretches between prayers long enough for the whole visit, clipped to the
 * opening hours when we can read them. Longest first.
 */
export function visitWindows(day: DayPrayers, durationMin: number, open?: [number, number][] | null): VisitWindow[] {
  const at = (k: VisitWindow['after']) => (k === 'sunrise' ? day.sunrise : day.times[k] + PRAY_MIN);
  const out: VisitWindow[] = [];
  for (const [after, before] of GAPS) {
    const gap: [number, number] = [at(after), day.times[before]];
    const pieces = open ? open.map(([o, c]) => [Math.max(o, gap[0]), Math.min(c, gap[1])] as const) : [gap];
    for (const [start, end] of pieces) if (end - start >= durationMin) out.push({ after, before, start, end });
  }
  return out.sort((a, b) => b.end - b.start - (a.end - a.start));
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Opening ranges for one date from Google's weekday descriptions
 * ("Monday: 9:00 AM – 5:00 PM, 7:00 – 10:00 PM"). [] = closed that day,
 * null = open all day or couldn't read it.
 */
export function openingRanges(hours: string[] | undefined, date: string): [number, number][] | null {
  const [y, m, d] = date.split('-').map(Number);
  const day = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const line = hours?.find((h) => h.startsWith(day));
  if (!line) return null;
  const text = line.slice(line.indexOf(':') + 1).replace(/[  ]/g, ' ');
  if (/closed/i.test(text)) return [];
  if (/24 hours/i.test(text)) return null;
  const ranges: [number, number][] = [];
  for (const r of text.split(',')) {
    const t = [...r.matchAll(/(\d{1,2}):(\d{2})\s*(AM|PM)?/gi)];
    if (t.length !== 2) return null;
    // "7:00 – 10:00 PM": the first time shares the second's AM/PM.
    const ampm = [t[0][3] ?? t[1][3], t[1][3]];
    const [o, c] = t.map((x, i) => {
      let h = Number(x[1]) % (ampm[i] ? 12 : 24);
      if (ampm[i]?.toUpperCase() === 'PM') h += 12;
      return h * 60 + Number(x[2]);
    });
    ranges.push([o, c <= o ? 24 * 60 : c]); // closes after midnight → until midnight
  }
  return ranges;
}

export const fmtClock = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  return `${h % 12 || 12}:${String(min % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export const windowText = (w: VisitWindow) =>
  `${fmtClock(w.start)}–${fmtClock(w.end)} (${w.after === 'sunrise' ? 'morning' : `after ${PRAYER_LABEL[w.after]}`}, back before ${PRAYER_LABEL[w.before]})`;

/** The trip day to plan around: today while the trip is on, else its first day. */
export function planningDate(startDate: string, endDate: string, timeZone: string, now = new Date()): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return today >= startDate && today <= endDate ? today : startDate;
}
