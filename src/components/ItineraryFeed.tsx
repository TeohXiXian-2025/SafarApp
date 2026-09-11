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
  Star,
  DollarSign,
  Compass,
  ArrowRight,
  Calendar,
  Layers,
  Filter,
  Settings2,
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
} from '../types/itinerary';
import {
  fetchPrayerTimesForCity,
  PrayerData,
  timeToMinutes,
  formatTo12Hour,
} from '../services/prayerTimeService';
import {
  detectPrayerConflicts,
  getItineraryHealth,
  getNearbyPrayerPlaces,
} from '../services/prayerConflictEngine';
import { PrayerTimelineMarker } from './PrayerTimelineMarker';

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
}: StopCardProps) {
  const catConfig = CATEGORY_CONFIG[stop.category];
  const statusConfig = STATUS_CONFIG[stop.status];
  const isPrayer = stop.category === 'PRAYER';

  return (
    <div
      id={`stop-card-${stop.id}`}
      className={`relative rounded-2xl border transition-all duration-200 cursor-pointer group overflow-hidden ${
        isPrayer ? 'bg-gradient-to-r from-teal-50/70 via-white to-white' : 'bg-white'
      } ${
        isSelected
          ? 'shadow-[0_0_0_2px_rgba(13,105,85,0.25)] shadow-lg'
          : isHovered
          ? 'shadow-md'
          : 'shadow-sm hover:shadow-md'
      }`}
      style={{
        borderColor: isSelected ? dayColor : isHovered ? `${dayColor}80` : '#E7DFD5',
      }}
      onClick={() => onSelect(stop.id)}
      onMouseEnter={() => onHover(stop.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Left indicator bar */}
      {isSelected && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl"
          style={{ backgroundColor: dayColor }}
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
                <span className="text-[10px] font-black text-teal-700 bg-teal-100/80 px-2 py-0.5 rounded-full">
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
          </div>

          {/* Image */}
          {stop.imageUrl && (
            <div className="shrink-0">
              <img
                src={stop.imageUrl}
                alt={stop.title}
                className="w-20 h-20 rounded-xl object-cover border border-[#E7DFD5] shadow-sm"
                loading="lazy"
              />
            </div>
          )}
        </div>
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
          <h2 className="text-xl font-black text-[#161C23] tracking-tight">总览 (Overview)</h2>
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
            <div
              key={day.id}
              onClick={() => onSelectDay(day.id)}
              className="p-4 rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all cursor-pointer group hover:border-[#0D6955]/50 relative overflow-hidden"
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
}) => {
  const feedRef = useRef<HTMLDivElement>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [prayerData, setPrayerData] = useState<PrayerData | null>(null);
  const [dismissedConflicts, setDismissedConflicts] = useState<Set<string>>(new Set());

  // Fetch prayer times based on active day's city (location-aware)
  useEffect(() => {
    if (activeDay) {
      fetchPrayerTimesForCity(activeDay.city, activeDay.date).then(setPrayerData);
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

  return (
    <div
      ref={feedRef}
      className="flex-1 overflow-y-auto overflow-x-hidden bg-[#FAF8F5]"
      style={{ minWidth: 0 }}
    >
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* ── Top Navigation Tabs ── */}
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
            总览 Overview
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

        {/* ── Day Header Banner with Signature Color ── */}
        <div className="bg-white rounded-3xl border border-[#E7DFD5] overflow-hidden shadow-sm">
          <div
            className="px-5 py-4 text-white"
            style={{
              background: `linear-gradient(135deg, ${dayColor}, #0D6955)`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                    Day {activeDay.dayNumber} · {activeDay.date}
                  </span>
                  {activeDay.distanceMiles && (
                    <span className="text-xs font-bold text-white/90">
                      🚗 {activeDay.distanceMiles}
                      {activeDay.durationSummary ? ` (${activeDay.durationSummary})` : ''}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-black tracking-tight">
                  {activeDay.themeTitle}
                </h2>
                {activeDay.subtitle && (
                  <p className="text-xs font-semibold text-white/80">
                    {activeDay.subtitle}
                  </p>
                )}
                {activeDay.routeSummary && (
                  <p className="text-xs font-bold text-white/90 mt-1 flex items-center gap-1">
                    <span>🛤️</span>
                    <span>{activeDay.routeSummary}</span>
                  </p>
                )}
              </div>
              <div className="text-3xl select-none">
                {activeDay.dayNumber === 1 ? '🗼' : activeDay.dayNumber === 2 ? '⛩️' : '🍁'}
              </div>
            </div>

            {/* Members + City info + Health */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/20">
              <div className="flex -space-x-2">
                {state.members.slice(0, 4).map((m) => (
                  <img
                    key={m.id}
                    src={m.avatar}
                    alt={m.name}
                    title={m.name}
                    className="w-6 h-6 rounded-full object-cover ring-2 ring-white"
                  />
                ))}
              </div>
              <span className="text-xs font-bold text-white/90">
                {activeDay.city} · {collaboratorsCount} tripmates
              </span>
              <span className="ml-auto text-xs font-bold bg-white/20 px-2.5 py-0.5 rounded-full">
                {activeStops.length} stops planned
              </span>
              {/* Itinerary Health Pill */}
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  health.prayerConflicts === 0
                    ? 'bg-emerald-400/30 text-emerald-100'
                    : 'bg-amber-400/30 text-amber-100'
                }`}
              >
                {health.prayerConflicts === 0 ? '✓' : '⚠'} {health.label}
              </span>
            </div>
          </div>

          {/* ── Compact Prayer Strip (replaces large solat card) ── */}
          <PrayerStrip
            prayerData={prayerData}
            conflicts={conflicts}
            city={activeDay.city}
          />

          {/* Quick Filters */}
          <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto text-xs border-t border-[#E7DFD5]">
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

                <StopCard
                  stop={stop}
                  index={i}
                  isSelected={state.selectedStopId === stop.id}
                  isHovered={state.hoveredStopId === stop.id}
                  isLead={isLead}
                  dayColor={dayColor}
                  onSelect={onSelectStop}
                  onHover={onHoverStop}
                />
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
        </div>

        <div className="h-8" />
      </div>
    </div>
  );
};
