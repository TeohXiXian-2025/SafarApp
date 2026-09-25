// Live weather for the plan: which stops are outdoors, and whether the
// forecast (Open-Meteo, hourly, no key) makes one a bad idea at its time —
// rain, storms, heat or strong sun. Pure functions; fetching lives in the
// client (timeline) and the reminders job (alerts during the trip).
import type { IdeaCategory } from './idea.js';

/** Google place types that are (mostly) outdoors. */
const OUTDOOR_TYPES = new Set([
  'park', 'national_park', 'state_park', 'beach', 'hiking_area', 'zoo', 'amusement_park', 'water_park', 'garden', 'botanical_garden',
  'campground', 'marina', 'playground', 'ski_resort', 'observation_deck', 'plaza', 'night_market', 'farm', 'wildlife_park', 'dog_park',
  'picnic_ground', 'adventure_sports_center', 'golf_course', 'cycling_park', 'historical_landmark', 'monument',
]);

export function isOutdoor(place: { category: IdeaCategory; types?: string[] }): boolean {
  return place.category === 'nature' || (place.types ?? []).some((t) => OUTDOOR_TYPES.has(t));
}

/** Open-Meteo hourly forecast (local times, `timezone=auto`). */
export interface HourlyForecast {
  time: string[];
  precipitation_probability: (number | null)[];
  weather_code: (number | null)[];
  temperature_2m: (number | null)[];
  uv_index: (number | null)[];
}

export const forecastUrl = (at: { lat: number; lng: number }, day: string) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${at.lat.toFixed(3)}&longitude=${at.lng.toFixed(3)}&hourly=precipitation_probability,weather_code,temperature_2m,uv_index&timezone=auto&start_date=${day}&end_date=${day}`;

/** Forecasts only reach this far ahead. */
export const FORECAST_DAYS = 14;

export interface WeatherRisk {
  kind: 'storm' | 'rain' | 'heat' | 'uv';
  text: string;
}

const RAIN_PCT = 60;
const HEAT_C = 34;
const UV_MAX = 9;
// WMO codes: 95–99 thunderstorm, 61–67 / 80–82 rain & showers.
const STORM = (c: number) => c >= 95;
const RAINY = (c: number) => (c >= 61 && c <= 67) || (c >= 80 && c <= 82);

/** The worst weather problem for a visit from `start` to `end` (minutes after local midnight), or null. */
export function weatherRisk(f: HourlyForecast, day: string, start: number, end: number): WeatherRisk | null {
  const hours = f.time
    .map((t, i) => ({ t, i, h: Number(t.slice(11, 13)) }))
    .filter((x) => x.t.startsWith(day) && x.h * 60 + 59 >= start && x.h * 60 < end);
  if (!hours.length) return null;
  const val = (arr: (number | null)[], i: number) => arr[i] ?? 0;
  const storm = hours.find((x) => STORM(val(f.weather_code, x.i)));
  if (storm) return { kind: 'storm', text: `Thunderstorm forecast around ${storm.t.slice(11, 16)} — not safe outdoors.` };
  const wettest = hours.reduce((a, b) => (val(f.precipitation_probability, b.i) > val(f.precipitation_probability, a.i) ? b : a));
  const pct = val(f.precipitation_probability, wettest.i);
  if (pct >= RAIN_PCT || (pct >= 40 && RAINY(val(f.weather_code, wettest.i)))) return { kind: 'rain', text: `${pct}% chance of rain around ${wettest.t.slice(11, 16)} — bring umbrellas or swap with an indoor stop.` };
  const hottest = hours.reduce((a, b) => (val(f.temperature_2m, b.i) > val(f.temperature_2m, a.i) ? b : a));
  const temp = val(f.temperature_2m, hottest.i);
  if (temp >= HEAT_C) return { kind: 'heat', text: `${Math.round(temp)}°C around ${hottest.t.slice(11, 16)} — very hot outdoors; go earlier or later and carry water.` };
  const uv = Math.max(...hours.map((x) => val(f.uv_index, x.i)));
  if (uv >= UV_MAX) return { kind: 'uv', text: `UV index ${Math.round(uv)} — strong sun; shade, hats and sunscreen.` };
  return null;
}

/** A one-line summary of the day ("🌧 70% rain 2–5 PM · up to 33°C"). */
export function daySummary(f: HourlyForecast, day: string): string | null {
  const idx = f.time.map((t, i) => (t.startsWith(day) ? i : -1)).filter((i) => i >= 0 && Number(f.time[i].slice(11, 13)) >= 8 && Number(f.time[i].slice(11, 13)) <= 21);
  if (!idx.length) return null;
  const wet = idx.filter((i) => (f.precipitation_probability[i] ?? 0) >= RAIN_PCT);
  const maxT = Math.max(...idx.map((i) => f.temperature_2m[i] ?? -99));
  const h = (i: number) => {
    const n = Number(f.time[i].slice(11, 13));
    return `${n % 12 || 12} ${n < 12 ? 'AM' : 'PM'}`;
  };
  const parts = [
    wet.length ? `🌧 Rain likely ${h(wet[0])}–${h(wet.at(-1)!)} (${Math.max(...wet.map((i) => f.precipitation_probability[i] ?? 0))}%)` : '⛅ Mostly dry',
    maxT > -99 ? `up to ${Math.round(maxT)}°C` : '',
  ];
  return parts.filter(Boolean).join(' · ');
}
