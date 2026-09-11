// ============================================================
// Safar OS — Prayer Conflict Detection Engine
// ============================================================
// Detects when itinerary activities overlap with prayer times,
// considering buffer time and travel time to prayer places.
// ============================================================

import {
  ItineraryStop,
  SalahTime,
  PrayerConflict,
  PrayerConflictSeverity,
  PrayerPlaceResult,
  PrayerSettings,
  DEFAULT_PRAYER_SETTINGS,
} from '../types/itinerary';
import { timeToMinutes } from './prayerTimeService';

// ─── Mock Prayer Places (per city) ────────────────────
// In production, these would come from Google Places API.
// For now, we provide realistic data near itinerary stops.

const PRAYER_PLACES_TOKYO: PrayerPlaceResult[] = [
  {
    id: 'pp-tokyo-1',
    name: 'Tokyo Camii & Turkish Culture Center',
    distance: '1.2 km',
    walkMinutes: 15,
    coordinate: { lat: 35.6682, lng: 139.6767 },
    type: 'mosque',
    hasWudu: true,
    openingHours: 'Open 10AM–6PM',
  },
  {
    id: 'pp-tokyo-2',
    name: 'Asakusa Mosque (Dar Al-Arqam)',
    distance: '0.8 km',
    walkMinutes: 10,
    coordinate: { lat: 35.7188, lng: 139.8035 },
    type: 'mosque',
    hasWudu: true,
    openingHours: 'Open 24 hours',
  },
  {
    id: 'pp-tokyo-3',
    name: 'Tokyo Solamachi 5F Prayer Room',
    distance: '0.3 km',
    walkMinutes: 4,
    coordinate: { lat: 35.7104, lng: 139.8120 },
    type: 'musalla',
    hasWudu: true,
    openingHours: 'Open 10AM–9PM',
  },
  {
    id: 'pp-tokyo-4',
    name: 'Tsukiji Musalla Space',
    distance: '0.2 km',
    walkMinutes: 3,
    coordinate: { lat: 35.6660, lng: 139.7712 },
    type: 'musalla',
    hasWudu: true,
  },
];

const PRAYER_PLACES_KYOTO: PrayerPlaceResult[] = [
  {
    id: 'pp-kyoto-1',
    name: 'Kyoto Islamic Cultural Center (Kyoto Masjid)',
    distance: '1.5 km',
    walkMinutes: 18,
    coordinate: { lat: 35.0210, lng: 135.7710 },
    type: 'mosque',
    hasWudu: true,
    openingHours: 'Open 9AM–9PM',
  },
  {
    id: 'pp-kyoto-2',
    name: 'Umekoji Park Quiet Musalla',
    distance: '0.3 km',
    walkMinutes: 4,
    coordinate: { lat: 34.9868, lng: 135.7435 },
    type: 'musalla',
    hasWudu: true,
  },
  {
    id: 'pp-kyoto-3',
    name: 'Arashiyama Reflection Musalla',
    distance: '0.4 km',
    walkMinutes: 5,
    coordinate: { lat: 35.0150, lng: 135.6710 },
    type: 'quiet_space',
    hasWudu: false,
  },
  {
    id: 'pp-kyoto-4',
    name: 'Ayam-Ya 2F Prayer Room',
    distance: '0.6 km',
    walkMinutes: 8,
    coordinate: { lat: 35.0021, lng: 135.7588 },
    type: 'musalla',
    hasWudu: true,
    openingHours: 'Open 11AM–10PM',
  },
];

/**
 * Get nearby prayer places for a given city.
 * Sorts by distance to the activity coordinate.
 */
export function getNearbyPrayerPlaces(
  city: string,
  activityCoord?: { lat: number; lng: number }
): PrayerPlaceResult[] {
  const places = city.toLowerCase().includes('kyoto')
    ? PRAYER_PLACES_KYOTO
    : PRAYER_PLACES_TOKYO;

  if (!activityCoord) return places;

  // Sort by approximate distance to activity
  return [...places].sort((a, b) => {
    const distA = Math.abs(a.coordinate.lat - activityCoord.lat) +
                  Math.abs(a.coordinate.lng - activityCoord.lng);
    const distB = Math.abs(b.coordinate.lat - activityCoord.lat) +
                  Math.abs(b.coordinate.lng - activityCoord.lng);
    return distA - distB;
  });
}

/**
 * Detect prayer conflicts for a set of itinerary stops.
 *
 * A conflict is detected when an activity's time window overlaps
 * with a prayer time (considering buffer).
 *
 * Severity levels:
 * - 'ok': no overlap at all
 * - 'tight': activity ends within buffer window before prayer
 * - 'overlap': activity directly overlaps prayer time
 */
export function detectPrayerConflicts(
  stops: ItineraryStop[],
  salahTimes: SalahTime[],
  city: string,
  settings: PrayerSettings = DEFAULT_PRAYER_SETTINGS,
): PrayerConflict[] {
  const conflicts: PrayerConflict[] = [];

  // Only check non-prayer stops
  const activityStops = stops.filter(
    (s) => s.category !== 'PRAYER' && s.timeWindow
  );

  for (const stop of activityStops) {
    if (!stop.timeWindow) continue;

    const actStartMin = timeToMinutes(stop.timeWindow.start);
    const actEndMin = timeToMinutes(stop.timeWindow.end);

    for (const salah of salahTimes) {
      // Skip already-passed prayers for conflict detection purposes
      // (we still show them on the timeline)
      const prayerMin = timeToMinutes(salah.time);

      // Define the "prayer window" = prayerTime - buffer to prayerTime + prayerDuration
      const prayerWindowStart = prayerMin - settings.bufferMinutes;
      const prayerWindowEnd = prayerMin + settings.prayerDurationMinutes;

      // Check if activity overlaps with prayer window
      const hasOverlap = actStartMin < prayerWindowEnd && actEndMin > prayerWindowStart;

      if (!hasOverlap) continue;

      // Determine severity
      let severity: PrayerConflictSeverity = 'ok';
      let overlapMinutes = 0;

      // Direct overlap: activity spans over the actual prayer time
      if (actStartMin < prayerMin + settings.prayerDurationMinutes && actEndMin > prayerMin) {
        severity = 'overlap';
        const overlapStart = Math.max(actStartMin, prayerMin);
        const overlapEnd = Math.min(actEndMin, prayerMin + settings.prayerDurationMinutes);
        overlapMinutes = overlapEnd - overlapStart;
      }
      // Tight: activity ends right around prayer time (within buffer)
      else if (actEndMin > prayerWindowStart && actEndMin <= prayerMin) {
        severity = 'tight';
        overlapMinutes = actEndMin - prayerWindowStart;
      }

      if (severity === 'ok') continue;

      // Get nearby prayer places sorted by proximity to this stop
      const nearbyPlaces = getNearbyPrayerPlaces(city, stop.coordinate);

      // Generate suggestion
      const nearest = nearbyPlaces[0];
      let suggestion = '';
      if (severity === 'overlap') {
        suggestion = `${salah.name} begins at ${salah.time} while you are at ${stop.title}. Consider adding a prayer break${nearest ? ` at ${nearest.name} (${nearest.distance}, ${nearest.walkMinutes} min walk)` : ''}.`;
      } else if (severity === 'tight') {
        suggestion = `Your activity at ${stop.title} ends close to ${salah.name} at ${salah.time}. Allow ${settings.bufferMinutes} min buffer for travel to prayer place.`;
      }

      conflicts.push({
        stopId: stop.id,
        stopTitle: stop.title,
        prayerName: salah.name,
        prayerTimeStr: salah.time,
        prayerTimeMinutes: prayerMin,
        activityStartMin: actStartMin,
        activityEndMin: actEndMin,
        overlapMinutes,
        severity,
        travelToNearest: nearest?.walkMinutes,
        nearbyPrayerPlaces: nearbyPlaces.slice(0, 3),
        suggestion,
      });
    }
  }

  return conflicts;
}

/**
 * Get the total number of prayer conflicts for itinerary health scoring.
 */
export function getPrayerConflictCount(conflicts: PrayerConflict[]): number {
  return conflicts.filter((c) => c.severity === 'overlap').length;
}

/**
 * Generate itinerary health data including prayer conflicts.
 */
export function getItineraryHealth(conflicts: PrayerConflict[]): {
  prayerConflicts: number;
  tightSchedules: number;
  healthPercent: number;
  label: string;
} {
  const overlapCount = conflicts.filter((c) => c.severity === 'overlap').length;
  const tightCount = conflicts.filter((c) => c.severity === 'tight').length;

  // Score: start at 100, subtract 15 per overlap, 5 per tight
  const score = Math.max(0, 100 - overlapCount * 15 - tightCount * 5);

  return {
    prayerConflicts: overlapCount,
    tightSchedules: tightCount,
    healthPercent: score,
    label: overlapCount === 0
      ? (tightCount === 0 ? 'No prayer conflicts' : `${tightCount} tight schedule${tightCount > 1 ? 's' : ''}`)
      : `${overlapCount} prayer conflict${overlapCount > 1 ? 's' : ''}`,
  };
}
