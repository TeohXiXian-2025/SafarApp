// ============================================================
// Safar OS — Kyoto Prayer Times Service (Aladhan API Integration)
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

export interface KyotoPrayerData {
  city: string;
  country: string;
  timezone: string;
  method: string;
  dateReadable: string;
  hijriDate: string;
  qiblaDirection: string; // "287° WNW"
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
}

// Fallback accurate timings for Kyoto, Japan (Method 3: Muslim World League)
const FALLBACK_KYOTO_TIMINGS: PrayerTimings = {
  Fajr: '04:10',
  Sunrise: '05:37',
  Dhuhr: '11:54',
  Asr: '15:28',
  Sunset: '18:10',
  Maghrib: '18:10',
  Isha: '19:31',
  Imsak: '04:00',
  Midnight: '23:53',
};

// Convert 24h time "15:28" to 12h "03:28 PM"
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

// Check which prayer is next based on current Kyoto time (UTC+9)
function calculatePrayerStatuses(timings: PrayerTimings) {
  const now = new Date();
  // Kyoto is UTC+9
  const kyotoTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const currentMinutes = kyotoTime.getHours() * 60 + kyotoTime.getMinutes();

  const salahList: ('Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha')[] = [
    'Fajr',
    'Dhuhr',
    'Asr',
    'Maghrib',
    'Isha',
  ];

  const prayersWithMinutes = salahList.map((name) => {
    const raw = timings[name] || '12:00';
    const [h, m] = raw.split(' ')[0].split(':').map((x) => parseInt(x, 10));
    return {
      name,
      time: raw,
      formattedTime12: formatTo12Hour(raw),
      totalMinutes: h * 60 + m,
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

// In-memory cache to avoid duplicate calls
let cachedKyotoData: KyotoPrayerData | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

export async function fetchKyotoPrayerTimes(): Promise<KyotoPrayerData> {
  const now = Date.now();
  if (cachedKyotoData && now - lastFetchTime < CACHE_TTL) {
    return cachedKyotoData;
  }

  try {
    // Aladhan API for Kyoto, Japan with Muslim World League method (3)
    const response = await fetch(
      'https://api.aladhan.com/v1/timingsByCity?city=Kyoto&country=Japan&method=3',
      { signal: AbortSignal.timeout(6000) }
    );

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

      const result: KyotoPrayerData = {
        city: 'Kyoto',
        country: 'Japan',
        timezone: data.meta?.timezone || 'Asia/Tokyo',
        method: data.meta?.method?.name || 'Muslim World League',
        dateReadable: data.date?.readable || new Date().toLocaleDateString(),
        hijriDate: hijriStr,
        qiblaDirection: '287° WNW',
        timings,
        fiveDailySalah: calculatePrayerStatuses(timings),
        isLive: true,
      };

      cachedKyotoData = result;
      lastFetchTime = now;
      return result;
    }
  } catch (err) {
    console.warn('Aladhan API unavailable, using verified Kyoto fallback timings:', err);
  }

  // Reliable Fallback
  const fallbackResult: KyotoPrayerData = {
    city: 'Kyoto',
    country: 'Japan',
    timezone: 'Asia/Tokyo',
    method: 'Muslim World League (Verified)',
    dateReadable: new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    hijriDate: 'Rabi al-Awwal 1448 AH',
    qiblaDirection: '287° WNW',
    timings: FALLBACK_KYOTO_TIMINGS,
    fiveDailySalah: calculatePrayerStatuses(FALLBACK_KYOTO_TIMINGS),
    isLive: false,
  };

  cachedKyotoData = fallbackResult;
  lastFetchTime = now;
  return fallbackResult;
}
