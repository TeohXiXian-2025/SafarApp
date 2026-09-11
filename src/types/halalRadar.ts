// ============================================================
// Safar OS — Halal Radar Type System (3-Tier Verification)
// ============================================================

import { GeoCoordinate } from './itinerary';

/**
 * The 3-Tier Halal Status System.
 * Strictly typed to exactly three labels for consistent UI badging and filtering.
 */
export enum HalalStatus {
  /** Restaurant holds an official halal certificate from a recognized body */
  CERTIFIED_HALAL = 'CERTIFIED_HALAL',
  /** Restaurant is owned/operated by Muslims but may lack formal certification */
  MUSLIM_OWNED = 'MUSLIM_OWNED',
  /** Restaurant is not halal-certified but guarantees no pork/lard in any dish */
  PORK_FREE = 'PORK_FREE',
}

/**
 * Priority ranking for the 3-tier system (lower = higher priority).
 * Used by the ranking algorithm to sort results.
 */
export const HALAL_STATUS_PRIORITY: Record<HalalStatus, number> = {
  [HalalStatus.CERTIFIED_HALAL]: 1,
  [HalalStatus.MUSLIM_OWNED]: 2,
  [HalalStatus.PORK_FREE]: 3,
};

/**
 * Visual configuration for each halal tier badge.
 */
export const HALAL_BADGE_CONFIG: Record<
  HalalStatus,
  {
    label: string;
    shortLabel: string;
    color: string;
    bgColor: string;
    borderColor: string;
    glowColor: string;
    icon: 'shield-check' | 'user-check' | 'leaf';
    markerColor: string;
  }
> = {
  [HalalStatus.CERTIFIED_HALAL]: {
    label: 'Certified Halal',
    shortLabel: 'Certified',
    color: '#15803D',
    bgColor: 'rgba(21, 128, 61, 0.12)',
    borderColor: 'rgba(21, 128, 61, 0.3)',
    glowColor: 'rgba(34, 197, 94, 0.4)',
    icon: 'shield-check',
    markerColor: '#22C55E',
  },
  [HalalStatus.MUSLIM_OWNED]: {
    label: 'Muslim Owned',
    shortLabel: 'Muslim Owned',
    color: '#1D4ED8',
    bgColor: 'rgba(29, 78, 216, 0.12)',
    borderColor: 'rgba(29, 78, 216, 0.3)',
    glowColor: 'rgba(59, 130, 246, 0.4)',
    icon: 'user-check',
    markerColor: '#3B82F6',
  },
  [HalalStatus.PORK_FREE]: {
    label: 'Pork Free',
    shortLabel: 'Pork Free',
    color: '#B45309',
    bgColor: 'rgba(180, 83, 9, 0.12)',
    borderColor: 'rgba(180, 83, 9, 0.3)',
    glowColor: 'rgba(245, 158, 11, 0.4)',
    icon: 'leaf',
    markerColor: '#F59E0B',
  },
};

/**
 * Full restaurant entity for the Halal Radar feature.
 */
export interface HalalRestaurant {
  id: string;
  name: string;
  cuisine: string;
  imageUrl: string;

  /** Strictly typed 3-tier halal status */
  status: HalalStatus;

  /** Whether the full menu has been independently verified for halal compliance */
  menuVerified: boolean;

  /** Current estimated wait time in minutes (0 = no wait) */
  liveWaitTime: number;

  /** GPS coordinates for geospatial queries */
  coordinates: GeoCoordinate;

  /** User rating (1.0–5.0) */
  rating: number;

  /** Total number of reviews */
  reviewCount: number;

  /** Street address */
  address: string;

  /** Phone number */
  phone?: string;

  /** Operating hours description */
  openingHours: string;

  /** Name of the certifying halal body (if CERTIFIED_HALAL) */
  certifyingBody?: string;

  /** Featured menu items to preview */
  menuHighlights: string[];

  /** Price range indicator */
  priceRange: '$' | '$$' | '$$$' | '$$$$';
}

/**
 * Computed walking distance between the user and a restaurant.
 * Structured for easy swap between estimation and live API.
 */
export interface WalkingDistance {
  /** Straight-line or route distance in meters */
  distanceMeters: number;

  /** Estimated walking time in minutes */
  durationMinutes: number;

  /** Data source for transparency */
  source: 'haversine_estimate' | 'google_distance_matrix' | 'mapbox';
}

/**
 * A restaurant result enriched with computed distance and ranking info.
 */
export interface HalalRadarResult {
  restaurant: HalalRestaurant;
  walkingDistance: WalkingDistance;
  /** Whether this is the top-ranked recommendation */
  isTopPick: boolean;
}

/**
 * Mealtime context that triggers the radar search.
 */
export type MealtimeTrigger = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'manual';

/**
 * Configuration options for the useHalalRadar hook.
 */
export interface HalalRadarOptions {
  /** Geo-fence radius in meters (default: 2000) */
  radiusMeters?: number;
  /** What triggered the radar search */
  mealtimeTrigger?: MealtimeTrigger;
  /** Override user location (for testing or group leader GPS) */
  overrideLocation?: GeoCoordinate;
}
