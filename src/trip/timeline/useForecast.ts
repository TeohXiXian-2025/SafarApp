// The hourly forecast for one day at one place (Open-Meteo, free, no key),
// for days from today up to FORECAST_DAYS ahead. Cached per place+day for
// the session; null while loading, outside the forecast range, or offline.
import { useEffect, useState } from 'react';
import { FORECAST_DAYS, forecastUrl, type GeoPoint, type HourlyForecast } from '../../domain';

const cache = new Map<string, HourlyForecast | null>();

export function useForecast(day: string, at: GeoPoint | undefined): HourlyForecast | null {
  const today = new Date().toISOString().slice(0, 10);
  const ahead = (Date.parse(day) - Date.parse(today)) / 86_400_000;
  const url = at && ahead >= -1 && ahead <= FORECAST_DAYS ? forecastUrl(at, day) : null;
  const [data, setData] = useState<HourlyForecast | null>(url ? (cache.get(url) ?? null) : null);

  useEffect(() => {
    if (!url) return setData(null);
    if (cache.has(url)) return setData(cache.get(url) ?? null);
    let cancelled = false;
    fetch(url, { signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { hourly?: HourlyForecast } | null) => {
        const h = j?.hourly ?? null;
        cache.set(url, h);
        if (!cancelled) setData(h);
      })
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return data;
}
