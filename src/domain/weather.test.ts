import { describe, expect, it } from 'vitest';
import { daySummary, isOutdoor, weatherRisk, type HourlyForecast } from './weather';

const day = '2026-12-07';
const f = (rain: number[], code: number[] = [], temp: number[] = [], uv: number[] = []): HourlyForecast => ({
  time: Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, '0')}:00`),
  precipitation_probability: Array.from({ length: 24 }, (_, h) => rain[h] ?? 0),
  weather_code: Array.from({ length: 24 }, (_, h) => code[h] ?? 1),
  temperature_2m: Array.from({ length: 24 }, (_, h) => temp[h] ?? 28),
  uv_index: Array.from({ length: 24 }, (_, h) => uv[h] ?? 3),
});
const at = (h: number) => h * 60;

describe('weather', () => {
  it('knows parks are outdoors and museums are not', () => {
    expect(isOutdoor({ category: 'attraction', types: ['park'] })).toBe(true);
    expect(isOutdoor({ category: 'nature' })).toBe(true);
    expect(isOutdoor({ category: 'culture', types: ['museum'] })).toBe(false);
  });

  it('flags rain during the visit only', () => {
    const rainy = f(Object.assign([], { 15: 80, 16: 70 }));
    expect(weatherRisk(rainy, day, at(14), at(17))?.kind).toBe('rain');
    expect(weatherRisk(rainy, day, at(9), at(11))).toBeNull();
  });

  it('storms beat rain; heat and UV otherwise', () => {
    expect(weatherRisk(f([], Object.assign([], { 12: 95 })), day, at(11), at(13))?.kind).toBe('storm');
    expect(weatherRisk(f([], [], Object.assign([], { 13: 36 })), day, at(12), at(14))?.kind).toBe('heat');
    expect(weatherRisk(f([], [], [], Object.assign([], { 12: 11 })), day, at(11), at(13))?.kind).toBe('uv');
  });

  it('summarises the day', () => {
    expect(daySummary(f(Object.assign([], { 14: 70, 15: 90, 16: 65 })), day)).toMatch(/Rain likely 2 PM–4 PM \(90%\)/);
  });
});
