import React, { useState } from 'react';
import { Clock, MapPin, ChevronDown, ChevronUp, Navigation } from 'lucide-react';
import { SalahTime, PrayerConflict, PrayerPlaceResult } from '../types/itinerary';

// ─────────────────────────────────────────────────────
// PrayerTimelineMarker — Compact inline prayer marker
// ─────────────────────────────────────────────────────
// Default: "15:28 ── 🕌 Asr" (single row, subtle teal)
// Clicked: expands to show nearby prayer places
// Conflict: amber border with overlap message

interface PrayerTimelineMarkerProps {
  salah: SalahTime;
  conflict?: PrayerConflict;
  onViewOnMap?: (placeId: string) => void;
  onAddPrayerBreak?: (conflict: PrayerConflict, place: PrayerPlaceResult) => void;
  onIgnoreConflict?: (conflict: PrayerConflict) => void;
}

const SALAH_META: Record<string, { emoji: string; gradient: string }> = {
  Fajr: { emoji: '🌅', gradient: 'from-sky-100 to-sky-50' },
  Dhuhr: { emoji: '☀️', gradient: 'from-amber-100 to-amber-50' },
  Asr: { emoji: '🌤️', gradient: 'from-orange-100 to-orange-50' },
  Maghrib: { emoji: '🌅', gradient: 'from-rose-100 to-rose-50' },
  Isha: { emoji: '🌙', gradient: 'from-indigo-100 to-indigo-50' },
};

export const PrayerTimelineMarker: React.FC<PrayerTimelineMarkerProps> = ({
  salah,
  conflict,
  onViewOnMap,
  onAddPrayerBreak,
  onIgnoreConflict,
}) => {
  const [expanded, setExpanded] = useState(false);

  const meta = SALAH_META[salah.name] || SALAH_META.Dhuhr;
  const hasConflict = conflict && conflict.severity !== 'ok';
  const isOverlap = conflict?.severity === 'overlap';
  const isTight = conflict?.severity === 'tight';
  const isPassed = salah.isPassed;

  return (
    <div className="my-1.5">
      {/* ── Main marker row ── */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={`w-full flex items-center gap-3 py-2 px-3 rounded-xl transition-all duration-200 cursor-pointer group ${
          isPassed
            ? 'opacity-50'
            : hasConflict
            ? 'bg-gradient-to-r from-amber-50 to-orange-50/40 border border-amber-200/80 shadow-sm hover:shadow-md'
            : salah.isNext
            ? `bg-gradient-to-r ${meta.gradient} border border-teal-200/60 shadow-sm hover:shadow-md`
            : 'hover:bg-teal-50/40'
        }`}
      >
        {/* Left: timeline connector */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <div className={`w-px h-2 ${isPassed ? 'bg-gray-300' : hasConflict ? 'bg-amber-300' : 'bg-teal-300'}`} />
          <div
            className={`w-2.5 h-2.5 rounded-full border-2 ${
              isPassed
                ? 'bg-gray-300 border-gray-400'
                : hasConflict
                ? 'bg-amber-400 border-amber-500'
                : salah.isNext
                ? 'bg-teal-500 border-teal-600 animate-pulse'
                : 'bg-teal-300 border-teal-400'
            }`}
          />
          <div className={`w-px h-2 ${isPassed ? 'bg-gray-300' : hasConflict ? 'bg-amber-300' : 'bg-teal-300'}`} />
        </div>

        {/* Center: prayer info */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-mono font-bold text-[#526360] shrink-0">
            {salah.time}
          </span>
          <span className={`text-[10px] ${isPassed ? 'text-gray-400' : hasConflict ? 'text-amber-400' : 'text-teal-400'}`}>
            ──
          </span>
          <span className="text-sm shrink-0">{isPassed ? '✓' : '🕌'}</span>
          <span
            className={`text-xs font-extrabold ${
              isPassed
                ? 'text-gray-500 line-through'
                : hasConflict
                ? 'text-amber-800'
                : 'text-[#0D6955]'
            }`}
          >
            {salah.name}
          </span>

          {/* Status badge */}
          {isPassed && (
            <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
              Passed
            </span>
          )}
          {salah.isNext && !hasConflict && (
            <span className="text-[9px] font-bold text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded-full animate-pulse">
              Upcoming
            </span>
          )}
          {isOverlap && (
            <span className="text-[9px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              ⚠ Conflict
            </span>
          )}
          {isTight && (
            <span className="text-[9px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full">
              ⏱ Tight
            </span>
          )}
        </div>

        {/* Right: expand arrow */}
        {!isPassed && (
          <div className="shrink-0 text-[#8A9592] group-hover:text-[#0D6955] transition-colors">
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </div>
        )}
      </button>

      {/* ── Expanded: Conflict info + Nearby prayer places ── */}
      {expanded && !isPassed && (
        <div className={`ml-8 mt-1 rounded-xl border overflow-hidden transition-all duration-300 ${
          hasConflict
            ? 'border-amber-200 bg-gradient-to-b from-amber-50/80 to-white'
            : 'border-teal-200 bg-gradient-to-b from-teal-50/50 to-white'
        }`}>
          {/* Conflict message */}
          {hasConflict && conflict && (
            <div className="px-3.5 py-2.5 border-b border-amber-100">
              <p className="text-xs font-bold text-amber-900 leading-relaxed">
                {conflict.suggestion}
              </p>
              {conflict.severity === 'overlap' && (
                <p className="text-[10px] text-amber-700 mt-1">
                  Overlap: ~{conflict.overlapMinutes} min with {conflict.stopTitle}
                </p>
              )}
            </div>
          )}

          {/* Prayer details */}
          <div className="px-3.5 py-2.5">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3 h-3 text-[#0D6955]" />
              <span className="text-xs font-bold text-[#161C23]">
                {salah.name} — {salah.time}
              </span>
            </div>

            {/* Nearby prayer places */}
            {conflict?.nearbyPrayerPlaces && conflict.nearbyPrayerPlaces.length > 0 && (
              <div className="space-y-1.5 mt-2">
                <p className="text-[10px] font-extrabold text-[#526360] uppercase tracking-wider">
                  🕌 Nearby Prayer Places
                </p>
                {conflict.nearbyPrayerPlaces.map((place) => (
                  <div
                    key={place.id}
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-white border border-[#E7DFD5] hover:border-teal-300 transition-colors group/place"
                  >
                    <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-xs shrink-0">
                      🕌
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-extrabold text-[#161C23] truncate">
                        {place.name}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-[#8A9592]">
                        <MapPin className="w-2.5 h-2.5" />
                        <span>{place.distance}</span>
                        <span>·</span>
                        <span>{place.walkMinutes} min walk</span>
                        {place.hasWudu && (
                          <>
                            <span>·</span>
                            <span className="text-teal-700 font-semibold">Wudu ✓</span>
                          </>
                        )}
                      </div>
                    </div>
                    {onViewOnMap && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewOnMap(place.id);
                        }}
                        className="text-[10px] font-bold text-[#0D6955] hover:text-teal-800 px-2 py-1 rounded-lg hover:bg-teal-50 transition-colors cursor-pointer shrink-0"
                      >
                        Map
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons for conflicts */}
          {hasConflict && conflict && (
            <div className="px-3.5 py-2.5 border-t border-amber-100 flex items-center gap-2">
              {conflict.nearbyPrayerPlaces?.[0] && onAddPrayerBreak && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddPrayerBreak(conflict, conflict.nearbyPrayerPlaces![0]);
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-[#0D6955] hover:bg-[#08544A] text-white text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  🕌 Add Prayer Break
                </button>
              )}
              {onViewOnMap && conflict.nearbyPrayerPlaces?.[0] && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewOnMap(conflict.nearbyPrayerPlaces![0].id);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-[#E7DFD5] hover:bg-[#FAF8F5] text-[11px] font-bold text-[#526360] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Navigation className="w-3 h-3" />
                  View
                </button>
              )}
              {onIgnoreConflict && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onIgnoreConflict(conflict);
                  }}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-[#8A9592] hover:text-[#526360] hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Ignore
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
