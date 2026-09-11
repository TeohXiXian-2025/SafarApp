// ============================================================
// Safar OS — useHalalRadar Hook
// Location fetch, geo-fence filtering, distance calculation, ranking
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { GeoCoordinate } from '../types/itinerary';
import {
  HalalRestaurant,
  HalalStatus,
  HalalRadarResult,
  WalkingDistance,
  HalalRadarOptions,
  MealtimeTrigger,
  HALAL_STATUS_PRIORITY,
} from '../types/halalRadar';
import { getAllHalalRestaurants } from '../data/halalRadarData';

// ─── Constants ───────────────────────────────────────────────

/** Earth's mean radius in meters */
const EARTH_RADIUS_M = 6_371_000;

/** Walking speed assumption: 5 km/h */
const WALKING_SPEED_MPS = 5_000 / 3_600; // ~1.389 m/s

/** Detour factor: real walking routes are ~1.3× the straight-line distance */
const DETOUR_FACTOR = 1.3;

/** Default geo-fence radius in meters */
const DEFAULT_RADIUS_M = 2_000;

/** Geolocation timeout in ms */
const GEO_TIMEOUT_MS = 10_000;

// ─── Pure Geospatial Functions ───────────────────────────────

/**
 * Convert degrees to radians.
 */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Calculate the Haversine (great-circle) distance between two GPS points.
 * @returns Distance in meters.
 */
export function haversineDistance(a: GeoCoordinate, b: GeoCoordinate): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_M * c;
}

/**
 * Filter restaurants to only those within `radiusMeters` of `center`.
 */
export function filterByGeoFence(
  restaurants: HalalRestaurant[],
  center: GeoCoordinate,
  radiusMeters: number
): HalalRestaurant[] {
  return restaurants.filter(
    (r) => haversineDistance(center, r.coordinates) <= radiusMeters
  );
}

/**
 * Calculate walking distance and ETA between two coordinates.
 *
 * Currently uses Haversine × detour factor estimation.
 * Structured with a `source` field so it can be swapped for
 * Google Distance Matrix API or Mapbox Directions API.
 *
 * @example
 * // Future: Google Distance Matrix swap-in
 * // const result = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?...`);
 * // return { distanceMeters: result.rows[0].elements[0].distance.value,
 * //          durationMinutes: result.rows[0].elements[0].duration.value / 60,
 * //          source: 'google_distance_matrix' };
 */
export function calculateWalkingDistance(
  origin: GeoCoordinate,
  destination: GeoCoordinate
): WalkingDistance {
  const straightLine = haversineDistance(origin, destination);
  const estimatedRoute = straightLine * DETOUR_FACTOR;
  const durationSeconds = estimatedRoute / WALKING_SPEED_MPS;
  const durationMinutes = Math.round(durationSeconds / 60);

  return {
    distanceMeters: Math.round(estimatedRoute),
    durationMinutes: Math.max(1, durationMinutes), // At least 1 minute
    source: 'haversine_estimate',
  };
}

/**
 * Rank restaurant results by:
 * 1. Halal tier priority (CERTIFIED > MUSLIM_OWNED > PORK_FREE)
 * 2. Proximity (closer is better)
 * 3. Wait time (shorter is better)
 *
 * Flags the #1 result as `isTopPick`.
 */
export function rankRestaurants(
  results: Omit<HalalRadarResult, 'isTopPick'>[]
): HalalRadarResult[] {
  const sorted = [...results].sort((a, b) => {
    // 1. Halal tier priority
    const tierDiff =
      HALAL_STATUS_PRIORITY[a.restaurant.status] -
      HALAL_STATUS_PRIORITY[b.restaurant.status];
    if (tierDiff !== 0) return tierDiff;

    // 2. Proximity (walking distance)
    const distDiff =
      a.walkingDistance.distanceMeters - b.walkingDistance.distanceMeters;
    if (Math.abs(distDiff) > 100) return distDiff; // Only if difference > 100m

    // 3. Wait time
    return a.restaurant.liveWaitTime - b.restaurant.liveWaitTime;
  });

  return sorted.map((r, i) => ({
    ...r,
    isTopPick: i === 0,
  }));
}

// ─── Device Location ─────────────────────────────────────────

export interface LocationError {
  code: 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'NOT_SUPPORTED';
  message: string;
}

/**
 * Fetch the user's current device GPS location via the browser Geolocation API.
 * Returns a Promise that resolves to a GeoCoordinate or rejects with a LocationError.
 */
export function fetchUserLocation(): Promise<GeoCoordinate> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({
        code: 'NOT_SUPPORTED',
        message: 'Geolocation is not supported by this browser.',
      } as LocationError);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        const codeMap: Record<number, LocationError['code']> = {
          1: 'PERMISSION_DENIED',
          2: 'POSITION_UNAVAILABLE',
          3: 'TIMEOUT',
        };
        reject({
          code: codeMap[error.code] || 'POSITION_UNAVAILABLE',
          message: error.message,
        } as LocationError);
      },
      {
        enableHighAccuracy: true,
        timeout: GEO_TIMEOUT_MS,
        maximumAge: 30_000, // Accept cached position up to 30s old
      }
    );
  });
}

// ─── Mealtime Detection ──────────────────────────────────────

/**
 * Detect the current mealtime based on local time.
 */
export function detectMealtime(): MealtimeTrigger {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 10) return 'breakfast';
  if (hour >= 11 && hour < 14) return 'lunch';
  if (hour >= 14 && hour < 17) return 'snack';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack'; // Late night defaults to snack
}

/**
 * Get a display label for a mealtime trigger.
 */
export function getMealtimeLabel(trigger: MealtimeTrigger): {
  label: string;
  emoji: string;
  timeRange: string;
} {
  const labels: Record<MealtimeTrigger, { label: string; emoji: string; timeRange: string }> = {
    breakfast: { label: 'Breakfast', emoji: '🌅', timeRange: '6 AM – 10 AM' },
    lunch: { label: 'Lunch', emoji: '🍽', timeRange: '11 AM – 2 PM' },
    snack: { label: 'Snack', emoji: '☕', timeRange: '2 PM – 5 PM' },
    dinner: { label: 'Dinner', emoji: '🌙', timeRange: '5 PM – 10 PM' },
    manual: { label: 'Search', emoji: '🔍', timeRange: 'Anytime' },
  };
  return labels[trigger];
}

// ─── Main Hook ───────────────────────────────────────────────

export interface UseHalalRadarReturn {
  /** User's current GPS coordinates (null until fetched) */
  userLocation: GeoCoordinate | null;
  /** Ranked list of restaurants within the geo-fence */
  restaurants: HalalRadarResult[];
  /** The top recommended restaurant (first in ranked list) */
  topPick: HalalRadarResult | null;
  /** Loading state */
  isLoading: boolean;
  /** Error information if location/query failed */
  error: LocationError | null;
  /** Current geo-fence radius in km (for display) */
  radiusKm: number;
  /** Update the geo-fence radius in km */
  setRadiusKm: (km: number) => void;
  /** Current detected mealtime */
  mealtime: MealtimeTrigger;
  /** Manually trigger a refresh of location and results */
  refresh: () => void;
}

/**
 * Custom hook that orchestrates the full Halal Radar pipeline:
 * 1. Fetch user GPS location
 * 2. Query restaurants (mock data)
 * 3. Filter by geo-fence radius
 * 4. Calculate walking distances
 * 5. Rank results by halal tier, proximity, and wait time
 */
export function useHalalRadar(options: HalalRadarOptions = {}): UseHalalRadarReturn {
  const {
    radiusMeters: initialRadius = DEFAULT_RADIUS_M,
    mealtimeTrigger,
    overrideLocation,
  } = options;

  const [userLocation, setUserLocation] = useState<GeoCoordinate | null>(
    overrideLocation ?? null
  );
  const [restaurants, setRestaurants] = useState<HalalRadarResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<LocationError | null>(null);
  const [radiusKm, setRadiusKm] = useState(initialRadius / 1_000);
  const [mealtime, setMealtime] = useState<MealtimeTrigger>(
    mealtimeTrigger ?? detectMealtime()
  );

  const refreshCountRef = useRef(0);

  /**
   * Core pipeline: location → filter → distance → rank
   */
  const runPipeline = useCallback(
    async (radiusM: number) => {
      setIsLoading(true);
      setError(null);

      try {
        // Step 1: Get user location
        let location = overrideLocation ?? null;
        if (!location) {
          try {
            location = await fetchUserLocation();
          } catch (locErr) {
            // Fallback: use Tokyo Station coordinates for demo
            console.warn('Geolocation failed, using Tokyo Station fallback:', locErr);
            location = { lat: 35.6812, lng: 139.7671 };
            setError(locErr as LocationError);
          }
        }

        setUserLocation(location);

        if (!location) {
          setRestaurants([]);
          setIsLoading(false);
          return;
        }

        // Step 2: Get all restaurants (mock; replace with Firestore query in prod)
        const allRestaurants = getAllHalalRestaurants();

        // Step 3: Filter by geo-fence
        const nearby = filterByGeoFence(allRestaurants, location, radiusM);

        // Step 4: Calculate walking distances
        const withDistances = nearby.map((restaurant) => ({
          restaurant,
          walkingDistance: calculateWalkingDistance(location!, restaurant.coordinates),
        }));

        // Step 5: Rank results
        const ranked = rankRestaurants(withDistances);

        setRestaurants(ranked);
        setMealtime(mealtimeTrigger ?? detectMealtime());
      } catch (err) {
        console.error('Halal Radar pipeline error:', err);
        setRestaurants([]);
      } finally {
        setIsLoading(false);
      }
    },
    [overrideLocation, mealtimeTrigger]
  );

  // Run pipeline on mount and when radius changes
  useEffect(() => {
    runPipeline(radiusKm * 1_000);
  }, [radiusKm, runPipeline]);

  // Refresh handler
  const refresh = useCallback(() => {
    refreshCountRef.current += 1;
    runPipeline(radiusKm * 1_000);
  }, [radiusKm, runPipeline]);

  // Derive top pick
  const topPick = restaurants.length > 0 ? restaurants[0] : null;

  return {
    userLocation,
    restaurants,
    topPick,
    isLoading,
    error,
    radiusKm,
    setRadiusKm,
    mealtime,
    refresh,
  };
}
