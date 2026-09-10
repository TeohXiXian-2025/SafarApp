export type ActivityType = 'sightseeing' | 'dining' | 'cafe' | 'transit' | 'shopping' | 'cultural';

export type FaithDietaryTier = 'strictly_halal' | 'muslim_owned' | 'pork_free' | 'non_muslim';
export type TravelPace = 'fast' | 'moderate' | 'relaxed';

export interface UserPreferences {
  faithDietary: FaithDietaryTier;
  pace: TravelPace;
  interests: string[];
  prayerReminders: boolean;
  dietaryRestrictions?: string[];
  accessibilityNeeds?: string;
}

export interface Collaborator {
  id: string;
  name: string;
  role: string;
  avatar: string;
  status: 'active' | 'idle' | 'offline';
  action?: string;
  isCurrentUser?: boolean;
  isLead?: boolean;
  preferences?: UserPreferences;
}

export interface ActivityBlock {
  id: string;
  dayId: string;
  time: string;
  title: string;
  type: ActivityType;
  duration: string;
  description: string;
  location: string;
  image?: string;
  tags: string[];
  halalBadge?: string;
  badgeType?: 'certified' | 'muslim-owned' | 'pork-free';
  collaboratorNote?: {
    author: string;
    avatar: string;
    text: string;
  };
  votes?: {
    count: number;
    voters: string[];
    userVoted?: boolean;
  };
  warning?: {
    type: 'closing_soon' | 'prayer_conflict' | 'stamina';
    message: string;
    details: string;
  };
  transitNote?: {
    mode: 'walk' | 'train' | 'bus';
    text: string;
  };
  cost?: number; // Cost in trip currency
  costCategory?: 'dining' | 'tickets' | 'transit' | 'shopping' | 'accommodation' | 'activities' | 'other';
  paidBy?: string;
  lat?: number;
  lng?: number;
  nearestPrayerFacilityId?: string;
}

export type PrayerFacilityType = 'mosque' | 'musalla' | 'quiet_space' | 'station_musalla';

export interface PrayerFacility {
  id: string;
  name: string;
  type: PrayerFacilityType;
  city: string;
  address: string;
  lat: number;
  lng: number;
  mapX: number; // 0 to 100 percentage for mock SVG projection
  mapY: number; // 0 to 100 percentage for mock SVG projection
  distance: string; // e.g. "280m"
  walkMinutes: number; // e.g. 4
  nearestActivityTitle?: string;
  wuduFacilities: 'heated_wudu' | 'dedicated_wudu' | 'washroom_wudu';
  hasSistersSection: boolean;
  hasJummah: boolean;
  qiblaBearing: string; // e.g. "289° WNW"
  openingHours: string;
  verifiedSource: string;
  capacityText: string;
  notes: string;
  rating?: number;
}

export interface CityCoordinateSystem {
  city: string;
  country: string;
  centerLat: number;
  centerLng: number;
  qiblaDegree: number;
  qiblaDirectionText: string;
  mapBounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  facilities: PrayerFacility[];
}

export interface PrayerAnchorBlock {
  id: string;
  dayId: string;
  time: string;
  name: string;
  window: string;
  buffer: string;
  location: string;
  details: string;
  qibla: string;
  isLocked: true;
  lat?: number;
  lng?: number;
}

export interface DayPlan {
  id: string;
  dayNumber: number;
  totalDays: number;
  title: string;
  date: string;
  city: string;
  prayerTimes: {
    fajr: string;
    sunrise: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
  };
}

export interface TripBudget {
  totalGoal: number; // e.g. 1500 (total trip goal in currency)
  currency: string; // '$', '¥', '€', '£', 'RM'
  dailyGoal?: number; // e.g. 250
}

export interface TripSuggestion {
  id: string;
  proposedBy: {
    id: string;
    name: string;
    avatar: string;
    role: string;
  };
  title: string;
  location: string;
  type: ActivityType;
  description: string;
  sourceUrl?: string; // Social media link (Reel, TikTok, Xiaohongshu)
  halalBadge?: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  votes: number;
  votedBy: string[];
  suggestedDayId?: string;
}

export interface Itinerary {
  id: string;
  title: string;
  subtitle: string;
  dateRange: string;
  collaborators: Collaborator[];
  days: DayPlan[];
  activityBlocks: ActivityBlock[];
  prayerAnchors: PrayerAnchorBlock[];
  sourceUrl?: string;
  budget?: TripBudget;
  leadId?: string;
  tourismPoints?: string[];
  suggestions?: TripSuggestion[];
  destinationCity?: string;
  destinationCountry?: string;
}

export interface HalalFallbackOption {
  id: string;
  title: string;
  rating: number;
  reviewsCount: number;
  distance: string;
  walkTime: string;
  cuisine: string;
  image: string;
  amenities: string[];
  hours: string;
  seatingNote: string;
  halalStatus: string;
}

export interface VoiceNote {
  id: string;
  author: string;
  role: string;
  avatar: string;
  duration: string;
  audioWaveform: number[];
  transcription: string;
  timestamp: string;
}

export type DocumentCategory = 'passport' | 'flights' | 'hotels';

export interface TravelDocument {
  id: string;
  category: DocumentCategory;
  fileName: string;
  fileSize: string;
  fileType: 'pdf' | 'image';
  previewUrl?: string;
  uploadedAt: string;
  extractedDetails?: {
    holderName?: string;
    documentNumber?: string;
    issueDate?: string;
    expiryDate?: string;
    issuingCountry?: string;
    departureDate?: string;
    returnDate?: string;
    flightNumber?: string;
    carrier?: string;
    pnr?: string;
    hotelName?: string;
    checkInDate?: string;
    checkOutDate?: string;
    bookingReference?: string;
    nights?: number;
  };
}

export interface VerificationCheck {
  id: string;
  title: string;
  status: 'success' | 'warning' | 'error' | 'info';
  category: string;
  summary: string;
  details: string;
  sourceDoc: string;
  recommendedAction?: string;
}

export interface DocumentVerificationReport {
  timestamp: string;
  overallStatus: 'passed_with_warnings' | 'passed' | 'failed';
  totalChecks: number;
  passedCount: number;
  warningCount: number;
  checks: VerificationCheck[];
  summary: {
    passportValid: boolean;
    timelineMatched: boolean;
    brnVerified: boolean;
    visaEligible: boolean;
  };
}

