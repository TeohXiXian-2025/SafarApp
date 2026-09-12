import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  MapPin,
  Clock,
  ChevronRight,
  Footprints,
  Car,
  Train,
  Plus,
  Search,
  Sparkles,
  Lock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Star,
  DollarSign,
  Compass,
  ArrowRight,
  Calendar,
  Layers,
  Filter,
  Settings2,
  Droplets,
  CloudRain,
} from 'lucide-react';
import {
  ItineraryStop,
  ItineraryDay,
  TransitInfo,
  StopCategory,
  StopStatus,
  TripState,
  SalahTime,
  PrayerConflict,
  PrayerPlaceResult,
  PrayerSettings,
  DEFAULT_PRAYER_SETTINGS,
  SplitPlan,
  GroupConflict,
} from '../types/itinerary';
import {
  fetchPrayerTimesForCity,
  PrayerData,
  timeToMinutes,
  formatTo12Hour,
} from '../services/prayerTimeService';
import {
  WeatherData,
  fetchLiveWeather,
} from '../services/weatherService';
import {
  detectPrayerConflicts,
  getItineraryHealth,
  getNearbyPrayerPlaces,
} from '../services/prayerConflictEngine';
import { PrayerTimelineMarker } from './PrayerTimelineMarker';
import { AiMediatorModal } from './AiMediatorModal';
import { AiSplitRoute } from './AiSplitRoute';
import { MOCK_SPLIT_PLAN } from '../data/splitRouteMock';
import { TravelImage } from './travel/TravelImage';
import { Reveal } from './motion/Reveal';
import { HoverLift } from './motion/HoverLift';
import { motion } from 'motion/react';

// ─────────────────────────────────────────────────────
// Category Icons & Badges
// ─────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<
  StopCategory,
  { emoji: string; color: string; bg: string; border: string }
> = {
  ATTRACTION: {
    emoji: '🏛️',
    color: 'text-indigo-700',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
  },
  FOOD: {
    emoji: '🍜',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
  },
  PRAYER: {
    emoji: '🕌',
    color: 'text-teal-700',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
  },
  LODGING: {
    emoji: '🏨',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  TRANSIT: {
    emoji: '🚆',
    color: 'text-gray-700',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
  },
};

const STATUS_CONFIG: Record<
  StopStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  CONFIRMED: {
    label: 'Confirmed',
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  PROPOSED: {
    label: 'Proposed',
    color: 'text-amber-700 bg-amber-50 border-amber-200',
    icon: <Sparkles className="w-3 h-3" />,
  },
  SCOUTING: {
    label: 'Scouting',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    icon: <AlertCircle className="w-3 h-3" />,
  },
};

// ─────────────────────────────────────────────────────
// Curated travel media — every stop gets its OWN photo
// • Unsplash  : Tokyo theme-park / market landmarks.
// • Wikimedia Commons : Kyoto's historic sites (free, stable, documented).
// All URLs below were HTTP-verified (200) before being committed.
// ─────────────────────────────────────────────────────
const PHOTO_TOKYO_HERO =
  'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1200&q=80';

// ── Tokyo (Unsplash) ──────────────────────────────────
const PHOTO_DISNEY =
  'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?auto=format&fit=crop&w=800&q=80';
const PHOTO_DISNEY_RESORT =
  'https://images.unsplash.com/photo-1579899388302-39281e5f8a0a?auto=format&fit=crop&w=800&q=80';
const PHOTO_DISNEYSEA =
  'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=800&q=80';
const PHOTO_TEAMLAB =
  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80';
const PHOTO_TSUKIJI =
  'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80';
const PHOTO_SKYTREE =
  'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?auto=format&fit=crop&w=800&q=80';
const PHOTO_AIRPORT_LOUNGE =
  'https://images.unsplash.com/photo-1583037189850-1921ae7c6c22?auto=format&fit=crop&w=800&q=80';
const PHOTO_NARITA_EXPRESS =
  'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=800&q=80';

// ── Tokyo (Wikimedia Commons) ─────────────────────────
const PHOTO_SOLAMACHI =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8b/Tokyo_Soramachi_2012.JPG/960px-Tokyo_Soramachi_2012.JPG';
const PHOTO_SCRAMBLE =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c5/Tokyo_Shibuya_Scramble_Crossing_2018-10-09.jpg/960px-Tokyo_Shibuya_Scramble_Crossing_2018-10-09.jpg';

// ── Kyoto (Wikimedia Commons, authentic landmark photography) ──
const PHOTO_KIYOMIZU =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6b/Kiyomizu-dera%2C_Kyoto%2C_November_2016_-07.jpg/960px-Kiyomizu-dera%2C_Kyoto%2C_November_2016_-07.jpg';
const PHOTO_FUSHIMI =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0e/Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine%2C_Kyoto%2C_Japan.jpg/960px-Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine%2C_Kyoto%2C_Japan.jpg';
const PHOTO_BAMBOO =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4a/Bamboo_Forest%2C_Arashiyama%2C_Kyoto%2C_Japan.jpg/960px-Bamboo_Forest%2C_Arashiyama%2C_Kyoto%2C_Japan.jpg';
const PHOTO_ARASHIYAMA_PARK =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/82/Bamboo_Grove%2C_Arashiyama%2C_Kyoto%2C_Japan.jpg/960px-Bamboo_Grove%2C_Arashiyama%2C_Kyoto%2C_Japan.jpg';
const PHOTO_OKOCHI =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/99/Wooden_gate_in_Okochi_Sanso_Garden%2C_Kyoto%2C_Japan.jpg/960px-Wooden_gate_in_Okochi_Sanso_Garden%2C_Kyoto%2C_Japan.jpg';
const PHOTO_NONOMIYA =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c8/Nonomiya-jinja_%28Uky%C5%8D-ku_Kyoto%29_shrine_sign_hdsr_S5_06.jpg/960px-Nonomiya-jinja_%28Uky%C5%8D-ku_Kyoto%29_shrine_sign_hdsr_S5_06.jpg';
const PHOTO_KYOTO_TOWER =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/Observation_deck_at_Kyoto_Tower_with_staff_cleaning_the_windows%2C_Japan.jpg/960px-Observation_deck_at_Kyoto_Tower_with_staff_cleaning_the_windows%2C_Japan.jpg';

// Destination hero photography (an authentic Kyoto temple for Kyoto days).
const DESTINATION_HERO_PHOTOS: Record<string, string> = {
  Tokyo: PHOTO_TOKYO_HERO,
  Kyoto: PHOTO_KIYOMIZU,
};

// Keyword → unique travel photo. First match wins, so order specific before
// generic. Keeps every attraction card distinct and media-rich.
const STOP_PHOTO_OVERRIDES: { match: RegExp; url: string }[] = [
  // Tokyo
  { match: /disneyland/i, url: PHOTO_DISNEY },
  { match: /disney\s*sea/i, url: PHOTO_DISNEYSEA },
  { match: /disney resort/i, url: PHOTO_DISNEY_RESORT },
  { match: /solamachi/i, url: PHOTO_SOLAMACHI },
  { match: /shibuya/i, url: PHOTO_SCRAMBLE },
  { match: /skytree/i, url: PHOTO_SKYTREE },
  { match: /teamlab/i, url: PHOTO_TEAMLAB },
  { match: /tsukiji/i, url: PHOTO_TSUKIJI },
  // Kyoto (authentic landmark photography)
  { match: /kiyomizu/i, url: PHOTO_KIYOMIZU },
  { match: /fushimi inari/i, url: PHOTO_FUSHIMI },
  { match: /arashiyama park/i, url: PHOTO_ARASHIYAMA_PARK },
  { match: /bamboo/i, url: PHOTO_BAMBOO },
  { match: /okochi/i, url: PHOTO_OKOCHI },
  { match: /nonomiya/i, url: PHOTO_NONOMIYA },
  { match: /kyoto tower/i, url: PHOTO_KYOTO_TOWER },
  // Transit / logistics
  { match: /narita express|skyliner|airport express/i, url: PHOTO_NARITA_EXPRESS },
  { match: /airport lounge|plaza premium|premium lounge/i, url: PHOTO_AIRPORT_LOUNGE },
];

function getHeroPhoto(city?: string): string {
  return (city && DESTINATION_HERO_PHOTOS[city]) || PHOTO_TOKYO_HERO;
}

function resolveStopPhoto(stop: ItineraryStop): string | undefined {
  const override = STOP_PHOTO_OVERRIDES.find((o) => o.match.test(stop.title));
  return override?.url ?? stop.imageUrl;
}

// Shared, loading-aware image primitive (skeleton + graceful fallback).
const FallbackImage = TravelImage;

// ─────────────────────────────────────────────────────
// Transit Separator
// ─────────────────────────────────────────────────────
function TransitSeparator({ transit }: { transit: TransitInfo }) {
  const Icon =
    transit.mode === 'WALK'
      ? Footprints
      : transit.mode === 'DRIVE'
      ? Car
      : Train;

  const distanceText =
    transit.distanceMeters >= 1000
      ? `${(transit.distanceMeters / 1000).toFixed(1)} km`
      : `${transit.distanceMeters}m`;

  return (
    <div className="flex items-center gap-3 py-1 px-3 ml-8">
      <div className="flex flex-col items-center gap-0.5">
        <div className="w-px h-3 bg-[#C4BCB3]" />
        <div className="w-px h-3 bg-[#C4BCB3]" />
      </div>
      <div className="flex items-center gap-2 bg-[#FAF8F5] border border-[#E7DFD5] rounded-full px-3 py-1 text-[11px] font-semibold text-[#526360]">
        <Icon className="w-3 h-3 text-[#8A9592]" />
        <span className="font-bold text-[#161C23]">
          {transit.mode === 'WALK' ? 'Walk' : transit.mode === 'DRIVE' ? 'Drive' : 'Transit'}
        </span>
        <span className="text-[#8A9592]">·</span>
        <span>{distanceText}</span>
        <span className="text-[#8A9592]">·</span>
        <Clock className="w-2.5 h-2.5" />
        <span>{transit.durationMinutes} min</span>
        {transit.safetyCorridorNotes && (
          <>
            <span className="text-[#8A9592]">·</span>
            <span className="text-amber-700 font-semibold">{transit.safetyCorridorNotes}</span>
          </>
        )}
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <div className="w-px h-3 bg-[#C4BCB3]" />
        <div className="w-px h-3 bg-[#C4BCB3]" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Stop Card
// ─────────────────────────────────────────────────────
interface StopCardProps {
  stop: ItineraryStop;
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  isLead: boolean;
  dayColor?: string;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  activeConflict?: GroupConflict;
  onOpenAiPlanner?: () => void;
}

function StopCard({
  stop,
  index,
  isSelected,
  isHovered,
  isLead,
  dayColor = '#0D6955',
  onSelect,
  onHover,
  activeConflict,
  onOpenAiPlanner,
}: StopCardProps) {
  const catConfig = CATEGORY_CONFIG[stop.category];
  const statusConfig = STATUS_CONFIG[stop.status];
  const isPrayer = stop.category === 'PRAYER';
  const isMediaStop = stop.category === 'ATTRACTION' || stop.category === 'FOOD';
  const stopPhoto = resolveStopPhoto(stop);
  const prayerBadge = stop.halalBadge ?? '';
  const qiblaTag = stop.tags?.find((t) => /qibla/i.test(t));

  let cardBg = isPrayer
    ? 'bg-gradient-to-r from-emerald-50/70 via-white to-white'
    : 'bg-white';
  let indicatorColor = isPrayer ? '#0D9488' : dayColor;
  let customBorder = isPrayer
    ? isSelected
      ? '#0D9488'
      : isHovered
      ? '#5EEAD4'
      : '#A7F3D0'
    : isSelected
    ? dayColor
    : isHovered
    ? `${dayColor}80`
    : '#E7DFD5';

  if (!isPrayer && stop.groupId === 'group-a') {
    cardBg = 'bg-gradient-to-r from-green-50/50 to-white';
    indicatorColor = '#22C55E';
    customBorder = isSelected ? '#22C55E' : isHovered ? '#4ADE80' : '#bbf7d0';
  } else if (!isPrayer && stop.groupId === 'group-b') {
    cardBg = 'bg-gradient-to-r from-purple-50/50 to-white';
    indicatorColor = '#A855F7';
    customBorder = isSelected ? '#A855F7' : isHovered ? '#C084FC' : '#e9d5ff';
  }

  return (
    <div
      id={`stop-card-${stop.id}`}
      className={`relative rounded-2xl border transition-all duration-200 cursor-pointer group overflow-hidden hover:-translate-y-0.5 ${cardBg} ${
        isSelected
          ? 'shadow-lg'
          : isHovered
          ? 'shadow-md'
          : 'shadow-sm hover:shadow-md'
      }`}
      style={{
        borderColor: customBorder,
        boxShadow: isSelected ? `0 0 0 2px ${indicatorColor}40` : undefined,
      }}
      onClick={() => onSelect(stop.id)}
      onMouseEnter={() => onHover(stop.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Left indicator bar (always visible for serene Solat slots) */}
      {(isSelected || isPrayer) && (
        <div
          className={`absolute left-0 top-0 bottom-0 rounded-l-2xl ${
            isPrayer ? 'w-1' : 'w-1.5'
          }`}
          style={{ backgroundColor: indicatorColor }}
        />
      )}

      <div className="p-4 pl-5">
        <div className="flex items-start gap-3">
          {/* Index + Emoji */}
          <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black border ${catConfig.bg} ${catConfig.border} ${catConfig.color}`}
            >
              {index + 1}
            </div>
            <span className="text-sm">{catConfig.emoji}</span>
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            {/* Time Window */}
            {stop.timeWindow && (
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="w-3 h-3 text-[#0D6955]" />
                <span className="text-xs font-bold text-[#0D6955] font-mono">
                  {stop.timeWindow.start}
                  {stop.timeWindow.end && ` – ${stop.timeWindow.end}`}
                </span>
                {stop.durationMinutes && (
                  <span className="text-[10px] text-[#8A9592] font-semibold">
                    ({stop.durationMinutes}m)
                  </span>
                )}
              </div>
            )}

            {/* Title */}
            <h4 className="text-sm font-extrabold text-[#161C23] leading-tight flex items-center gap-2">
              <span>{stop.title}</span>
              {isPrayer && (
                <span className="inline-flex items-center gap-1 rounded-full border border-teal-300 bg-white px-2 py-0.5 text-[10px] font-black text-teal-700">
                  🕌 Solat Slot
                </span>
              )}
            </h4>

            {/* Address */}
            {stop.address && (
              <p className="text-[11px] text-[#8A9592] font-medium mt-0.5 flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{stop.address}</span>
              </p>
            )}

            {/* Description from PDF */}
            {stop.description && (
              <p className="text-xs text-[#526360] font-medium mt-1.5 leading-relaxed">
                {stop.description}
              </p>
            )}

            {/* Badges */}
            {isPrayer ? (
              /* Solat slot — minimal, serene outline badges only */
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                {prayerBadge && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    <Droplets className="h-3 w-3" />
                    {prayerBadge}
                  </span>
                )}
                {qiblaTag && !/qibla/i.test(prayerBadge) && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-teal-300 bg-white px-2 py-0.5 text-[10px] font-bold text-teal-700">
                    <Compass className="h-3 w-3" />
                    {qiblaTag}
                  </span>
                )}
                {stop.halalTier === 'certified' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-white px-2 py-0.5 text-[10px] font-bold text-teal-700">
                    <CheckCircle2 className="h-3 w-3 text-teal-600" />
                    Verified Prayer Space
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                <span
                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusConfig.color}`}
                >
                  {statusConfig.icon}
                  {statusConfig.label}
                </span>

                {stop.halalBadge && (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-teal-50 text-teal-700 border-teal-200">
                    ✅ {stop.halalBadge}
                  </span>
                )}

                {stop.tags?.map((t) => (
                  <span
                    key={t}
                    className="text-[9px] font-semibold text-[#526360] bg-[#FAF8F5] border border-[#E7DFD5] px-1.5 py-0.5 rounded-md"
                  >
                    {t}
                  </span>
                ))}

                {stop.rating && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                    <Star className="w-2.5 h-2.5 fill-amber-400 stroke-amber-400" />
                    {stop.rating}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Media thumbnail — widescreen for attractions & dining */}
          {!isPrayer && stopPhoto && (
            <div className="shrink-0">
              <FallbackImage
                src={stopPhoto}
                alt={stop.title}
                iconClassName="h-5 w-5"
                fallbackLabel={stop.title}
                className={`rounded-xl border border-[#E7DFD5] object-cover shadow-sm ${
                  isMediaStop ? 'w-28 h-20 sm:w-36 sm:h-24' : 'w-24 h-16 sm:w-28 sm:h-20'
                }`}
              />
            </div>
          )}
        </div>
        
        {/* Conflict Banner */}
        {activeConflict && (
          <div className="mt-3 bg-amber-50 rounded-xl p-3 border border-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-amber-900 leading-tight">
                  {activeConflict.description}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
                    Group Preference Mismatch
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAiPlanner?.();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-black rounded-lg shadow-sm hover:from-amber-600 hover:to-amber-700 transition-colors"
                  >
                    <span>✨</span> AI PLANNER
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Overview Mode Component
// ─────────────────────────────────────────────────────
function OverviewFeed({
  days,
  onSelectDay,
}: {
  days: ItineraryDay[];
  onSelectDay: (dayId: string) => void;
}) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
      {/* Overview Title Banner */}
      <div className="flex items-center justify-between pb-2 border-b border-[#E7DFD5]">
        <div>
          <h2 className="text-xl font-black text-[#161C23] tracking-tight">Trip Overview</h2>
          <p className="text-xs font-semibold text-[#8A9592] mt-0.5">
            Full trip itinerary from Day 1 to Day 3 with prayer synchronization
          </p>
        </div>
        <span className="text-xs font-extrabold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
          {days.length} Days Planned
        </span>
      </div>

      {/* Day Overview Cards */}
      <div className="space-y-3">
        {days.map((day) => {
          const dayColor =
            day.color || (day.dayNumber === 1 ? '#0284C7' : day.dayNumber === 2 ? '#F97316' : '#8B5CF6');
          return (
            <React.Fragment key={day.id}>
              <HoverLift>
                <div
                  onClick={() => onSelectDay(day.id)}
                  className="p-4 rounded-2xl border border-white/50 bg-white/70 shadow-lg backdrop-blur-md hover:shadow-xl transition-all cursor-pointer group hover:border-[#0D6955]/50 relative overflow-hidden dark:border-slate-700/50 dark:bg-slate-900/60"
                >
              {/* Day Color Accent Line */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5"
                style={{ backgroundColor: dayColor }}
              />

              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-xs font-black text-white px-2.5 py-1 rounded-full shadow-sm"
                    style={{ backgroundColor: dayColor }}
                  >
                    {day.dateLabel ? day.dateLabel : `Day ${day.dayNumber}`}
                  </span>
                  <h3 className="text-sm font-extrabold text-[#161C23]">
                    {day.themeTitle}
                  </h3>
                  {day.subtitle && (
                    <span className="text-xs font-bold text-[#8A9592]">
                      ({day.subtitle})
                    </span>
                  )}
                </div>

                {day.distanceMiles && (
                  <span
                    className="text-xs font-black px-2.5 py-1 rounded-full text-white shadow-sm shrink-0"
                    style={{ backgroundColor: dayColor }}
                  >
                    {day.distanceMiles}
                    {day.durationSummary ? ` · ${day.durationSummary}` : ''}
                  </span>
                )}
              </div>

              {/* Route Summary Chain */}
              <div className="text-xs font-bold text-[#526360] flex items-center gap-1.5 flex-wrap py-1">
                {day.routeSummary ? (
                  day.routeSummary
                ) : (
                  day.stops
                    .filter((s) => s.category === 'ATTRACTION')
                    .slice(0, 4)
                    .map((s, idx, arr) => (
                      <React.Fragment key={s.id}>
                        <span className="text-[#161C23]">{s.title}</span>
                        {idx < arr.length - 1 && <span className="text-[#8A9592]">→</span>}
                      </React.Fragment>
                    ))
                )}
              </div>

              {/* Stats Footer */}
              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[#FAF8F5] text-[11px] text-[#8A9592] font-semibold">
                <span>📍 {day.stops.length} stops</span>
                <span>·</span>
                <span>🏛️ {day.stops.filter((s) => s.category === 'ATTRACTION').length} attractions</span>
                <span>·</span>
                <span className="text-teal-700 font-bold">
                  🕌 5 daily prayer times included
                </span>
                <span className="ml-auto flex items-center gap-1 text-[#0D6955] font-extrabold group-hover:translate-x-1 transition-transform">
                  View Day Detail <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
              </HoverLift>
            </React.Fragment>
          );
        })}

        {/* Empty / Future Day Placeholder */}
        <div className="p-4 rounded-2xl border border-dashed border-[#C4BCB3] bg-[#FAF8F5] opacity-75">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-black text-white bg-[#8B5CF6]/60 px-2.5 py-0.5 rounded-full">
              09.13 周日
            </span>
            <span className="text-xs font-bold text-[#8A9592]">暂无行程安排 (Free Day / Departure)</span>
          </div>
          <p className="text-[11px] text-[#8A9592]">
            Use the "Suggest Activity" or "Add Place" tool to expand Day 4.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Prayer Strip — Compact day header prayer timeline
// ─────────────────────────────────────────────────────
function PrayerStrip({
  prayerData,
  conflicts,
  city,
}: {
  prayerData: PrayerData | null;
  conflicts: PrayerConflict[];
  city: string;
}) {
  if (!prayerData) return null;

  const conflictPrayers = new Set(conflicts.map((c) => c.prayerName));

  return (
    <div className="flex items-center gap-1 px-4 py-1.5 bg-gradient-to-r from-teal-50/60 to-transparent overflow-x-auto">
      <span className="text-xs shrink-0">🕌</span>
      <span className="text-[10px] font-extrabold text-[#0D6955] shrink-0 mr-1">
        {city}
      </span>
      {prayerData.fiveDailySalah.map((salah, idx) => (
        <React.Fragment key={salah.name}>
          {idx > 0 && <span className="text-[10px] text-[#C4BCB3] shrink-0">·</span>}
          <span
            className={`text-[10px] font-bold shrink-0 flex items-center gap-0.5 ${
              salah.isPassed
                ? 'text-[#8A9592]'
                : conflictPrayers.has(salah.name)
                ? 'text-amber-700'
                : salah.isNext
                ? 'text-[#0D6955] font-extrabold'
                : 'text-[#526360]'
            }`}
          >
            {salah.isPassed ? '✓' : conflictPrayers.has(salah.name) ? '⚠' : salah.isNext ? '🕌' : ''}
            {' '}{salah.name} {salah.formattedTime12 || salah.time}
          </span>
        </React.Fragment>
      ))}
      <span className="text-[9px] text-[#8A9592] font-medium shrink-0 ml-1">
        ({prayerData.isLive ? 'Live' : 'Cached'})
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Main: ItineraryFeed
// ─────────────────────────────────────────────────────
interface ItineraryFeedProps {
  state: TripState;
  activeDay: ItineraryDay | null;
  activeStops: ItineraryStop[];
  onSelectStop: (id: string | null) => void;
  onHoverStop: (id: string | null) => void;
  onSelectDay?: (dayId: string) => void;
  onAddStop?: (dayId: string, placeName: string) => void;
  collaboratorsCount?: number;
  isLead?: boolean;
  onInsertPrayerBreak?: (dayId: string, afterStopId: string, prayerStop: ItineraryStop) => void;
  onOpenAiPlanner?: (conflictId: string) => void;
}

export const ItineraryFeed: React.FC<ItineraryFeedProps> = ({
  state,
  activeDay,
  activeStops,
  onSelectStop,
  onHoverStop,
  onSelectDay,
  onAddStop,
  collaboratorsCount = 4,
  isLead = true,
  onInsertPrayerBreak,
  onOpenAiPlanner,
}) => {
  const feedRef = useRef<HTMLDivElement>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [prayerData, setPrayerData] = useState<PrayerData | null>(null);
  const [dayWeather, setDayWeather] = useState<WeatherData | null>(null);
  const [dismissedConflicts, setDismissedConflicts] = useState<Set<string>>(new Set());

  // Drag-and-Drop Blend Simulation State
  const [isSyncingTransit, setIsSyncingTransit] = useState<boolean>(false);
  const [hasDroppedKiyomizu, setHasDroppedKiyomizu] = useState<boolean>(false);
  const [isDragOverDropZone, setIsDragOverDropZone] = useState<boolean>(false);

  // AI Conflict Mediator flow state
  const [aiSplitPhase, setAiSplitPhase] = useState<'conflict' | 'resolved'>('conflict');
  const [activeSplitPlan, setActiveSplitPlan] = useState<SplitPlan>(MOCK_SPLIT_PLAN);
  const [isMediatorOpen, setIsMediatorOpen] = useState<boolean>(false);

  const handleDropKiyomizu = () => {
    setIsDragOverDropZone(false);
    setIsSyncingTransit(true);
    setTimeout(() => {
      setIsSyncingTransit(false);
      setHasDroppedKiyomizu(true);
    }, 1200);
  };

  // Fetch prayer times & real weather based on active day's city (location-aware)
  useEffect(() => {
    if (activeDay) {
      fetchPrayerTimesForCity(activeDay.city, activeDay.date).then(setPrayerData);
      fetchLiveWeather(activeDay.city).then(setDayWeather);
    }
  }, [activeDay?.city, activeDay?.date]);

  // Scroll to selected stop card
  useEffect(() => {
    if (state.selectedStopId) {
      const el = document.getElementById(`stop-card-${state.selectedStopId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [state.selectedStopId]);

  // Detect prayer conflicts for the active day
  const conflicts = useMemo(() => {
    if (!activeDay || !prayerData) return [];
    const salahTimes: SalahTime[] = prayerData.fiveDailySalah.map((s) => ({
      name: s.name,
      time: s.formattedTime12 || s.time,
      isPassed: s.isPassed,
      isNext: s.isNext,
    }));
    return detectPrayerConflicts(
      activeStops,
      salahTimes,
      activeDay.city,
      state.prayerSettings,
    );
  }, [activeDay, prayerData, activeStops, state.prayerSettings]);

  // Itinerary health
  const health = useMemo(() => getItineraryHealth(conflicts), [conflicts]);

  // Build prayer timeline markers to insert between stops
  const prayerMarkers = useMemo(() => {
    if (!prayerData || !activeDay) return [];
    return prayerData.fiveDailySalah.map((salah) => ({
      salah: {
        name: salah.name,
        time: salah.formattedTime12 || salah.time,
        isPassed: salah.isPassed,
        isNext: salah.isNext,
      } as SalahTime,
      timeMinutes: timeToMinutes(salah.time),
      conflict: conflicts.find(
        (c) =>
          c.prayerName === salah.name &&
          !dismissedConflicts.has(`${c.stopId}-${c.prayerName}`)
      ),
    }));
  }, [prayerData, activeDay, conflicts, dismissedConflicts]);

  // Handle "Add Prayer Break" action
  const handleAddPrayerBreak = (conflict: PrayerConflict, place: PrayerPlaceResult) => {
    if (!activeDay || !onInsertPrayerBreak) return;

    const prayerStop: ItineraryStop = {
      id: `prayer-break-${conflict.prayerName.toLowerCase()}-${Date.now()}`,
      dayId: activeDay.id,
      orderIndex: 0,
      title: `${conflict.prayerName} Prayer — ${place.name}`,
      description: `${conflict.prayerName} prayer break at ${place.name}. ${place.hasWudu ? 'Wudu facilities available.' : ''}`,
      address: place.name,
      coordinate: place.coordinate,
      timeWindow: {
        start: conflict.prayerTimeStr,
        end: formatTo12Hour(
          `${Math.floor((conflict.prayerTimeMinutes + state.prayerSettings.prayerDurationMinutes) / 60)}:${((conflict.prayerTimeMinutes + state.prayerSettings.prayerDurationMinutes) % 60).toString().padStart(2, '0')}`
        ),
      },
      durationMinutes: state.prayerSettings.prayerDurationMinutes,
      category: 'PRAYER',
      status: 'CONFIRMED',
      halalTier: 'certified',
      halalBadge: place.hasWudu ? 'Wudu Available' : 'Prayer Space',
      tags: [conflict.prayerName, 'Prayer Break', 'Auto-Added'],
      transitToNext: {
        mode: 'WALK',
        distanceMeters: place.walkMinutes * 80, // rough estimate
        durationMinutes: place.walkMinutes,
      },
    };

    onInsertPrayerBreak(activeDay.id, conflict.stopId, prayerStop);
  };

  // Handle dismiss conflict
  const handleDismissConflict = (conflict: PrayerConflict) => {
    setDismissedConflicts((prev) => new Set(prev).add(`${conflict.stopId}-${conflict.prayerName}`));
  };

  // If in overview mode, render OverviewFeed
  if (state.activeDayId === 'overview') {
    return (
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto overflow-x-hidden bg-[#FAF8F5]"
        style={{ minWidth: 0 }}
      >
        <OverviewFeed
          days={state.days}
          onSelectDay={(dayId) => onSelectDay?.(dayId)}
        />
      </div>
    );
  }

  if (!activeDay) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#8A9592] text-sm">
        <div className="text-center space-y-2">
          <MapPin className="w-8 h-8 mx-auto opacity-30" />
          <p className="font-semibold">Select a day from the left panel or overview</p>
        </div>
      </div>
    );
  }

  const dayColor =
    activeDay.color ||
    (activeDay.dayNumber === 1 ? '#0284C7' : activeDay.dayNumber === 2 ? '#F97316' : '#8B5CF6');

  const filteredStops = activeStops.filter((stop) => {
    if (filterCategory === 'all') return true;
    if (filterCategory === 'attraction') return stop.category === 'ATTRACTION';
    if (filterCategory === 'prayer') return stop.category === 'PRAYER';
    if (filterCategory === 'food') return stop.category === 'FOOD';
    return true;
  });

  // ─── Determine where to insert prayer timeline markers ───
  // Insert a marker between stops when a prayer time falls between two consecutive stops
  function getStopEndMinutes(stop: ItineraryStop): number {
    if (stop.timeWindow?.end) return timeToMinutes(stop.timeWindow.end);
    if (stop.timeWindow?.start && stop.durationMinutes) {
      return timeToMinutes(stop.timeWindow.start) + stop.durationMinutes;
    }
    return timeToMinutes(stop.timeWindow?.start || '00:00');
  }

  function getStopStartMinutes(stop: ItineraryStop): number {
    return timeToMinutes(stop.timeWindow?.start || '00:00');
  }

  const nextSalah = prayerData?.fiveDailySalah.find((s) => s.isNext);
  const heroPhoto = getHeroPhoto(activeDay.city);
  const isRainy = dayWeather?.condition === 'RAINY';

  return (
    <div
      ref={feedRef}
      className="flex-1 overflow-y-auto overflow-x-hidden bg-[#FAF8F5]"
      style={{ minWidth: 0 }}
    >
      <div className="max-w-2xl mx-auto px-4 py-5">
        {/* ── Top Navigation Tabs (kept stable across day switches) ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-[#E7DFD5]">
          <button
            type="button"
            onClick={() => onSelectDay?.('overview')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shrink-0 ${
              state.activeDayId === 'overview'
                ? 'bg-[#161C23] text-white shadow-sm'
                : 'bg-white text-[#526360] hover:bg-[#FAF8F5] border border-[#E7DFD5]'
            }`}
          >
            Overview
          </button>
          {state.days.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onSelectDay?.(d.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shrink-0 ${
                state.activeDayId === d.id
                  ? 'text-white shadow-sm'
                  : 'bg-white text-[#526360] hover:bg-[#FAF8F5] border border-[#E7DFD5]'
              }`}
              style={{
                backgroundColor: state.activeDayId === d.id ? d.color : undefined,
              }}
            >
              {d.dateLabel ? d.dateLabel : `Day ${d.dayNumber}`}
            </button>
          ))}
        </div>

        {/* ── Day content — keyed by day so switching animates like moving to a new area ── */}
        <div key={activeDay.id}>
          <motion.div
            className="mt-4 space-y-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
        {/* ── Wanderlog-Style Hero Photo (text floats on top of the photograph) ── */}
        <div className="relative h-72 sm:h-80 w-full rounded-2xl overflow-hidden shadow-sm">
            <FallbackImage
              src={heroPhoto}
              alt={`${activeDay.city} cityscape`}
              iconClassName="h-8 w-8"
              fallbackLabel={activeDay.city}
              eager
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Subtle weather particles — strictly confined to the hero */}
            {isRainy && (
              <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                {Array.from({ length: 14 }).map((_, i) => (
                  <span
                    key={i}
                    className="absolute top-0 block w-px rounded-full bg-sky-100/60"
                    style={{
                      left: `${(i * 7.3) % 100}%`,
                      height: `${36 + (i % 4) * 14}px`,
                      animation: `safar-rain-fall ${0.7 + (i % 5) * 0.18}s linear ${
                        (i % 7) * 0.16
                      }s infinite`,
                    }}
                  />
                ))}
                <style>{`
                  @keyframes safar-rain-fall {
                    from { transform: translateY(-60px) rotate(14deg); opacity: 0; }
                    20%  { opacity: 0.75; }
                    to   { transform: translateY(300px) rotate(14deg); opacity: 0; }
                  }
                `}</style>
              </div>
            )}

            {/* Day + weather badges floating over the photograph */}
            <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/40 bg-black/35 px-2.5 py-1 text-[11px] font-black text-white backdrop-blur-md">
                Day {activeDay.dayNumber} · {activeDay.date}
              </span>
              {dayWeather && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-black/35 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-md">
                  {dayWeather.condition === 'RAINY' ? (
                    <CloudRain className="h-3.5 w-3.5" />
                  ) : (
                    <span>{dayWeather.conditionEmoji}</span>
                  )}
                  <span>{dayWeather.temperature}°C</span>
                  <span className="font-semibold text-white/80">{dayWeather.conditionLabel}</span>
                </span>
              )}
            </div>

          {/* ── Text block floating ON TOP of the photograph (glass card) ── */}
          <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/50 bg-white/70 p-4 shadow-xl backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/60 sm:inset-x-4 sm:bottom-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-sky-700">
                    Day {activeDay.dayNumber}
                  </span>
                  {activeDay.subtitle && (
                    <span className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {activeDay.subtitle}
                    </span>
                  )}
                </div>
                <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white">
                  {activeDay.themeTitle}
                </h2>
                {activeDay.routeSummary && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span>🛤️</span>
                    <span className="truncate">{activeDay.routeSummary}</span>
                  </p>
                )}
              </div>
              <div className="shrink-0 select-none text-3xl">
                {activeDay.dayNumber === 1 ? '🗼' : activeDay.dayNumber === 2 ? '⛩️' : '🍁'}
              </div>
            </div>

            {/* Stats, trip mates & Solat summary as clean pills */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {/* Trip mates */}
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5">
                <div className="flex -space-x-2">
                  {state.members.slice(0, 4).map((m) => (
                    <React.Fragment key={m.id}>
                      <FallbackImage
                        src={m.avatar}
                        alt={m.name}
                        title={m.name}
                        iconClassName="h-3.5 w-3.5"
                        className="h-6 w-6 rounded-full object-cover ring-2 ring-white"
                      />
                    </React.Fragment>
                  ))}
                </div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  {collaboratorsCount} tripmates
                </span>
              </div>

              {/* Distance */}
              {activeDay.distanceMiles && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                  🚗 {activeDay.distanceMiles}
                  {activeDay.durationSummary ? ` · ${activeDay.durationSummary}` : ''}
                </span>
              )}

              {/* Stops planned */}
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                📍 {activeStops.length} stops planned
              </span>

              {/* Solat summary */}
              {prayerData && (
                <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-bold text-teal-700">
                  🕌 {prayerData.fiveDailySalah.length} Solat synced
                  {nextSalah
                    ? ` · Next ${nextSalah.name} ${nextSalah.formattedTime12 || nextSalah.time}`
                    : ''}
                </span>
              )}

              {/* Prayer-conflict pill */}
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${
                  health.prayerConflicts === 0
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border border-amber-200 bg-amber-50 text-amber-700'
                }`}
              >
                {health.prayerConflicts === 0 ? '✓' : '⚠'} {health.prayerConflicts} prayer conflict
                {health.prayerConflicts === 1 ? '' : 's'} · {health.label}
              </span>
            </div>
          </div>
        </div>

        {/* ── Compact Prayer Strip (replaces large solat card) ── */}
        <div className="rounded-2xl border border-[#E7DFD5] bg-white overflow-hidden">
          <PrayerStrip
            prayerData={prayerData}
            conflicts={conflicts}
            city={activeDay.city}
          />
        </div>

        {/* ── Quick Filters ── */}
        <div className="rounded-2xl border border-[#E7DFD5] bg-white overflow-hidden">
          <div className="px-3 py-2 flex items-center gap-2 overflow-x-auto text-xs">
            <span className="text-[#8A9592] font-semibold flex items-center gap-1 shrink-0">
              <Filter className="w-3 h-3" /> Filter:
            </span>
            {[
              { id: 'all', label: `All (${activeStops.length})` },
              {
                id: 'attraction',
                label: `Attractions (${activeStops.filter((s) => s.category === 'ATTRACTION').length})`,
              },
              {
                id: 'prayer',
                label: `Prayer (${activeStops.filter((s) => s.category === 'PRAYER').length})`,
              },
              {
                id: 'food',
                label: `Food (${activeStops.filter((s) => s.category === 'FOOD').length})`,
              },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterCategory(f.id)}
                className={`px-2.5 py-1 rounded-full font-bold transition-colors cursor-pointer shrink-0 ${
                  filterCategory === f.id
                    ? 'bg-[#161C23] text-white shadow-xs'
                    : 'bg-[#FAF8F5] text-[#526360] hover:bg-[#E7DFD5]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── AI Conflict Mediator: Phase 1 — Dietary Contradiction Alert ── */}
        {aiSplitPhase === 'conflict' && (
          <div className="my-4 rounded-2xl border border-rose-100 border-l-4 border-l-rose-500 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Dietary Contradiction Detected</span>
              <span className="ml-auto rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-700">
                {activeSplitPlan.timeSlot}
              </span>
            </div>
            <h4 className="mt-2 text-sm font-black text-slate-900">
              🍜 {activeSplitPlan.optionB.name} — Pork Tonkotsu
            </h4>
            <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
              This restaurant's pork-based broth violates{' '}
              <span className="font-bold text-slate-900">Halal</span> requirements for the following group members:
            </p>
            {/* Affected member chips */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {activeSplitPlan.optionA.assignedMembers
                .filter((m) => m.dietaryRestriction === 'Halal')
                .map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 shadow-sm"
                  >
                    <FallbackImage
                      src={m.avatarUrl}
                      alt={m.name}
                      iconClassName="h-3 w-3"
                      className="h-5 w-5 rounded-full object-cover"
                    />
                    <span className="text-[11px] font-bold text-slate-900">{m.name}</span>
                    <span className="rounded-full border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-800">
                      Halal
                    </span>
                  </div>
                ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMediatorOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-rose-700 cursor-pointer"
              >
                <Sparkles className="h-4 w-4" />
                Ask AI Planner
              </button>
              <span className="text-[11px] font-medium text-slate-400">
                AI proposes a win-win split · You decide
              </span>
            </div>
          </div>
        )}

        {/* ── AI Conflict Mediator: Phase 3 — Split & Sync ── */}
        {aiSplitPhase === 'resolved' && <AiSplitRoute plan={activeSplitPlan} />}

        {/* ── Stops List with Inline Prayer Markers ── */}
        <div className="space-y-1">
          {filteredStops.map((stop, i) => {
            // Determine which prayer markers should appear BEFORE this stop
            const stopStartMin = getStopStartMinutes(stop);
            const prevStopEndMin = i > 0 ? getStopEndMinutes(filteredStops[i - 1]) : 0;

            // Find prayers that fall between previous stop's end and this stop's start
            const markersBeforeThisStop = prayerMarkers.filter((pm) => {
              // Only show markers between stops (not inside prayer stops themselves)
              if (stop.category === 'PRAYER') return false;
              return pm.timeMinutes > prevStopEndMin && pm.timeMinutes <= stopStartMin;
            });

            return (
              <React.Fragment key={stop.id}>
                {/* Prayer timeline markers that fall before this stop */}
                {markersBeforeThisStop.map((pm) => (
                  <PrayerTimelineMarker
                    key={`prayer-marker-${pm.salah.name}`}
                    salah={pm.salah}
                    conflict={pm.conflict}
                    onAddPrayerBreak={handleAddPrayerBreak}
                    onIgnoreConflict={handleDismissConflict}
                  />
                ))}

                <Reveal delay={Math.min(i * 0.04, 0.28)} y={10}>
                  <StopCard
                    stop={stop}
                    index={i}
                    isSelected={state.selectedStopId === stop.id}
                    isHovered={state.hoveredStopId === stop.id}
                    isLead={isLead}
                    dayColor={dayColor}
                    onSelect={onSelectStop}
                    onHover={onHoverStop}
                    activeConflict={state.activeConflicts.find(c => c.activityId === stop.id)}
                    onOpenAiPlanner={onOpenAiPlanner ? () => {
                      const conflict = state.activeConflicts.find(c => c.activityId === stop.id);
                      if (conflict) onOpenAiPlanner(conflict.id);
                    } : undefined}
                  />
                </Reveal>

                {/* ── Drag & Drop Blend Simulation: Drop Zone Between Two Existing Itinerary Items ── */}
                {i === 0 && (
                  <div className="my-2.5">
                    {isSyncingTransit ? (
                      <div className="p-4 bg-emerald-50 border-2 border-emerald-400 rounded-2xl flex items-center justify-center gap-3 shadow-md animate-pulse">
                        <div className="w-5 h-5 border-2 border-[#0D6955] border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs font-black text-[#0D6955] tracking-wide">
                          AI Syncing Transit & Solat...
                        </span>
                      </div>
                    ) : hasDroppedKiyomizu ? (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-3 duration-400">
                        {/* Transit Block: 🚌 Bus 206 • 15 mins */}
                        <div className="flex items-center gap-3 py-1 px-3 ml-8">
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="w-px h-3 bg-[#0D6955]" />
                            <div className="w-px h-3 bg-[#0D6955]" />
                          </div>
                          <div className="flex items-center gap-2 bg-emerald-50/90 border border-[#0D6955]/40 rounded-full px-3.5 py-1 text-[11px] font-bold text-[#0D6955] shadow-xs">
                            <span className="text-sm">🚌</span>
                            <span className="font-extrabold text-[#161C23]">Bus 206</span>
                            <span className="text-[#8A9592]">·</span>
                            <span>15 mins</span>
                            <span className="text-[#8A9592]">·</span>
                            <span className="text-[9px] font-black uppercase text-emerald-800 bg-emerald-200/80 px-1.5 py-0.2 rounded">
                              AI Transit Synced
                            </span>
                          </div>
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="w-px h-3 bg-[#0D6955]" />
                            <div className="w-px h-3 bg-[#0D6955]" />
                          </div>
                        </div>

                        {/* Itinerary Block: Kiyomizu-dera Temple */}
                        <div
                          id="blended-stop-kiyomizu"
                          className="relative rounded-2xl border-2 border-[#0D6955] bg-gradient-to-r from-emerald-50/40 via-white to-white p-3.5 shadow-md transition-all group overflow-hidden"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-xl bg-[#0D6955] text-white flex items-center justify-center text-base font-black shadow-sm shrink-0">
                                ⛩️
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-sm font-black text-[#161C23]">Kiyomizu-dera Temple</h4>
                                  <span className="text-[10px] font-extrabold bg-[#0D6955] text-white px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" />
                                    AI Blended
                                  </span>
                                </div>
                                <p className="text-xs text-[#526360]">
                                  Historic temple with city views. UNESCO World Heritage wooden stage overlooking Kyoto.
                                </p>
                                <div className="flex items-center gap-2 pt-1 flex-wrap">
                                  <span className="text-[11px] font-mono font-bold text-[#0D6955] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                    🕐 10:15 AM - 11:30 AM
                                  </span>
                                  <span className="text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                                    🕌 Fits Before Dhuhr (11:54 AM)
                                  </span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setHasDroppedKiyomizu(false)}
                              className="text-[10px] font-bold text-[#8A9592] hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors shrink-0 cursor-pointer"
                              title="Reset item"
                            >
                              ✕ Remove
                            </button>
                          </div>
                        </div>

                        {/* Transit continuation */}
                        <div className="flex items-center gap-3 py-1 px-3 ml-8">
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="w-px h-3 bg-[#C4BCB3]" />
                            <div className="w-px h-3 bg-[#C4BCB3]" />
                          </div>
                          <div className="text-[10px] font-semibold text-[#8A9592]">
                            Continuing Schedule
                          </div>
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="w-px h-3 bg-[#C4BCB3]" />
                            <div className="w-px h-3 bg-[#C4BCB3]" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        id="timeline-drop-zone"
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                          setIsDragOverDropZone(true);
                        }}
                        onDragLeave={() => setIsDragOverDropZone(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleDropKiyomizu();
                        }}
                        onClick={() => handleDropKiyomizu()}
                        className={`my-2 p-3.5 rounded-2xl border-2 border-dashed transition-all duration-200 flex items-center justify-center gap-2 text-xs font-bold cursor-pointer select-none ${
                          isDragOverDropZone
                            ? 'border-[#0D6955] bg-emerald-50/90 text-[#0D6955] scale-[1.01] shadow-md ring-2 ring-[#0D6955]/20'
                            : 'border-[#0D6955]/40 bg-[#FAF8F5]/80 hover:bg-white hover:border-[#0D6955] text-[#526360] hover:text-[#0D6955]'
                        }`}
                        title="Drag 'Kiyomizu-dera Temple' from Discovery Panel and drop here"
                      >
                        <Sparkles className={`w-4 h-4 text-[#0D6955] ${isDragOverDropZone ? 'animate-bounce' : ''}`} />
                        <span>
                          {isDragOverDropZone
                            ? 'Release to drop & blend Kiyomizu-dera with transit!'
                            : 'Drop Zone: Drag "Kiyomizu-dera Temple" here to blend with schedule'}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {stop.transitToNext && i < filteredStops.length - 1 && (
                  <TransitSeparator transit={stop.transitToNext} />
                )}
              </React.Fragment>
            );
          })}

          {/* Prayer markers that come after the last stop */}
          {filteredStops.length > 0 &&
            prayerMarkers
              .filter((pm) => pm.timeMinutes > getStopEndMinutes(filteredStops[filteredStops.length - 1]))
              .map((pm) => (
                <PrayerTimelineMarker
                  key={`prayer-marker-end-${pm.salah.name}`}
                  salah={pm.salah}
                  conflict={pm.conflict}
                  onAddPrayerBreak={handleAddPrayerBreak}
                  onIgnoreConflict={handleDismissConflict}
                />
              ))}
              
          {/* Add Activity Button */}
          <div className="mt-4 pt-4 border-t border-dashed border-[#C4BCB3]">
            <button
              type="button"
              onClick={() => onAddStop?.(activeDay.id, '')}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#FAF8F5] hover:bg-[#F3EFEA] border-2 border-dashed border-[#C4BCB3] hover:border-[#8A9592] text-[#526360] hover:text-[#161C23] text-sm font-extrabold rounded-2xl transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Activity</span>
            </button>
          </div>
        </div>

        <div className="h-8" />
          </motion.div>
        </div>
      </div>

      {/* ── AI Conflict Mediator Modal (proper wiring) ── */}
      {isMediatorOpen && (
        <AiMediatorModal
          plan={activeSplitPlan}
          onClose={() => setIsMediatorOpen(false)}
          onAccept={() => {
            setIsMediatorOpen(false);
            setAiSplitPhase('resolved');
          }}
        />
      )}
    </div>
  );
};

export { ItineraryFeed as TimelinePanel };

