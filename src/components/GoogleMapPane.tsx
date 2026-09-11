import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Clock,
  Star,
  ChevronRight,
  Moon,
  Compass,
  Car,
  Sparkles,
  ZoomIn,
} from 'lucide-react';
import {
  ItineraryStop,
  ItineraryDay,
  MapLayer,
  StopCategory,
  StopStatus,
} from '../types/itinerary';
import { fetchKyotoPrayerTimes, KyotoPrayerData } from '../services/prayerTimeService';

// ─────────────────────────────────────────────────────
// Colors by Day (Day 1: Cyan to identify Day 1 itinerary)
// ─────────────────────────────────────────────────────
export const DAY_COLORS: Record<number, { main: string; badge: string; border: string }> = {
  1: { main: '#0284C7', badge: '#0284C7', border: '#0369A1' }, // Day 1: Cyan / Sky Blue
  2: { main: '#F97316', badge: '#F97316', border: '#EA580C' }, // Day 2: Orange
  3: { main: '#8B5CF6', badge: '#8B5CF6', border: '#7C3AED' }, // Day 3: Purple
};

const CATEGORY_MARKER: Record<
  StopCategory,
  { bg: string; glyph: string; border: string }
> = {
  ATTRACTION: { bg: '#4F46E5', glyph: '🏛', border: '#3730A3' },
  FOOD: { bg: '#EA580C', glyph: '🍜', border: '#C2410C' },
  PRAYER: { bg: '#0D9488', glyph: '🕌', border: '#0F766E' },
  LODGING: { bg: '#2563EB', glyph: '🏨', border: '#1D4ED8' },
  TRANSIT: { bg: '#6B7280', glyph: '🚆', border: '#4B5563' },
};

// ─────────────────────────────────────────────────────
// Polyline: connects stops with colored route line
// ─────────────────────────────────────────────────────
interface DayStopsPolylineProps {
  stops: ItineraryStop[];
  color: string;
  isActive: boolean;
}

const DayStopsPolyline: React.FC<DayStopsPolylineProps> = ({
  stops,
  color,
  isActive,
}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || !mapsLib || stops.length < 2) return;

    if (polylineRef.current) {
      polylineRef.current.setMap(null);
    }

    const path = stops.map((s) => ({
      lat: s.coordinate.lat,
      lng: s.coordinate.lng,
    }));

    polylineRef.current = new mapsLib.Polyline({
      path,
      geodesic: true,
      strokeColor: color,
      strokeOpacity: isActive ? 0.85 : 0.4,
      strokeWeight: isActive ? 4 : 2,
      map,
    });

    return () => {
      polylineRef.current?.setMap(null);
    };
  }, [map, mapsLib, stops, color, isActive]);

  return null;
};

// ─────────────────────────────────────────────────────
// Custom Stop Marker with Attraction Name Tag
// ─────────────────────────────────────────────────────
interface StopMarkerProps {
  stop: ItineraryStop;
  index: number;
  dayNumber: number;
  isSelected: boolean;
  isHovered: boolean;
  onClick: (id: string) => void;
  onHover: (id: string | null) => void;
}

const StopMarker: React.FC<StopMarkerProps> = ({
  stop,
  index,
  dayNumber,
  isSelected,
  isHovered,
  onClick,
  onHover,
}) => {
  const dayColorConfig = DAY_COLORS[dayNumber] ?? DAY_COLORS[1];
  // Day 1 uses day color (#0284C7), prayer stops use teal
  const markerBg =
    stop.category === 'PRAYER'
      ? '#0D9488'
      : dayNumber === 1
      ? '#0284C7'
      : dayColorConfig.main;

  const isHighlighted = isSelected || isHovered;
  const isAttraction = stop.category === 'ATTRACTION';

  return (
    <AdvancedMarker
      position={{ lat: stop.coordinate.lat, lng: stop.coordinate.lng }}
      onClick={() => onClick(stop.id)}
      onMouseEnter={() => onHover(stop.id)}
      onMouseLeave={() => onHover(null)}
      zIndex={isHighlighted ? 200 : stop.category === 'PRAYER' ? 50 : 100}
    >
      <div
        className="relative flex flex-col items-center cursor-pointer transition-transform duration-200"
        style={{
          transform: isHighlighted ? 'scale(1.25)' : 'scale(1)',
        }}
      >
        {/* Pulsing ring when selected */}
        {isHighlighted && (
          <div
            className="absolute -top-1 w-9 h-9 rounded-full animate-ping opacity-50"
            style={{ backgroundColor: markerBg }}
          />
        )}

        {/* Marker Bubble */}
        <div
          className="relative w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black shadow-lg border-2 border-white"
          style={{ backgroundColor: markerBg }}
        >
          {stop.category === 'PRAYER' ? '🕌' : index + 1}
        </div>

        {/* Attraction Label (like 金阁寺, 鸭川 in reference screenshot) */}
        {isAttraction && (
          <div
            className="mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-black whitespace-nowrap shadow-md border border-white/80 select-none bg-white text-[#161C23]"
            style={{
              boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
            }}
          >
            {stop.title.split('—')[0].trim()}
          </div>
        )}
      </div>
    </AdvancedMarker>
  );
};

// ─────────────────────────────────────────────────────
// Floating Route Badge (like "09.01 周二 4km" in screenshot)
// ─────────────────────────────────────────────────────
interface RouteBadgeMarkerProps {
  day: ItineraryDay;
}

const RouteBadgeMarker: React.FC<RouteBadgeMarkerProps> = ({ day }) => {
  if (!day.distanceMiles || day.stops.length === 0) return null;

  // Approximate center of route
  const midIndex = Math.floor(day.stops.length / 2);
  const midStop = day.stops[midIndex];
  const color = day.color || (day.dayNumber === 1 ? '#0284C7' : '#F97316');

  return (
    <AdvancedMarker
      position={{ lat: midStop.coordinate.lat + 0.003, lng: midStop.coordinate.lng + 0.003 }}
      zIndex={300}
    >
      <div
        className="px-3 py-1 rounded-full text-white text-xs font-black shadow-xl flex items-center gap-1.5 border-2 border-white cursor-default select-none pointer-events-none"
        style={{ backgroundColor: color }}
      >
        <span>{day.dateLabel ? day.dateLabel.split('·')[0].trim() : `Day ${day.dayNumber}`}</span>
        <span>{day.distanceMiles}</span>
      </div>
    </AdvancedMarker>
  );
};

// ─────────────────────────────────────────────────────
// Info Window for selected stop
// ─────────────────────────────────────────────────────
function StopInfoWindow({
  stop,
  dayNumber,
  onClose,
}: {
  stop: ItineraryStop;
  dayNumber: number;
  onClose: () => void;
}) {
  const cat = CATEGORY_MARKER[stop.category];
  const dayColor = DAY_COLORS[dayNumber]?.main ?? '#0284C7';

  return (
    <InfoWindow
      position={{ lat: stop.coordinate.lat, lng: stop.coordinate.lng }}
      onCloseClick={onClose}
      pixelOffset={[0, -42]}
    >
      <div className="max-w-[260px] font-sans p-1">
        {/* Day badge & Category */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className="text-[9px] font-black text-white px-2 py-0.5 rounded-full"
            style={{ backgroundColor: dayColor }}
          >
            Day {dayNumber}
          </span>
          <span className="text-[10px] font-bold text-[#526360]">
            {cat.glyph} {stop.category}
          </span>
          {stop.timeWindow && (
            <span className="ml-auto text-[10px] font-mono font-bold text-[#0D6955]">
              {stop.timeWindow.start}
            </span>
          )}
        </div>

        {/* Title */}
        <h4 className="text-xs font-extrabold text-gray-900 leading-tight mb-1">
          {stop.title}
        </h4>

        {/* Address */}
        {stop.address && (
          <p className="text-[10px] text-gray-500 mb-1.5 truncate">
            📍 {stop.address}
          </p>
        )}

        {/* Description */}
        {stop.description && (
          <p className="text-[11px] text-gray-700 leading-snug mb-2 line-clamp-3 bg-gray-50 p-1.5 rounded-lg">
            {stop.description}
          </p>
        )}

        {/* Image if available */}
        {stop.imageUrl && (
          <img
            src={stop.imageUrl}
            alt={stop.title}
            className="w-full h-24 object-cover rounded-lg mb-2"
          />
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1">
          {stop.halalBadge && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
              ✅ {stop.halalBadge}
            </span>
          )}
          {stop.status === 'CONFIRMED' && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              ✓ Confirmed
            </span>
          )}
        </div>
      </div>
    </InfoWindow>
  );
}

// ─────────────────────────────────────────────────────
// Fallback Rich Map (SVG-based vector display)
// ─────────────────────────────────────────────────────
function RichFallbackMap({
  days,
  activeDayId,
  stops,
  selectedStopId,
  onSelectStop,
}: {
  days: ItineraryDay[];
  activeDayId: string;
  stops: ItineraryStop[];
  selectedStopId: string | null;
  onSelectStop: (id: string | null) => void;
}) {
  const activeDay = days.find((d) => d.id === activeDayId) || days[0];

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-slate-900 via-[#0B1E19] to-[#0A2E26] relative overflow-hidden">
      {/* Background Grid & Decorative Map Roads */}
      <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#2DD4BF" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        {/* Curved stylized road lines */}
        <path
          d="M 50 150 Q 200 80 350 220 T 600 350"
          fill="none"
          stroke="#0284C7"
          strokeWidth="3"
          strokeDasharray="6 4"
        />
        <path
          d="M 120 400 Q 250 280 450 320 T 700 200"
          fill="none"
          stroke="#8B5CF6"
          strokeWidth="3"
          strokeDasharray="6 4"
        />
      </svg>

      {/* Floating Route Badge like in screenshot */}
      <div className="absolute top-14 left-4 z-10 flex items-center gap-2">
        <div
          className="px-3 py-1.5 rounded-full text-white text-xs font-black shadow-lg flex items-center gap-1.5 border border-white/40 backdrop-blur-md"
          style={{
            backgroundColor:
              activeDay.color ||
              (activeDay.dayNumber === 1 ? '#0284C7' : activeDay.dayNumber === 2 ? '#F97316' : '#8B5CF6'),
          }}
        >
          <span>{activeDay.dateLabel || `Day ${activeDay.dayNumber}`}</span>
          <span>{activeDay.distanceMiles || '16.4 mi'}</span>
        </div>
      </div>

      {/* Center Interactive Stop Pins */}
      <div className="flex-1 relative z-10 p-6 overflow-y-auto">
        <div className="text-center mb-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-3 py-1 rounded-full">
            Interactive Tourist Attraction Map ({activeDay.city})
          </span>
          <h3 className="text-base font-black text-white mt-2">{activeDay.themeTitle}</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
          {stops.map((stop, i) => {
            const isSelected = selectedStopId === stop.id;
            const isDay1 = activeDay.dayNumber === 1;
            const pinColor =
              stop.category === 'PRAYER'
                ? '#0D9488'
                : isDay1
                ? '#0284C7'
                : activeDay.color || '#F97316';

            return (
              <div
                key={stop.id}
                onClick={() => onSelectStop(stop.id)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                  isSelected
                    ? 'bg-white/15 border-white shadow-lg scale-102'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div
                  className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-black shrink-0 shadow-sm"
                  style={{ backgroundColor: pinColor }}
                >
                  {stop.category === 'PRAYER' ? '🕌' : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-bold text-white truncate">{stop.title}</p>
                  </div>
                  {stop.timeWindow && (
                    <p className="text-[10px] text-emerald-300 font-mono">
                      {stop.timeWindow.start}
                    </p>
                  )}
                  {stop.description && (
                    <p className="text-[10px] text-white/60 line-clamp-1 mt-0.5">
                      {stop.description}
                    </p>
                  )}
                </div>
                <span className="text-sm shrink-0">
                  {CATEGORY_MARKER[stop.category]?.glyph ?? '🏛️'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Map Content (Google Maps Instance)
// ─────────────────────────────────────────────────────
function MapContent({
  days,
  activeDayId,
  stops,
  selectedStopId,
  hoveredStopId,
  activeMapLayer,
  mapViewport,
  onSelectStop,
  onHoverStop,
  onSetLayer,
  onSelectDay,
}: {
  days: ItineraryDay[];
  activeDayId: string;
  stops: ItineraryStop[];
  selectedStopId: string | null;
  hoveredStopId: string | null;
  activeMapLayer: MapLayer;
  mapViewport: { center: { lat: number; lng: number }; zoom: number };
  onSelectStop: (id: string | null) => void;
  onHoverStop: (id: string | null) => void;
  onSetLayer: (layer: MapLayer) => void;
  onSelectDay?: (dayId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [prayerData, setPrayerData] = useState<KyotoPrayerData | null>(null);

  useEffect(() => {
    fetchKyotoPrayerTimes().then(setPrayerData);
  }, []);

  const activeDay = days.find((d) => d.id === activeDayId) || days[0];
  const selectedStop = stops.find((s) => s.id === selectedStopId) ?? null;

  // Filter stops based on layer
  const filteredStops = stops.filter((stop) => {
    if (activeMapLayer === 'prayer') return stop.category === 'PRAYER';
    if (activeMapLayer === 'halal') return stop.category === 'FOOD';
    return true;
  });

  return (
    <div className={`relative w-full h-full ${isExpanded ? 'fixed inset-0 z-50' : ''}`}>
      {/* ── Real Google Map ── */}
      <Map
        defaultCenter={mapViewport.center}
        center={mapViewport.center}
        defaultZoom={mapViewport.zoom}
        zoom={mapViewport.zoom}
        mapId="safar-trip-planner-map"
        style={{ width: '100%', height: '100%' }}
        gestureHandling="greedy"
        disableDefaultUI={false}
        clickableIcons={false}
        reuseMaps
      >
        {/* ── Route Polylines for each day ── */}
        {days.map((day) => {
          const isDayActive = day.id === activeDayId || activeDayId === 'overview';
          const dayColor =
            day.color || (day.dayNumber === 1 ? '#0284C7' : day.dayNumber === 2 ? '#F97316' : '#8B5CF6');

          return (
            <DayStopsPolyline
              key={day.id}
              stops={day.stops}
              color={dayColor}
              isActive={isDayActive}
            />
          );
        })}

        {/* ── Floating Route Badges (like "09.01 周二 4km" in screenshot) ── */}
        {days.map((day) => (
          <RouteBadgeMarker key={`badge-${day.id}`} day={day} />
        ))}

        {/* ── Attraction & Stop Markers ── */}
        {filteredStops.map((stop, i) => (
          <StopMarker
            key={stop.id}
            stop={stop}
            index={i}
            dayNumber={activeDay.dayNumber}
            isSelected={selectedStopId === stop.id}
            isHovered={hoveredStopId === stop.id}
            onClick={onSelectStop}
            onHover={onHoverStop}
          />
        ))}

        {/* ── Info Window ── */}
        {selectedStop && (
          <StopInfoWindow
            stop={selectedStop}
            dayNumber={activeDay.dayNumber}
            onClose={() => onSelectStop(null)}
          />
        )}
      </Map>

      {/* ── Top Bar: Kyoto Solat Time Zone API HUD ── */}
      <div className="absolute top-3 left-3 right-14 z-10 flex items-center justify-between pointer-events-none">
        {/* Kyoto Solat Pill */}
        <div className="pointer-events-auto bg-white/95 backdrop-blur-md border border-[#E7DFD5] shadow-lg rounded-2xl px-3 py-1.5 flex items-center gap-2 text-xs">
          <span className="text-sm">🕌</span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-[#161C23]">Kyoto Solat Time Zone</span>
              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                Aladhan API
              </span>
            </div>
            <div className="text-[10px] font-mono text-[#526360] font-bold flex items-center gap-1">
              <span>Fajr 04:10</span>·<span>Dhuhr 11:54</span>·<span>Asr 15:28</span>·
              <span>Maghrib 18:10</span>·<span>Isha 19:31</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Top Right Controls ── */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2 pointer-events-none">
        {/* Expand/Collapse Button */}
        <button
          type="button"
          onClick={() => setIsExpanded((e) => !e)}
          className="pointer-events-auto w-9 h-9 bg-white/95 backdrop-blur-sm border border-white/80 shadow-lg rounded-xl flex items-center justify-center text-[#526360] hover:text-[#161C23] transition-colors cursor-pointer"
          title={isExpanded ? 'Shrink map' : 'Expand map'}
        >
          {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* Zoom Button */}
        <button
          type="button"
          onClick={() => {
            if (map) {
              const currentZoom = map.getZoom() || 13;
              map.setZoom(currentZoom + 1);
            }
          }}
          className="pointer-events-auto w-9 h-9 bg-white/95 backdrop-blur-sm border border-white/80 shadow-lg rounded-xl flex items-center justify-center text-[#526360] hover:text-[#161C23] transition-colors cursor-pointer"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      {/* ── Bottom Controls & Filters matching reference screenshot ── */}
      <div className="absolute bottom-4 left-3 right-3 z-10 flex flex-col gap-2 pointer-events-none">
        {/* Layer Filters */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-white/95 backdrop-blur-md border border-[#E7DFD5] shadow-lg rounded-2xl p-1.5 w-fit">
          {[
            { id: 'all', label: 'All Tourist Stops', emoji: '🗺️' },
            { id: 'prayer', label: 'Prayer Places 🕌', emoji: '🕌' },
            { id: 'halal', label: 'Halal Dining 🍜', emoji: '🍜' },
            { id: 'route', label: 'Route Line 🛤️', emoji: '🛤️' },
          ].map((layer) => (
            <button
              key={layer.id}
              type="button"
              onClick={() => onSetLayer(layer.id as MapLayer)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeMapLayer === layer.id
                  ? 'bg-[#161C23] text-white shadow-xs'
                  : 'text-[#526360] hover:bg-[#FAF8F5]'
              }`}
            >
              <span>{layer.emoji}</span>
              <span className="hidden sm:inline ml-1">{layer.label}</span>
            </button>
          ))}
        </div>

        {/* Bottom Pill Bar matching screenshot: [推荐] [待计划] [全部地区] [游玩] [购物] */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-white/95 backdrop-blur-md border border-[#E7DFD5] shadow-lg rounded-2xl px-3 py-1.5 w-fit text-xs font-bold text-[#526360] overflow-x-auto">
          <span className="text-[#161C23] font-black flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            推荐
          </span>
          <span>·</span>
          <span>待计划</span>
          <span>·</span>
          <span>收藏</span>
          <span className="text-[#C4BCB3]">|</span>
          <span className="bg-[#FAF8F5] px-2 py-0.5 rounded-md text-[#161C23]">
            {activeDay.city} 全部地区
          </span>
          <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
            游玩 · {stops.filter((s) => s.category === 'ATTRACTION').length}
          </span>
          <span className="text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
            祈祷 · {stops.filter((s) => s.category === 'PRAYER').length}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Main: GoogleMapPane
// ─────────────────────────────────────────────────────
interface GoogleMapPaneProps {
  days: ItineraryDay[];
  activeDayId: string;
  stops: ItineraryStop[];
  selectedStopId: string | null;
  hoveredStopId: string | null;
  activeMapLayer: MapLayer;
  mapViewport: { center: { lat: number; lng: number }; zoom: number };
  onSelectStop: (id: string | null) => void;
  onHoverStop: (id: string | null) => void;
  onSetLayer: (layer: MapLayer) => void;
  onSelectDay?: (dayId: string) => void;
}

export const GoogleMapPane: React.FC<GoogleMapPaneProps> = (props) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiKey: string | undefined = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey || apiKey === 'YOUR_KEY_HERE' || apiKey.length < 10) {
    return (
      <div className="flex-shrink-0 h-full" style={{ width: '45%', minWidth: '340px' }}>
        <RichFallbackMap
          days={props.days}
          activeDayId={props.activeDayId}
          stops={props.stops}
          selectedStopId={props.selectedStopId}
          onSelectStop={props.onSelectStop}
        />
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 h-full relative" style={{ width: '45%', minWidth: '340px' }}>
      <APIProvider apiKey={apiKey} libraries={['places', 'marker']}>
        <MapContent {...props} />
      </APIProvider>
    </div>
  );
};
