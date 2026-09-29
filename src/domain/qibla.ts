// Qibla helpers for the compass on Home. Everything is computed on the device
// from a position and the clock — no API calls.
import { Coordinates, Qibla } from 'adhan';

export const KAABA = { lat: 21.4225, lng: 39.8262 };
const rad = Math.PI / 180;

/** Direction of the qibla from a point, degrees clockwise from true north. */
export const qiblaBearing = (lat: number, lng: number) => Qibla(new Coordinates(lat, lng));

/** Great-circle distance to the Kaaba, km. */
export function distanceToKaabaKm(lat: number, lng: number): number {
  const dLat = (KAABA.lat - lat) * rad;
  const dLng = (KAABA.lng - lng) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(KAABA.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
/** 291 → "WNW". */
export const compassPoint = (deg: number) => POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

/**
 * The sun's position (low-precision solar formulas, good to well under a degree —
 * plenty for "turn about 60° left of your shadow").
 * Azimuth: degrees clockwise from north. Altitude: degrees above the horizon.
 */
export function sunPosition(date: Date, lat: number, lng: number): { azimuth: number; altitude: number } {
  const d = date.getTime() / 86_400_000 + 2440587.5 - 2451545.0; // days since J2000
  const g = (357.529 + 0.98560028 * d) % 360;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = q + 1.915 * Math.sin(g * rad) + 0.02 * Math.sin(2 * g * rad);
  const e = 23.439 - 0.00000036 * d;
  const ra = Math.atan2(Math.cos(e * rad) * Math.sin(L * rad), Math.cos(L * rad)) / rad;
  const dec = Math.asin(Math.sin(e * rad) * Math.sin(L * rad)) / rad;
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const H = (((gmst * 15 + lng - ra) % 360) + 540) % 360 - 180; // hour angle
  const φ = lat * rad;
  const δ = dec * rad;
  const h = H * rad;
  const altitude = Math.asin(Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(h)) / rad;
  const azimuth = ((Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(φ) - Math.tan(δ) * Math.cos(φ)) / rad + 180) % 360 + 360) % 360;
  return { azimuth, altitude };
}

/** Signed turn from one bearing to another, −180…180 (positive = to the right). */
export const turnBetween = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

/**
 * How to find the qibla from the sun right now, or null when the sun is too low
 * to cast a useful shadow. Picks whichever reference (facing the sun, or along
 * your shadow) needs the smaller turn.
 */
export function sunGuide(date: Date, lat: number, lng: number): { ref: 'sun' | 'shadow'; turn: number; sunAzimuth: number; altitude: number } | null {
  const { azimuth, altitude } = sunPosition(date, lat, lng);
  if (altitude < 5) return null;
  const q = qiblaBearing(lat, lng);
  const toSun = turnBetween(azimuth, q);
  const toShadow = turnBetween((azimuth + 180) % 360, q);
  return Math.abs(toSun) <= Math.abs(toShadow) ? { ref: 'sun', turn: toSun, sunAzimuth: azimuth, altitude } : { ref: 'shadow', turn: toShadow, sunAzimuth: azimuth, altitude };
}
