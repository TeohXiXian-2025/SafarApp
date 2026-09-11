// ============================================================
// Safar OS — Halal Radar Firestore Service
// Geospatial query layer backed by Firestore (geohash bounding-box
// + Haversine refinement) with a transparent mock-data fallback.
// ============================================================

import { collection, query, where, getDocs, getDoc, doc, setDoc } from 'firebase/firestore';
import { db, ensureAuthenticated } from '../firebase/config';
import { GeoCoordinate } from '../types/itinerary';
import { HalalRestaurant, HalalStatus } from '../types/halalRadar';
import { MOCK_HALAL_RESTAURANTS } from '../data/halalRadarData';

/** Firestore collection name for the Halal Radar restaurant index. */
const RESTAURANTS_COLLECTION = 'restaurants';

/** Earth's mean radius in meters. */
const EARTH_RADIUS_M = 6_371_000;

/** Base32 alphabet used by geohash (excludes a, i, l, o). */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

// ─── Geospatial Math ─────────────────────────────────────────

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine (great-circle) distance between two GPS coordinates.
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
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ─── Geohash Utilities ───────────────────────────────────────

/**
 * Encode a coordinate into a base32 geohash of the given precision.
 */
export function encodeGeohash(lat: number, lng: number, precision = 6): string {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        lngMin = mid;
      } else {
        ch = ch << 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latMin = mid;
      } else {
        ch = ch << 1;
        latMax = mid;
      }
    }
    even = !even;
    bit += 1;
    if (bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return hash;
}

/**
 * Approximate geohash cell size (in degrees) for a given precision.
 */
function geohashCellDegrees(precision: number): { lat: number; lng: number } {
  const totalBits = precision * 5;
  const lngBits = Math.ceil(totalBits / 2);
  const latBits = Math.floor(totalBits / 2);
  return {
    lat: 180 / Math.pow(2, latBits),
    lng: 360 / Math.pow(2, lngBits),
  };
}

/**
 * Pick a geohash precision whose cell size is commensurate with the radius.
 */
function precisionForRadius(radiusMeters: number): number {
  if (radiusMeters <= 150) return 7; // ~153m cells
  if (radiusMeters <= 600) return 6; // ~1.2km cells
  if (radiusMeters <= 3_000) return 5; // ~4.9km cells
  return 4; // ~39km cells
}

/**
 * Latitude/longitude bounding box that fully contains the radius circle.
 */
function boundingBox(
  center: GeoCoordinate,
  radiusMeters: number
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latDelta = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  const lngDelta =
    (radiusMeters / (EARTH_RADIUS_M * Math.cos(toRad(center.lat)))) * (180 / Math.PI);
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

/**
 * Generate the set of geohash cells (prefixes) that cover a bounding box.
 */
function geohashCellsForBounds(
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  precision: number
): string[] {
  const cell = geohashCellDegrees(precision);
  const cells = new Set<string>();

  const latStart = Math.floor(bounds.minLat / cell.lat) * cell.lat - cell.lat;
  const latEnd = bounds.maxLat + cell.lat;
  const lngStart = Math.floor(bounds.minLng / cell.lng) * cell.lng - cell.lng;
  const lngEnd = bounds.maxLng + cell.lng;

  for (let lat = latStart; lat <= latEnd; lat += cell.lat) {
    for (let lng = lngStart; lng <= lngEnd; lng += cell.lng) {
      cells.add(encodeGeohash(lat, lng, precision));
    }
  }

  return Array.from(cells);
}

// ─── Document Mapping ────────────────────────────────────────

/**
 * Map a raw Firestore document into a strictly-typed HalalRestaurant.
 * Defensive coercion keeps the UI resilient to malformed data.
 */
function mapFirestoreRestaurant(id: string, data: Record<string, unknown>): HalalRestaurant {
  const rawStatus = data.status as string | undefined;
  const validStatuses = Object.values(HalalStatus) as string[];
  const status = validStatuses.includes(rawStatus ?? '')
    ? (rawStatus as HalalStatus)
    : HalalStatus.PORK_FREE;

  const rawCoords = data.coordinates as { lat?: unknown; lng?: unknown } | undefined;

  return {
    id,
    name: (data.name as string) ?? 'Unnamed Restaurant',
    cuisine: (data.cuisine as string) ?? 'Halal Dining',
    imageUrl: (data.imageUrl as string) ?? '',
    status,
    menuVerified: Boolean(data.menuVerified),
    liveWaitTime: Number(data.liveWaitTime ?? 0),
    coordinates: {
      lat: Number(rawCoords?.lat ?? data.lat ?? 0),
      lng: Number(rawCoords?.lng ?? data.lng ?? 0),
    },
    rating: Number(data.rating ?? 0),
    reviewCount: Number(data.reviewCount ?? 0),
    address: (data.address as string) ?? '',
    phone: (data.phone as string) ?? undefined,
    openingHours: (data.openingHours as string) ?? '',
    certifyingBody: (data.certifyingBody as string) ?? undefined,
    menuHighlights: Array.isArray(data.menuHighlights)
      ? (data.menuHighlights as string[])
      : [],
    priceRange: (data.priceRange as HalalRestaurant['priceRange']) ?? '$',
  };
}

// ─── Geo-Fence Query ─────────────────────────────────────────

/**
 * Query restaurants within `radiusMeters` of `center`.
 *
 * Strategy:
 *  1. Derive a geohash bounding-box covering the radius.
 *  2. Issue Firestore range queries per geohash cell (index-friendly).
 *  3. Refine results with an exact Haversine distance check.
 *  4. Fall back to mock data if Firestore is empty or unreachable,
 *     so the radar remains fully functional during development.
 */
export async function queryRestaurantsByGeoFence(
  center: GeoCoordinate,
  radiusMeters: number
): Promise<HalalRestaurant[]> {
  const precision = precisionForRadius(radiusMeters);
  const bounds = boundingBox(center, radiusMeters);
  const cells = geohashCellsForBounds(bounds, precision);

  try {
    await ensureAuthenticated();
    const col = collection(db, RESTAURANTS_COLLECTION);
    const deduped = new Map<string, HalalRestaurant>();

    for (const cell of cells) {
      const q = query(
        col,
        where('geohash', '>=', cell),
        where('geohash', '<=', cell + '\uffff')
      );
      const snapshot = await getDocs(q);
      snapshot.forEach((d) => {
        const restaurant = mapFirestoreRestaurant(d.id, d.data() as Record<string, unknown>);
        // Exact radius refinement (bounding-box queries can over-fetch).
        if (haversineDistance(center, restaurant.coordinates) <= radiusMeters) {
          deduped.set(d.id, restaurant);
        }
      });
    }

    if (deduped.size > 0) {
      return Array.from(deduped.values());
    }
  } catch (err) {
    console.warn('Halal Radar Firestore query failed, using mock data fallback:', err);
  }

  // Fallback: filter the mock seed data in-memory so the radar always works.
  return MOCK_HALAL_RESTAURANTS.filter(
    (r) => haversineDistance(center, r.coordinates) <= radiusMeters
  );
}

/**
 * Fetch a single restaurant by id (Firestore first, mock fallback).
 */
export async function getRestaurantById(id: string): Promise<HalalRestaurant | null> {
  try {
    await ensureAuthenticated();
    const snap = await getDoc(doc(db, RESTAURANTS_COLLECTION, id));
    if (snap.exists()) {
      return mapFirestoreRestaurant(snap.id, snap.data() as Record<string, unknown>);
    }
  } catch (err) {
    console.warn('Halal Radar getRestaurantById failed:', err);
  }

  return MOCK_HALAL_RESTAURANTS.find((r) => r.id === id) ?? null;
}

/**
 * Seed the Firestore `restaurants` collection with the mock dataset.
 * Each document stores a precomputed `geohash` for geospatial queries.
 * Call this once (or from an admin tool) to populate production data.
 */
export async function seedRestaurants(): Promise<number> {
  await ensureAuthenticated();
  let written = 0;
  for (const r of MOCK_HALAL_RESTAURANTS) {
    const { coordinates, ...rest } = r;
    await setDoc(doc(db, RESTAURANTS_COLLECTION, r.id), {
      ...rest,
      status: r.status,
      coordinates: { lat: coordinates.lat, lng: coordinates.lng },
      geohash: encodeGeohash(coordinates.lat, coordinates.lng, 6),
    });
    written += 1;
  }
  return written;
}
