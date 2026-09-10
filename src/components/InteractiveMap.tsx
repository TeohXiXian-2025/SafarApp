import React, { useState } from 'react';
import { ActivityBlock, PrayerAnchorBlock, PrayerFacility } from '../types';
import { getPrayerCoordinateSystem, findNearestPrayerFacility } from '../data/prayerFacilitiesData';
import {
  Compass,
  MapPin,
  Route,
  Navigation,
  Layers,
  Maximize2,
  Minimize2,
  CheckCircle2,
  UtensilsCrossed,
  Clock,
  Sparkles,
  Info,
  Building2,
  ShieldCheck,
  Footprints,
  Plus,
  ExternalLink,
  ChevronRight,
  X,
  Star,
} from 'lucide-react';

interface InteractiveMapProps {
  activities: ActivityBlock[];
  prayerAnchors: PrayerAnchorBlock[];
  selectedActivityId?: string | null;
  onSelectActivity: (id: string) => void;
  dayTitle: string;
  currentCity?: string;
  isPrayerMapActive?: boolean;
  onTogglePrayerMap?: (active: boolean) => void;
  selectedPrayerFacilityId?: string | null;
  onSelectPrayerFacility?: (facility: PrayerFacility | null) => void;
  onAddPrayerFacilityToTimeline?: (facility: PrayerFacility) => void;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  activities,
  prayerAnchors,
  selectedActivityId,
  onSelectActivity,
  dayTitle,
  currentCity = 'Kyoto',
  isPrayerMapActive = true,
  onTogglePrayerMap,
  selectedPrayerFacilityId,
  onSelectPrayerFacility,
  onAddPrayerFacilityToTimeline,
}) => {
  const [filter, setFilter] = useState<'all' | 'halal' | 'prayer'>('all');
  const [prayerFilter, setPrayerFilter] = useState<'all' | 'mosque' | 'musalla'>('all');
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeFacilityPopup, setActiveFacilityPopup] = useState<PrayerFacility | null>(null);

  // Retrieve mock coordinate system for current destination
  const cityCoords = getPrayerCoordinateSystem(currentCity);

  // SVG coordinate projections for base stops
  const BASE_PINS = [
    {
      id: 'act-1',
      title: 'Arashiyama Bamboo',
      category: 'sightseeing',
      time: '08:30',
      x: 18,
      y: 35,
      type: 'activity' as const,
      lat: 35.0165,
      lng: 135.6713,
    },
    {
      id: 'act-2',
      title: 'Yojiya Cafe Saga',
      category: 'cafe',
      time: '11:30',
      x: 28,
      y: 42,
      type: 'activity' as const,
      lat: 35.0152,
      lng: 135.6784,
    },
    {
      id: 'prayer-dhuhr-day-2',
      title: 'Dhuhr Prayer Room',
      category: 'prayer',
      time: '12:48',
      x: 58,
      y: 48,
      type: 'prayer' as const,
      qibla: cityCoords.qiblaDirectionText,
      lat: 35.0041,
      lng: 135.7725,
    },
    {
      id: 'act-3',
      title: 'Halal Wagyu Panga',
      category: 'dining',
      time: '01:45',
      x: 68,
      y: 54,
      type: 'activity' as const,
      lat: 35.0037,
      lng: 135.7762,
    },
    {
      id: 'act-4',
      title: 'Kiyomizu-dera',
      category: 'sightseeing',
      time: '03:45',
      x: 82,
      y: 68,
      type: 'activity' as const,
      lat: 34.9949,
      lng: 135.785,
    },
    {
      id: 'prayer-asr-day-2',
      title: 'Asr Prayer Pavilion',
      category: 'prayer',
      time: '04:55',
      x: 80,
      y: 78,
      type: 'prayer' as const,
      qibla: cityCoords.qiblaDirectionText,
      lat: 34.9958,
      lng: 135.7812,
    },
  ];

  // Filter facilities based on prayerFilter
  const filteredFacilities = cityCoords.facilities.filter((f) => {
    if (prayerFilter === 'mosque') return f.type === 'mosque';
    if (prayerFilter === 'musalla') return f.type !== 'mosque';
    return true;
  });

  const filteredPins = BASE_PINS.filter((pin) => {
    if (filter === 'halal') return pin.category === 'dining' || pin.category === 'cafe';
    if (filter === 'prayer') return pin.type === 'prayer';
    return true;
  });

  // Identify currently selected pin for connection line
  const activeSelectedPin = BASE_PINS.find((p) => p.id === selectedActivityId);
  const nearestFacilityToSelected = activeSelectedPin
    ? findNearestPrayerFacility(cityCoords.facilities, activeSelectedPin.lat, activeSelectedPin.lng, activeSelectedPin.title)
    : cityCoords.facilities[1] || null;

  const handleFacilityClick = (facility: PrayerFacility) => {
    setActiveFacilityPopup(facility);
    if (onSelectPrayerFacility) {
      onSelectPrayerFacility(facility);
    }
  };

  return (
    <div
      className={`relative w-full rounded-3xl overflow-hidden border border-[#E7DFD5] bg-[#F5F1EA] shadow-md flex flex-col transition-all duration-300 ${
        isExpanded ? 'fixed inset-4 z-50 h-[calc(100vh-32px)]' : 'h-[440px] lg:h-[calc(100vh-140px)] sticky top-20'
      }`}
    >
      {/* Map Header Overlay */}
      <div className="absolute top-3 left-3 right-3 z-30 flex flex-col gap-2 pointer-events-none">
        <div className="flex items-center justify-between gap-2">
          {/* Destination & Coordinates Badge */}
          <div className="bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-md border border-[#E7DFD5] pointer-events-auto flex items-center gap-2">
            <Route className="w-4 h-4 text-[#00685F]" />
            <div>
              <p className="text-xs font-bold text-[#161C23] leading-none">
                {cityCoords.city} Route &amp; Prayer Explorer
              </p>
              <p className="text-[10px] text-[#6D7A77] font-mono mt-0.5">
                Grid: {cityCoords.centerLat.toFixed(4)}°N, {cityCoords.centerLng.toFixed(4)}°E
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 pointer-events-auto">
            {/* Quick Prayer Map Toggle button in map header */}
            {onTogglePrayerMap && (
              <button
                type="button"
                onClick={() => onTogglePrayerMap(!isPrayerMapActive)}
                className={`px-3 py-1.5 rounded-2xl text-[11px] font-bold shadow-md border flex items-center gap-1.5 transition-all cursor-pointer ${
                  isPrayerMapActive
                    ? 'bg-[#00685F] text-white border-[#00685F] ring-2 ring-[#00685F]/30'
                    : 'bg-white/95 text-[#6D7A77] hover:text-[#161C23] border-[#E7DFD5]'
                }`}
                title="Toggle Mosque & Musalla Map Overlay"
              >
                <Building2 className={`w-3.5 h-3.5 ${isPrayerMapActive ? 'text-[#62FAE3]' : 'text-[#00685F]'}`} />
                <span className="hidden sm:inline">Prayer Map</span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                    isPrayerMapActive ? 'bg-white text-[#00685F]' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {isPrayerMapActive ? 'ON' : 'OFF'}
                </span>
              </button>
            )}

            {/* Qibla Compass Pin */}
            <div
              className="bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl shadow-md border border-[#E7DFD5] text-[11px] font-bold text-[#00685F] flex items-center gap-1.5"
              title={`Qibla direction in ${cityCoords.city}: ${cityCoords.qiblaDirectionText}`}
            >
              <Compass className="w-4 h-4 text-[#D97706] animate-pulse" />
              <span>Qibla: {cityCoords.qiblaDirectionText}</span>
            </div>

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-9 h-9 rounded-2xl bg-white/95 backdrop-blur-md border border-[#E7DFD5] shadow-md flex items-center justify-center text-[#6D7A77] hover:text-[#161C23] transition-colors cursor-pointer"
              title={isExpanded ? 'Minimize map' : 'Expand map'}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Active Prayer Map Notification Bar when ON */}
        {isPrayerMapActive && (
          <div className="bg-[#00685F]/95 backdrop-blur-md text-white px-3.5 py-1.5 rounded-xl shadow-lg border border-[#62FAE3]/30 flex items-center justify-between text-xs pointer-events-auto">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#62FAE3] animate-ping" />
              <span className="font-bold text-[11px]">
                🕌 Prayer Map Active: {cityCoords.facilities.length} Musallas &amp; Mosques Overlaid
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPrayerFilter('all')}
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-all ${
                  prayerFilter === 'all' ? 'bg-white text-[#00685F]' : 'bg-[#004D46] text-white/80 hover:bg-[#005B52]'
                }`}
              >
                All ({cityCoords.facilities.length})
              </button>
              <button
                type="button"
                onClick={() => setPrayerFilter('mosque')}
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-all ${
                  prayerFilter === 'mosque' ? 'bg-white text-[#00685F]' : 'bg-[#004D46] text-white/80 hover:bg-[#005B52]'
                }`}
              >
                Mosques
              </button>
              <button
                type="button"
                onClick={() => setPrayerFilter('musalla')}
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-all ${
                  prayerFilter === 'musalla' ? 'bg-white text-[#00685F]' : 'bg-[#004D46] text-white/80 hover:bg-[#005B52]'
                }`}
              >
                Musallas
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filter Chips Overlay */}
      <div className={`absolute ${isPrayerMapActive ? 'top-28 sm:top-24' : 'top-16'} left-3 z-20 flex items-center gap-1.5 pointer-events-auto transition-all`}>
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all shadow-xs ${
            filter === 'all'
              ? 'bg-[#00685F] text-white'
              : 'bg-white/90 text-[#6D7A77] hover:bg-white border border-[#E7DFD5]'
          }`}
        >
          All Markers
        </button>
        <button
          onClick={() => setFilter('halal')}
          className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all shadow-xs flex items-center gap-1 ${
            filter === 'halal'
              ? 'bg-[#00685F] text-white'
              : 'bg-white/90 text-[#6D7A77] hover:bg-white border border-[#E7DFD5]'
          }`}
        >
          <UtensilsCrossed className="w-3 h-3" />
          <span>Halal Dining</span>
        </button>
        <button
          onClick={() => setFilter('prayer')}
          className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all shadow-xs flex items-center gap-1 ${
            filter === 'prayer'
              ? 'bg-[#00685F] text-white'
              : 'bg-white/90 text-[#6D7A77] hover:bg-white border border-[#E7DFD5]'
          }`}
        >
          <Clock className="w-3 h-3" />
          <span>Itinerary Anchors</span>
        </button>
      </div>

      {/* Interactive Canvas / Visual SVG Map of Destination */}
      <div className="relative flex-1 w-full h-full bg-[#EDE7DE] overflow-hidden select-none">
        {/* Stylized Japanese / Destination Topo Grid Lines */}
        <svg
          className="absolute inset-0 w-full h-full object-cover"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00685F" />
              <stop offset="50%" stopColor="#2DD4BF" />
              <stop offset="100%" stopColor="#008378" />
            </linearGradient>
            <linearGradient id="walkingCorridorGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#D97706" />
              <stop offset="100%" stopColor="#008378" />
            </linearGradient>
            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#DFD7CB" strokeWidth="0.5" />
            </pattern>
            {/* Mosque walking radius glow pattern */}
            <radialGradient id="prayerRadiusGradient">
              <stop offset="0%" stopColor="#00685F" stopOpacity="0.25" />
              <stop offset="80%" stopColor="#00685F" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#00685F" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Soft Grid Background */}
          <rect width="100" height="100" fill="url(#grid)" />

          {/* Stylized River / Water Flow Curve */}
          <path
            d="M 52 0 Q 55 30 62 60 T 66 100"
            fill="none"
            stroke="#CFE2FE"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M 52 0 Q 55 30 62 60 T 66 100"
            fill="none"
            stroke="#93C5FD"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Natural Landmarks Silhouettes */}
          <path d="M 0 0 L 25 0 L 20 20 L 5 25 Z" fill="#E0D7C6" opacity="0.6" />
          <path d="M 85 40 L 100 35 L 100 80 L 88 75 Z" fill="#E0D7C6" opacity="0.6" />

          {/* Route Connection Path */}
          <path
            d="M 18 35 L 28 42 L 58 48 L 68 54 L 82 68 L 80 78"
            fill="none"
            stroke="url(#routeGradient)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="2 1"
          />

          {/* Prayer Walking Radius Overlays (When Prayer Map is Active) */}
          {isPrayerMapActive &&
            filteredFacilities.map((fac) => (
              <g key={`radius-${fac.id}`}>
                {/* 5-minute walk buffer circle (400m perimeter) */}
                <circle
                  cx={fac.mapX}
                  cy={fac.mapY}
                  r="7.5"
                  fill="url(#prayerRadiusGradient)"
                  stroke="#00685F"
                  strokeWidth="0.5"
                  strokeDasharray="1 1"
                  className="animate-pulse"
                />
              </g>
            ))}

          {/* Walking Corridor Vector Line from Selected Activity to Nearest Musalla */}
          {isPrayerMapActive && activeSelectedPin && nearestFacilityToSelected && (
            <g>
              <line
                x1={activeSelectedPin.x}
                y1={activeSelectedPin.y}
                x2={nearestFacilityToSelected.mapX}
                y2={nearestFacilityToSelected.mapY}
                stroke="#D97706"
                strokeWidth="1.5"
                strokeDasharray="1.5 1.5"
                className="animate-pulse"
              />
            </g>
          )}
        </svg>

        {/* Regular Itinerary Pins */}
        {filteredPins.map((pin) => {
          const isSelected = selectedActivityId === pin.id;
          const isPrayer = pin.type === 'prayer';

          return (
            <div
              key={pin.id}
              onClick={() => onSelectActivity(pin.id)}
              style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer group transition-transform hover:scale-110"
            >
              {/* Pulse ring for active or prayer anchor */}
              {isPrayer ? (
                <div className="absolute -inset-2 rounded-full bg-[#00685F]/20 animate-ping"></div>
              ) : (
                isSelected && <div className="absolute -inset-2 rounded-full bg-[#D97706]/30 animate-pulse"></div>
              )}

              {/* Pin Icon Badge */}
              <div
                className={`px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1 text-[11px] font-extrabold border-2 transition-all ${
                  isPrayer
                    ? 'bg-[#008378] text-white border-white ring-2 ring-[#00685F]/30'
                    : isSelected
                    ? 'bg-[#161C23] text-white border-[#00685F] ring-2 ring-[#00685F]/40'
                    : 'bg-white text-[#161C23] border-[#00685F]'
                }`}
              >
                {isPrayer ? (
                  <Clock className="w-3 h-3 text-[#62FAE3]" />
                ) : pin.category === 'dining' ? (
                  <UtensilsCrossed className="w-3 h-3 text-[#00685F]" />
                ) : (
                  <MapPin className="w-3 h-3 text-[#00685F]" />
                )}
                <span className="truncate max-w-[80px] md:max-w-[110px]">{pin.title}</span>
              </div>

              {/* Mini Tooltip on Hover */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 bg-[#161C23] text-white text-[10px] rounded-lg shadow-xl whitespace-nowrap pointer-events-none z-30 font-semibold">
                <span>
                  {pin.time} · {pin.title}
                </span>
                {pin.qibla && <span className="text-[#62FAE3] ml-1">({pin.qibla})</span>}
              </div>
            </div>
          );
        })}

        {/* ==================================================================== */}
        {/* PRAYER MAP OVERLAY PINS (Mosques and Musallas on mock coordinate grid) */}
        {/* ==================================================================== */}
        {isPrayerMapActive &&
          filteredFacilities.map((fac) => {
            const isSelectedFacility = selectedPrayerFacilityId === fac.id || activeFacilityPopup?.id === fac.id;
            const isMosque = fac.type === 'mosque';

            return (
              <div
                key={`fac-${fac.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleFacilityClick(fac);
                }}
                style={{ left: `${fac.mapX}%`, top: `${fac.mapY}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-30 cursor-pointer group transition-transform hover:scale-115"
              >
                {/* Glow ring */}
                <div
                  className={`absolute -inset-2.5 rounded-full transition-all ${
                    isSelectedFacility
                      ? 'bg-[#008378]/40 animate-ping'
                      : isMosque
                      ? 'bg-[#00685F]/25 animate-pulse'
                      : 'bg-[#D97706]/20'
                  }`}
                />

                {/* Mosque/Musalla Marker Chip */}
                <div
                  className={`px-2.5 py-1.5 rounded-full shadow-xl flex items-center gap-1.5 text-[11px] font-bold border-2 transition-all ${
                    isSelectedFacility
                      ? 'bg-[#004D46] text-white border-[#62FAE3] ring-4 ring-[#62FAE3]/30 scale-105'
                      : isMosque
                      ? 'bg-[#00685F] text-white border-white ring-2 ring-[#00685F]/40'
                      : 'bg-[#FAF8F5] text-[#00685F] border-[#00685F] ring-2 ring-[#D97706]/30'
                  }`}
                >
                  <span className="text-xs">
                    {isMosque ? '🕌' : '🕋'}
                  </span>
                  <span className="font-extrabold truncate max-w-[85px] md:max-w-[120px]">
                    {fac.name.replace('(Masjid Kyoto)', '').replace('Community', '')}
                  </span>
                  <span
                    className={`text-[9px] px-1 py-0.2 rounded-md font-mono ${
                      isSelectedFacility
                        ? 'bg-[#62FAE3] text-[#004D46]'
                        : isMosque
                        ? 'bg-white/20 text-white'
                        : 'bg-[#00685F]/10 text-[#00685F]'
                    }`}
                  >
                    {fac.walkMinutes}m
                  </span>
                </div>

                {/* Micro badge indicator */}
                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[8px] font-bold border border-white shadow-xs">
                  ✓
                </div>

                {/* Tooltip on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-[#004D46] text-white text-[11px] rounded-xl shadow-2xl whitespace-nowrap pointer-events-none z-40 font-semibold border border-[#62FAE3]/40">
                  <div className="flex items-center gap-1.5">
                    <span>{isMosque ? '🕌 Grand Mosque' : '🕋 Musalla / Prayer Space'}</span>
                    <span className="text-[#62FAE3]">· {fac.walkMinutes} min walk ({fac.distance})</span>
                  </div>
                  <div className="text-[10px] text-white/80 font-mono mt-0.5">
                    Coord: {fac.lat.toFixed(4)}°N, {fac.lng.toFixed(4)}°E
                  </div>
                </div>
              </div>
            );
          })}

        {/* ==================================================================== */}
        {/* INTERACTIVE POPUP / DRAWER FOR SELECTED PRAYER FACILITY */}
        {/* ==================================================================== */}
        {activeFacilityPopup && (
          <div className="absolute bottom-4 left-3 right-3 z-40 bg-white/98 backdrop-blur-md rounded-2xl p-4 shadow-2xl border-2 border-[#00685F]/30 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center text-xl shrink-0 shadow-xs border border-[#00685F]/20">
                  {activeFacilityPopup.type === 'mosque' ? '🕌' : '🕋'}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="px-2 py-0.5 rounded-md bg-[#00685F] text-white text-[10px] font-bold uppercase tracking-wider">
                      {activeFacilityPopup.type === 'mosque' ? 'Grand Mosque' : 'Verified Musalla'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-[#904D00] border border-amber-200 text-[10px] font-semibold flex items-center gap-1">
                      <Footprints className="w-3 h-3 text-[#D97706]" />
                      <span>{activeFacilityPopup.walkMinutes} min walk ({activeFacilityPopup.distance})</span>
                    </span>
                    {activeFacilityPopup.hasJummah && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                        Jummah Held
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-[#161C23] leading-snug">
                    {activeFacilityPopup.name}
                  </h4>
                  <p className="text-[11px] text-[#6D7A77] mt-0.5">
                    {activeFacilityPopup.address}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveFacilityPopup(null)}
                className="text-[#6D7A77] hover:text-[#161C23] p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                title="Close popup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mock coordinate readout & facility checklist */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] py-2 border-y border-[#E7DFD5]/60 bg-[#FAF8F5] rounded-xl px-2.5">
              <div>
                <span className="text-[10px] text-[#6D7A77] block">Mock Coord:</span>
                <span className="font-mono font-bold text-[#00685F]">
                  {activeFacilityPopup.lat.toFixed(4)}°N, {activeFacilityPopup.lng.toFixed(4)}°E
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#6D7A77] block">Ablution / Wudu:</span>
                <span className="font-bold text-[#161C23] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  {activeFacilityPopup.wuduFacilities === 'heated_wudu' ? 'Heated Wudu' : 'Dedicated Wudu'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#6D7A77] block">Sisters Section:</span>
                <span className="font-bold text-[#161C23] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  {activeFacilityPopup.hasSistersSection ? 'Private Floor' : 'Curtained Area'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#6D7A77] block">Qibla Direction:</span>
                <span className="font-bold text-[#D97706] flex items-center gap-1">
                  <Compass className="w-3 h-3 text-[#D97706]" />
                  {activeFacilityPopup.qiblaBearing}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#6D7A77] mt-2 leading-relaxed">
              {activeFacilityPopup.notes}
            </p>

            {/* Action buttons */}
            <div className="mt-3 flex items-center justify-between gap-2 pt-2">
              <span className="text-[10px] text-[#00685F] font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#00685F]" />
                <span>{activeFacilityPopup.verifiedSource}</span>
              </span>

              <div className="flex items-center gap-2">
                {onAddPrayerFacilityToTimeline && (
                  <button
                    type="button"
                    onClick={() => {
                      onAddPrayerFacilityToTimeline(activeFacilityPopup);
                      setActiveFacilityPopup(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add as Prayer Stop in Timeline</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Walking corridor metric legend (Bottom Left) */}
        <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-md p-2.5 rounded-2xl shadow-md border border-[#E7DFD5] text-[11px] space-y-1 pointer-events-auto">
          <div className="flex items-center gap-2 text-[#161C23] font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00685F]"></span>
            <span>{cityCoords.city} Halal &amp; Prayer Corridor</span>
          </div>
          <p className="text-[10px] text-[#6D7A77]">
            {isPrayerMapActive
              ? `Mock Coordinate System Active · All meals ≤ ${nearestFacilityToSelected?.walkMinutes || 6} min from musalla`
              : 'Turn on "Prayer Map" to view nearby Musallas & Mosques'}
          </p>
        </div>

        {/* Live Traffic / Coordinate Status Badge (Bottom Right) */}
        <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl shadow-md border border-[#E7DFD5] text-[10px] font-bold text-[#00685F] flex items-center gap-1.5 pointer-events-auto">
          <span className="w-2 h-2 rounded-full bg-[#00685F] animate-ping"></span>
          <span>
            {isPrayerMapActive
              ? `Coordinates: ${cityCoords.centerLat.toFixed(2)}°N, ${cityCoords.centerLng.toFixed(2)}°E`
              : 'Live Walk Navigation Ready'}
          </span>
        </div>
      </div>
    </div>
  );
};

