// ============================================================
// Safar OS — Real Weather Service (Open-Meteo Live API)
// ============================================================
// Fetches live real-world weather without API keys.
// Provides WMO weather code parsing, autumn season detection,
// and maps conditions to anime visual simulation presets.
// ============================================================

export type AnimeWeatherCondition =
  | 'SUNNY'
  | 'RAINY'
  | 'AUTUMN'
  | 'SNOW'
  | 'CLOUDY'
  | 'NIGHT';

export interface WeatherData {
  city: string;
  latitude: number;
  longitude: number;
  temperature: number; // in Celsius
  temperatureUnit: string;
  humidity: number; // in %
  windSpeed: number; // in km/h
  weatherCode: number;
  condition: AnimeWeatherCondition;
  conditionLabel: string;
  conditionEmoji: string;
  description: string;
  isDay: boolean;
  isLive: boolean;
  isAutumnSeason: boolean;
  timestamp: string;
}

// Preset coordinates for popular travel destinations in Safar OS
export const DESTINATION_COORDINATES: Record<
  string,
  { lat: number; lng: number; timezone: string; country: string }
> = {
  Tokyo: { lat: 35.6762, lng: 139.6503, timezone: 'Asia/Tokyo', country: 'Japan' },
  Kyoto: { lat: 35.0116, lng: 135.7681, timezone: 'Asia/Tokyo', country: 'Japan' },
  Osaka: { lat: 34.6937, lng: 135.5023, timezone: 'Asia/Tokyo', country: 'Japan' },
  Sapporo: { lat: 43.0618, lng: 141.3545, timezone: 'Asia/Tokyo', country: 'Japan' },
  Seoul: { lat: 37.5665, lng: 126.978, timezone: 'Asia/Seoul', country: 'South Korea' },
  London: { lat: 51.5074, lng: -0.1278, timezone: 'Europe/London', country: 'UK' },
  Paris: { lat: 48.8566, lng: 2.3522, timezone: 'Europe/Paris', country: 'France' },
  Makkah: { lat: 21.4225, lng: 39.8262, timezone: 'Asia/Riyadh', country: 'Saudi Arabia' },
  Madinah: { lat: 24.5247, lng: 39.5692, timezone: 'Asia/Riyadh', country: 'Saudi Arabia' },
  Dubai: { lat: 25.2048, lng: 55.2708, timezone: 'Asia/Dubai', country: 'UAE' },
  Istanbul: { lat: 41.0082, lng: 28.9784, timezone: 'Europe/Istanbul', country: 'Turkey' },
  KualaLumpur: { lat: 3.139, lng: 101.6869, timezone: 'Asia/Kuala_Lumpur', country: 'Malaysia' },
};

// Check if current date is in Autumn season (Northern Hemisphere: Sept, Oct, Nov)
export function isAutumnInNorthernHemisphere(date: Date = new Date()): boolean {
  const month = date.getMonth(); // 0 = Jan, 8 = Sept, 9 = Oct, 10 = Nov
  return month >= 8 && month <= 10;
}

// Map WMO Weather Interpretation Codes to descriptions and Anime Simulation Conditions
export function parseWmoWeatherCode(
  code: number,
  isDay: boolean = true,
  checkAutumn: boolean = true
): {
  condition: AnimeWeatherCondition;
  label: string;
  emoji: string;
  description: string;
} {
  const isAutumn = checkAutumn && isAutumnInNorthernHemisphere();

  // Rain / Drizzle / Showers / Thunderstorms
  if ([51, 53, 55, 56, 57].includes(code)) {
    return {
      condition: 'RAINY',
      label: 'Light Drizzle',
      emoji: '🌦️',
      description: 'Gentle misty rain falling over the streets',
    };
  }
  if ([61, 63, 65, 66, 67].includes(code)) {
    return {
      condition: 'RAINY',
      label: code >= 65 ? 'Heavy Rain' : 'Rain Showers',
      emoji: '🌧️',
      description: 'Shinkai-style atmospheric rainfall with ripples',
    };
  }
  if ([80, 81, 82].includes(code)) {
    return {
      condition: 'RAINY',
      label: 'Sudden Showers',
      emoji: '🌧️',
      description: 'Passing rain clouds with scenic reflections',
    };
  }
  if ([95, 96, 99].includes(code)) {
    return {
      condition: 'RAINY',
      label: 'Thunderstorm',
      emoji: '⛈️',
      description: 'Dynamic cinematic storm with downpours',
    };
  }

  // Snow
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return {
      condition: 'SNOW',
      label: 'Snowfall',
      emoji: '❄️',
      description: 'Soft anime snowflakes drifting gracefully',
    };
  }

  // Fog
  if ([45, 48].includes(code)) {
    return {
      condition: isAutumn ? 'AUTUMN' : 'CLOUDY',
      label: 'Morning Fog',
      emoji: '🌫️',
      description: isAutumn ? 'Crisp autumn morning mist' : 'Dreamy atmospheric fog',
    };
  }

  // Clear / Sunny
  if (code === 0) {
    if (!isDay) {
      return {
        condition: 'NIGHT',
        label: 'Clear Night',
        emoji: '🌙',
        description: 'Starlit anime sky with shimmering fireflies',
      };
    }
    // If it is autumn season and bright, autumn foliage is stunning!
    if (isAutumn) {
      return {
        condition: 'AUTUMN',
        label: 'Autumn Sun',
        emoji: '🍁',
        description: 'Crisp autumn sunshine with swirling momiji leaves',
      };
    }
    return {
      condition: 'SUNNY',
      label: 'Radiant Sunshine',
      emoji: '☀️',
      description: 'Warm golden god rays and shimmering sunbeams',
    };
  }

  // Mainly Clear / Partly Cloudy
  if (code === 1 || code === 2) {
    if (!isDay) {
      return {
        condition: 'NIGHT',
        label: 'Starry Night',
        emoji: '✨',
        description: 'Partly veiled night sky with quiet breezes',
      };
    }
    if (isAutumn) {
      return {
        condition: 'AUTUMN',
        label: 'Autumn Breeze',
        emoji: '🍂',
        description: 'Golden hour fall foliage drifting in the wind',
      };
    }
    return {
      condition: 'SUNNY',
      label: 'Partly Sunny',
      emoji: '⛅',
      description: 'Bright sunbeams piercing through anime clouds',
    };
  }

  // Overcast (Code 3)
  if (code === 3) {
    if (isAutumn) {
      return {
        condition: 'AUTUMN',
        label: 'Autumn Overcast',
        emoji: '🍁',
        description: 'Cool fall breeze sweeping red and gold foliage',
      };
    }
    return {
      condition: 'CLOUDY',
      label: 'Overcast',
      emoji: '☁️',
      description: 'Gentle ambient anime breeze with cloud shadows',
    };
  }

  // Fallback
  return {
    condition: isAutumn ? 'AUTUMN' : 'SUNNY',
    label: 'Mild Weather',
    emoji: isAutumn ? '🍁' : '☀️',
    description: 'Pleasant travel conditions for exploring',
  };
}

// In-memory cache to prevent redundant network calls within 5 minutes
const weatherCache = new Map<string, { data: WeatherData; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch real live weather from Open-Meteo for a given city or coordinates.
 */
export async function fetchLiveWeather(
  cityName: string = 'Tokyo',
  overrideCoords?: { lat: number; lng: number }
): Promise<WeatherData> {
  // Normalize city name
  const cleanCity = cityName.trim();
  const normalizedKey = cleanCity.toLowerCase().replace(/\s+/g, '');

  let lat = 35.6762;
  let lng = 139.6503;
  let tz = 'Asia/Tokyo';

  if (overrideCoords) {
    lat = overrideCoords.lat;
    lng = overrideCoords.lng;
  } else {
    // Find in presets
    const foundKey = Object.keys(DESTINATION_COORDINATES).find(
      (k) => k.toLowerCase() === normalizedKey
    );
    if (foundKey) {
      const coord = DESTINATION_COORDINATES[foundKey];
      lat = coord.lat;
      lng = coord.lng;
      tz = coord.timezone;
    }
  }

  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const now = Date.now();
  const cached = weatherCache.get(cacheKey);

  if (cached && cached.expiry > now) {
    return cached.data;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day&timezone=${encodeURIComponent(
      tz
    )}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Weather API returned HTTP ${response.status}`);
    }

    const json = await response.json();
    const current = json.current;
    const isDay = current.is_day === 1;
    const isAutumn = isAutumnInNorthernHemisphere();
    const parsed = parseWmoWeatherCode(current.weather_code, isDay, true);

    const weatherData: WeatherData = {
      city: cleanCity,
      latitude: lat,
      longitude: lng,
      temperature: Math.round(current.temperature_2m * 10) / 10,
      temperatureUnit: '°C',
      humidity: current.relative_humidity_2m,
      windSpeed: Math.round(current.wind_speed_10m * 10) / 10,
      weatherCode: current.weather_code,
      condition: parsed.condition,
      conditionLabel: parsed.label,
      conditionEmoji: parsed.emoji,
      description: parsed.description,
      isDay,
      isLive: true,
      isAutumnSeason: isAutumn,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    weatherCache.set(cacheKey, { data: weatherData, expiry: now + CACHE_TTL_MS });
    return weatherData;
  } catch (err) {
    console.warn('Live weather fetch failed, falling back to simulated live conditions:', err);
    // Graceful fallback
    const isAutumn = isAutumnInNorthernHemisphere();
    return {
      city: cleanCity,
      latitude: lat,
      longitude: lng,
      temperature: isAutumn ? 21.5 : 24.0,
      temperatureUnit: '°C',
      humidity: 68,
      windSpeed: 4.5,
      weatherCode: isAutumn ? 2 : 0,
      condition: isAutumn ? 'AUTUMN' : 'SUNNY',
      conditionLabel: isAutumn ? 'Autumn Foliage' : 'Clear & Pleasant',
      conditionEmoji: isAutumn ? '🍁' : '☀️',
      description: isAutumn
        ? 'Golden autumn breeze with fluttering momiji foliage'
        : 'Pleasant sun with warm anime light rays',
      isDay: true,
      isLive: false,
      isAutumnSeason: isAutumn,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  }
}
