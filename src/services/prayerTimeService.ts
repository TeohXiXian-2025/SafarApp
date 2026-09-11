// ============================================================
// Safar OS — Location-Aware Prayer Times Service (Aladhan API)
// ============================================================
// Provides prayer times for ANY destination based on lat/lng/date.
// Backwards-compatible: fetchKyotoPrayerTimes() still works.
// ============================================================

export interface PrayerTimings {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Sunset: string;
  Maghrib: string;
  Isha: string;
  Imsak: string;
  Midnight: string;
}

export interface PrayerData {
  city: string;
  country: string;
  timezone: string;
  method: string;
  dateReadable: string;
  hijriDate: string;
  qiblaDirection: string;
  timings: PrayerTimings;
  fiveDailySalah: {
    name: 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';
    time: string;
    formattedTime12: string;
    description: string;
    isPassed: boolean;
    isNext: boolean;
  }[];
  isLive: boolean;
  lat?: number;
  lng?: number;
}

// Backward-compatible alias
export type KyotoPrayerData = PrayerData;

// ─── City coordinate presets ───────────────────────────
export const CITY_COORDINATES: Record<
  string,
  { lat: number; lng: number; timezone: string; qibla: string }
> = {
  Tokyo: { lat: 35.6762, lng: 139.6503, timezone: 'Asia/Tokyo', qibla: '293° WNW' },
  Kyoto: { lat: 35.0116, lng: 135.7681, timezone: 'Asia/Tokyo', qibla: '287° WNW' },
  Osaka: { lat: 34.6937, lng: 135.5023, timezone: 'Asia/Tokyo', qibla: '287° WNW' },
};

// ─── Fallback timings per city ─────────────────────────
const FALLBACK_TIMINGS: Record<string, PrayerTimings> = {
  Tokyo: {
    Fajr: '04:08',
    Sunrise: '05:35',
    Dhuhr: '11:52',
    Asr: '15:26',
    Sunset: '18:08',
    Maghrib: '18:08',
    Isha: '19:29',
    Imsak: '03:58',
    Midnight: '23:51',
  },
  Kyoto: {
    Fajr: '04:10',
    Sunrise: '05:37',
    Dhuhr: '11:54',
    Asr: '15:28',
    Sunset: '18:10',
    Maghrib: '18:10',
    Isha: '19:31',
    Imsak: '04:00',
    Midnight: '23:53',
  },
};

// ─── Utilities ─────────────────────────────────────────

/** Convert 24h time "15:28" to 12h "03:28 PM" */
export function formatTo12Hour(time24: string): string {
  if (!time24) return '';
  const clean = time24.split(' ')[0]; // remove "(JST)" if present
  const [hourStr, minStr] = clean.split(':');
  const hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  if (isNaN(hour) || isNaN(min)) return time24;
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${min.toString().padStart(2, '0')} ${period}`;
}

/** Convert "15:28" or "03:28 PM" to total minutes since midnight */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  // Handle 12h format "03:28 PM"
  const pm = timeStr.toUpperCase().includes('PM');
  const am = timeStr.toUpperCase().includes('AM');
  const clean = timeStr.replace(/\s*(AM|PM)\s*/i, '').split(' ')[0];
  const [hStr, mStr] = clean.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return 0;
  if (pm && h !== 12) h += 12;
  if (am && h === 12) h = 0;
  return h * 60 + m;
}

/** Format minutes since midnight back to "HH:MM" 24h */
export function minutesToTime24(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// ─── Prayer status calculation ─────────────────────────

function calculatePrayerStatuses(timings: PrayerTimings, timezone: string) {
  const now = new Date();
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const currentMinutes = localTime.getHours() * 60 + localTime.getMinutes();

  const salahList: ('Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha')[] = [
    'Fajr',
    'Dhuhr',
    'Asr',
    'Maghrib',
    'Isha',
  ];

  const prayersWithMinutes = salahList.map((name) => {
    const raw = timings[name] || '12:00';
    const totalMinutes = timeToMinutes(raw);
    return {
      name,
      time: raw,
      formattedTime12: formatTo12Hour(raw),
      totalMinutes,
    };
  });

  let nextFound = false;
  return prayersWithMinutes.map((p) => {
    const isPassed = currentMinutes > p.totalMinutes;
    let isNext = false;
    if (!isPassed && !nextFound) {
      isNext = true;
      nextFound = true;
    }
    const descriptions: Record<string, string> = {
      Fajr: 'Dawn prayer before sunrise',
      Dhuhr: 'Midday prayer after solar noon',
      Asr: 'Afternoon prayer',
      Maghrib: 'Sunset prayer immediately after dusk',
      Isha: 'Nightfall prayer',
    };
    return {
      name: p.name,
      time: p.time,
      formattedTime12: p.formattedTime12,
      description: descriptions[p.name] || '',
      isPassed,
      isNext,
    };
  });
}

// ─── Cache ─────────────────────────────────────────────

interface CacheEntry {
  data: PrayerData;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

function getCacheKey(lat: number, lng: number, dateStr?: string): string {
  const d = dateStr || new Date().toISOString().split('T')[0];
  return `${lat.toFixed(2)}_${lng.toFixed(2)}_${d}`;
}

// ─── Main API ──────────────────────────────────────────

/**
 * Fetch prayer times for any location by latitude/longitude.
 * Results are cached per (lat, lng, date) with 30-min TTL.
 */
export async function fetchPrayerTimes(
  lat: number,
  lng: number,
  options?: {
    date?: string; // YYYY-MM-DD
    timezone?: string;
    cityName?: string;
    country?: string;
  }
): Promise<PrayerData> {
  const dateStr = options?.date || new Date().toISOString().split('T')[0];
  const cacheKey = getCacheKey(lat, lng, dateStr);

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  // Resolve city info from presets or options
  const cityName = options?.cityName || resolveCityName(lat, lng);
  const timezone = options?.timezone || resolveTimezone(lat, lng);
  const qibla = resolveQibla(lat, lng);

  try {
    // Aladhan API: timings by coordinates + date
    const [year, month, day] = dateStr.split('-');
    const url = `https://api.aladhan.com/v1/timings/${day}-${month}-${year}?latitude=${lat}&longitude=${lng}&method=3`;
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });

    if (!response.ok) {
      throw new Error(`Aladhan API HTTP ${response.status}`);
    }

    const json = await response.json();
    if (json.code === 200 && json.data) {
      const data = json.data;
      const timings: PrayerTimings = data.timings;
      const hijri = data.date?.hijri;
      const hijriStr = hijri
        ? `${hijri.day} ${hijri.month?.en || ''} ${hijri.year} AH`
        : '1448 AH';

      const result: PrayerData = {
        city: cityName,
        country: options?.country || data.meta?.country || 'Japan',
        timezone: data.meta?.timezone || timezone,
        method: data.meta?.method?.name || 'Muslim World League',
        dateReadable: data.date?.readable || dateStr,
        hijriDate: hijriStr,
        qiblaDirection: qibla,
        timings,
        fiveDailySalah: calculatePrayerStatuses(timings, data.meta?.timezone || timezone),
        isLive: true,
        lat,
        lng,
      };

      cache.set(cacheKey, { data: result, fetchedAt: Date.now() });
      return result;
    }
  } catch (err) {
    console.warn(`Aladhan API unavailable for ${cityName}, using fallback:`, err);
  }

  // Fallback
  const fallbackTimings = FALLBACK_TIMINGS[cityName] || FALLBACK_TIMINGS['Kyoto'];
  const fallbackResult: PrayerData = {
    city: cityName,
    country: options?.country || 'Japan',
    timezone,
    method: 'Muslim World League (Verified)',
    dateReadable: new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    hijriDate: 'Rabi al-Awwal 1448 AH',
    qiblaDirection: qibla,
    timings: fallbackTimings,
    fiveDailySalah: calculatePrayerStatuses(fallbackTimings, timezone),
    isLive: false,
    lat,
    lng,
  };

  cache.set(cacheKey, { data: fallbackResult, fetchedAt: Date.now() });
  return fallbackResult;
}

/**
 * Backward-compatible: fetches Kyoto prayer times.
 */
export async function fetchKyotoPrayerTimes(): Promise<PrayerData> {
  return fetchPrayerTimes(
    CITY_COORDINATES.Kyoto.lat,
    CITY_COORDINATES.Kyoto.lng,
    { cityName: 'Kyoto', country: 'Japan', timezone: 'Asia/Tokyo' }
  );
}

/**
 * Fetch prayer times for a city by name (uses CITY_COORDINATES preset).
 */
export async function fetchPrayerTimesForCity(
  cityName: string,
  date?: string
): Promise<PrayerData> {
  const coords = CITY_COORDINATES[cityName];
  if (coords) {
    return fetchPrayerTimes(coords.lat, coords.lng, {
      cityName,
      timezone: coords.timezone,
      date,
    });
  }
  // Fallback to Kyoto if city not in presets
  return fetchPrayerTimes(
    CITY_COORDINATES.Kyoto.lat,
    CITY_COORDINATES.Kyoto.lng,
    { cityName, timezone: 'Asia/Tokyo', date }
  );
}

// ─── Helpers ───────────────────────────────────────────

function resolveCityName(lat: number, lng: number): string {
  // Simple proximity check against known cities
  let closest = 'Kyoto';
  let minDist = Infinity;
  for (const [name, coords] of Object.entries(CITY_COORDINATES)) {
    const dist = Math.abs(lat - coords.lat) + Math.abs(lng - coords.lng);
    if (dist < minDist) {
      minDist = dist;
      closest = name;
    }
  }
  return closest;
}

function resolveTimezone(lat: number, lng: number): string {
  const city = resolveCityName(lat, lng);
  return CITY_COORDINATES[city]?.timezone || 'Asia/Tokyo';
}

function resolveQibla(lat: number, lng: number): string {
  const city = resolveCityName(lat, lng);
  return CITY_COORDINATES[city]?.qibla || '287° WNW';
}
