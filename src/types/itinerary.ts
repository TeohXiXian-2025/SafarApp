// ============================================================
// Safar OS — Itinerary Type System (Wanderlog Pattern)
// ============================================================

export interface GeoCoordinate {
  lat: number;
  lng: number;
}

export type TransitMode = 'WALK' | 'TRANSIT' | 'DRIVE';

export interface TransitInfo {
  mode: TransitMode;
  distanceMeters: number;
  durationMinutes: number;
  safetyCorridorNotes?: string;
  prayerFacilityNearby?: boolean;
}

export type StopCategory = 'ATTRACTION' | 'FOOD' | 'PRAYER' | 'LODGING' | 'TRANSIT';
export type StopStatus = 'PROPOSED' | 'CONFIRMED' | 'SCOUTING';
export type HalalTier = 'certified' | 'muslim_owned' | 'pork_free' | 'not_halal';

export interface ItineraryStop {
  id: string;
  dayId: string;
  orderIndex: number;
  title: string;
  description?: string;
  address?: string;
  coordinate: GeoCoordinate;
  timeWindow?: {
    start: string; // "09:30 AM"
    end: string;   // "12:00 PM"
  };
  durationMinutes?: number;
  category: StopCategory;
  status: StopStatus;
  halalTier?: HalalTier;
  halalBadge?: string;
  assignedMemberIds?: string[];
  transitToNext?: TransitInfo;
  isCustomNode?: boolean; // For parallel split routes (e.g., 2A / 2B)
  rating?: number;
  imageUrl?: string;
  tags?: string[];
  cost?: number;
  costCurrency?: string;
  notes?: string;
}

export interface SalahTime {
  name: 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';
  time: string; // "12:45 PM"
  isPassed?: boolean;
  isNext?: boolean;
}

export interface ItineraryDay {
  id: string;
  dayNumber: number;
  date: string; // YYYY-MM-DD
  themeTitle: string;
  city: string;
  stops: ItineraryStop[];
  salahTimes?: SalahTime[];
  centerCoordinate?: GeoCoordinate; // Default map center for this day
  color?: string; // e.g. '#0284C7' (Cyan for Day 1), '#F97316' (Orange), '#8B5CF6' (Purple)
  distanceMiles?: string; // e.g. "16.4 mi"
  durationSummary?: string; // e.g. "1 hr 15 mins"
  routeSummary?: string; // e.g. "Tokyo Disneyland → teamLab → Tsukiji → Tokyo Skytree"
  dateLabel?: string; // e.g. "09.10 周四" or "09.10 Thu"
  subtitle?: string;
}

export type MapLayer = 'all' | 'prayer' | 'halal' | 'route';

export interface TripMember {
  id: string;
  name: string;
  avatar: string;
  role: string;
  isLead: boolean;
  status: 'active' | 'idle' | 'offline';
  faithDietary?: string;
}

export interface UnassignedPlace {
  id: string;
  title: string;
  address?: string;
  coordinate: GeoCoordinate;
  category: StopCategory;
  halalTier?: HalalTier;
  tags?: string[];
  addedBy?: string;
}

export interface TripState {
  tripId: string;
  title: string;
  destination: string;
  dateRange: { start: string; end: string };
  currentLeadId: string;
  activeDayId: string;
  selectedStopId: string | null;
  hoveredStopId: string | null;
  days: ItineraryDay[];
  unassignedPlaces: UnassignedPlace[];
  members: TripMember[];
  aiAssistantOpen: boolean;
  activeMapLayer: MapLayer;
  mapViewport: {
    center: GeoCoordinate;
    zoom: number;
  };
  navRailCollapsed: boolean;
}

// Action types for the useTripState hook dispatcher
export type TripAction =
  | { type: 'SET_ACTIVE_DAY'; dayId: string }
  | { type: 'SET_SELECTED_STOP'; stopId: string | null }
  | { type: 'SET_HOVERED_STOP'; stopId: string | null }
  | { type: 'SET_MAP_VIEWPORT'; center: GeoCoordinate; zoom: number }
  | { type: 'TOGGLE_NAV_RAIL' }
  | { type: 'SET_MAP_LAYER'; layer: MapLayer }
  | { type: 'ADD_STOP'; dayId: string; stop: ItineraryStop }
  | { type: 'REORDER_STOPS'; dayId: string; stops: ItineraryStop[] }
  | { type: 'UPDATE_STOP'; dayId: string; stop: ItineraryStop }
  | { type: 'REMOVE_STOP'; dayId: string; stopId: string }
  | { type: 'TOGGLE_AI_ASSISTANT' };
