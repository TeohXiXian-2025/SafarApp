// ============================================================
// Safar OS — Halal Radar Screen
// Full-screen map view with bottom-sheet restaurant recommendations
// ============================================================

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  InfoWindow,
} from '@vis.gl/react-google-maps';
import {
  X,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  UserCheck,
  Leaf,
  Navigation,
  Clock,
  Star,
  MapPin,
  RefreshCw,
  Radar,
  Utensils,
  ExternalLink,
  Footprints,
  SlidersHorizontal,
  AlertCircle,
  CheckCircle2,
  Menu as MenuIcon,
} from 'lucide-react';
import { useHalalRadar, getMealtimeLabel } from '../hooks/useHalalRadar';
import {
  HalalStatus,
  HalalRadarResult,
  HALAL_BADGE_CONFIG,
} from '../types/halalRadar';

// ─── Constants ───────────────────────────────────────────────

const GOOGLE_MAPS_API_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';
const DEFAULT_MAP_ID = 'halal-radar-map';

// ─── Sub-Components ──────────────────────────────────────────

/**
 * Halal Tier Badge — visual chip with icon and label.
 */
const HalalBadge: React.FC<{ status: HalalStatus; size?: 'sm' | 'md' | 'lg' }> = ({
  status,
  size = 'md',
}) => {
  const config = HALAL_BADGE_CONFIG[status];
  const IconComponent =
    status === HalalStatus.CERTIFIED_HALAL
      ? ShieldCheck
      : status === HalalStatus.MUSLIM_OWNED
        ? UserCheck
        : Leaf;

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5 gap-0.5',
    md: 'text-xs px-2.5 py-1 gap-1',
    lg: 'text-sm px-3 py-1.5 gap-1.5',
  };

  const iconSize = { sm: 10, md: 13, lg: 16 };

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full ${sizeClasses[size]}`}
      style={{
        color: config.color,
        backgroundColor: config.bgColor,
        border: `1px solid ${config.borderColor}`,
      }}
    >
      <IconComponent size={iconSize[size]} />
      {config.shortLabel}
    </span>
  );
};

/**
 * Wait Time Indicator with color coding.
 */
const WaitTimeIndicator: React.FC<{ minutes: number }> = ({ minutes }) => {
  const getColor = () => {
    if (minutes <= 5) return { text: '#15803D', bg: 'rgba(21, 128, 61, 0.1)' };
    if (minutes <= 15) return { text: '#B45309', bg: 'rgba(180, 83, 9, 0.1)' };
    return { text: '#DC2626', bg: 'rgba(220, 38, 38, 0.1)' };
  };
  const color = getColor();

  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ color: color.text, backgroundColor: color.bg }}
    >
      <Clock size={11} />
      {minutes === 0 ? 'No Wait' : `~${minutes} min wait`}
    </span>
  );
};

/**
 * Custom map marker for a restaurant.
 */
const RestaurantMarker: React.FC<{
  result: HalalRadarResult;
  isSelected: boolean;
  onClick: () => void;
}> = ({ result, isSelected, onClick }) => {
  const config = HALAL_BADGE_CONFIG[result.restaurant.status];
  const isTop = result.isTopPick;

  return (
    <AdvancedMarker
      position={result.restaurant.coordinates}
      onClick={onClick}
      zIndex={isTop ? 100 : isSelected ? 50 : 10}
      anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
    >
      <div className="relative cursor-pointer" style={{ transform: isTop ? 'scale(1)' : 'scale(0.85)' }}>
        {/* Glow ring for top pick */}
        {isTop && (
          <div
            className="absolute -inset-3 rounded-full animate-ping"
            style={{
              backgroundColor: config.glowColor,
              opacity: 0.4,
              animationDuration: '2s',
            }}
          />
        )}
        {/* Outer ring for selected */}
        {isSelected && !isTop && (
          <div
            className="absolute -inset-1.5 rounded-full"
            style={{
              backgroundColor: config.glowColor,
              opacity: 0.5,
            }}
          />
        )}
        {/* Main marker */}
        <div
          className={`relative flex items-center justify-center rounded-full shadow-lg transition-all duration-300 ${
            isTop
              ? 'w-12 h-12 shadow-xl'
              : isSelected
                ? 'w-10 h-10'
                : 'w-8 h-8'
          }`}
          style={{
            backgroundColor: config.markerColor,
            border: `2.5px solid white`,
            boxShadow: isTop
              ? `0 0 20px ${config.glowColor}, 0 4px 12px rgba(0,0,0,0.3)`
              : isSelected
                ? `0 0 12px ${config.glowColor}`
                : `0 2px 8px rgba(0,0,0,0.25)`,
          }}
        >
          <span className="text-white" style={{ fontSize: isTop ? 20 : isSelected ? 16 : 14 }}>
            🍽
          </span>
        </div>
        {/* Top pick label */}
        {isTop && (
          <div
            className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md"
            style={{
              backgroundColor: config.markerColor,
              color: 'white',
            }}
          >
            ⭐ Top Pick
          </div>
        )}
        {/* Name tooltip on hover/select */}
        {isSelected && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-900/90 text-white shadow-lg backdrop-blur-sm">
            {result.restaurant.name}
          </div>
        )}
      </div>
    </AdvancedMarker>
  );
};

/**
 * User location pulsing blue dot.
 */
const UserLocationMarker: React.FC<{ position: { lat: number; lng: number } }> = ({
  position,
}) => (
  <AdvancedMarker position={position} zIndex={200} anchorPoint={AdvancedMarkerAnchorPoint.CENTER}>
    <div className="relative">
      {/* Pulse ring */}
      <div className="absolute -inset-4 rounded-full bg-blue-500/20 animate-ping" style={{ animationDuration: '2.5s' }} />
      <div className="absolute -inset-2.5 rounded-full bg-blue-500/15" />
      {/* Core dot */}
      <div className="w-4 h-4 rounded-full bg-blue-600 border-[2.5px] border-white shadow-lg shadow-blue-500/50" />
    </div>
  </AdvancedMarker>
);

/**
 * Restaurant card in the bottom sheet list.
 */
const RestaurantCard: React.FC<{
  result: HalalRadarResult;
  isHighlighted: boolean;
  onClick: () => void;
  onViewMenu: () => void;
  onNavigate: () => void;
}> = ({ result, isHighlighted, onClick, onViewMenu, onNavigate }) => {
  const { restaurant, walkingDistance } = result;
  const config = HALAL_BADGE_CONFIG[restaurant.status];

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  return (
    <div
      onClick={onClick}
      className={`relative p-3.5 rounded-2xl cursor-pointer transition-all duration-300 border ${
        isHighlighted
          ? 'border-[1.5px] shadow-lg scale-[1.01]'
          : 'border-gray-200/60 hover:border-gray-300 hover:shadow-md'
      }`}
      style={{
        backgroundColor: isHighlighted ? config.bgColor : 'white',
        borderColor: isHighlighted ? config.borderColor : undefined,
      }}
    >
      <div className="flex gap-3">
        {/* Restaurant Image */}
        <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
          <img
            src={restaurant.imageUrl}
            alt={restaurant.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {result.isTopPick && (
            <div className="absolute top-1 left-1 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-md">
              ⭐ TOP
            </div>
          )}
        </div>

        {/* Restaurant Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1.5">
            <h4 className="font-semibold text-sm text-gray-900 truncate leading-tight">
              {restaurant.name}
            </h4>
            <div className="flex items-center gap-0.5 text-amber-500 flex-shrink-0">
              <Star size={12} fill="currentColor" />
              <span className="text-xs font-semibold text-gray-800">{restaurant.rating}</span>
            </div>
          </div>

          <p className="text-[11px] text-gray-500 mt-0.5">{restaurant.cuisine}</p>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <HalalBadge status={restaurant.status} size="sm" />
            {restaurant.menuVerified && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                <CheckCircle2 size={9} /> Verified Menu
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-600">
            <span className="inline-flex items-center gap-1">
              <Footprints size={11} className="text-gray-400" />
              {formatDistance(walkingDistance.distanceMeters)} · {walkingDistance.durationMinutes} min
            </span>
            <WaitTimeIndicator minutes={restaurant.liveWaitTime} />
          </div>
        </div>
      </div>

      {/* Action Buttons (visible on highlight) */}
      {isHighlighted && (
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t" style={{ borderColor: config.borderColor }}>
          <button
            onClick={(e) => { e.stopPropagation(); onViewMenu(); }}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: config.color, color: 'white' }}
          >
            <MenuIcon size={13} />
            View Menu
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(); }}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl border-2 transition-all duration-200 hover:opacity-80 active:scale-[0.98]"
            style={{ borderColor: config.color, color: config.color }}
          >
            <Navigation size={13} />
            Navigate
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Menu highlights modal.
 */
const MenuModal: React.FC<{
  result: HalalRadarResult;
  onClose: () => void;
}> = ({ result, onClose }) => {
  const { restaurant } = result;
  const config = HALAL_BADGE_CONFIG[restaurant.status];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header image */}
        <div className="relative h-40 overflow-hidden">
          <img src={restaurant.imageUrl} alt={restaurant.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors"
          >
            <X size={16} />
          </button>
          <div className="absolute bottom-3 left-4 right-4">
            <h3 className="text-white font-bold text-lg leading-tight">{restaurant.name}</h3>
            <p className="text-white/80 text-xs mt-0.5">{restaurant.cuisine} · {restaurant.priceRange}</p>
          </div>
        </div>

        {/* Badge + Info */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <HalalBadge status={restaurant.status} size="md" />
            {restaurant.certifyingBody && (
              <span className="text-[11px] text-gray-500">by {restaurant.certifyingBody}</span>
            )}
          </div>

          {restaurant.menuVerified ? (
            <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium mb-4 bg-emerald-50 p-2 rounded-xl">
              <CheckCircle2 size={14} />
              Menu verified for halal compliance — all ingredients checked
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-amber-600 text-xs font-medium mb-4 bg-amber-50 p-2 rounded-xl">
              <AlertCircle size={14} />
              Menu not independently verified — check with staff for ingredients
            </div>
          )}

          {/* Menu Highlights */}
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Menu Highlights</h4>
          <div className="space-y-2">
            {restaurant.menuHighlights.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                  style={{ backgroundColor: config.bgColor }}
                >
                  🍜
                </div>
                <span className="text-sm text-gray-800 font-medium">{item}</span>
              </div>
            ))}
          </div>

          {/* Restaurant Details */}
          <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <MapPin size={12} className="text-gray-400" />
              {restaurant.address}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Clock size={12} className="text-gray-400" />
              {restaurant.openingHours}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main Screen ─────────────────────────────────────────────

interface HalalRadarScreenProps {
  onClose: () => void;
}

export const HalalRadarScreen: React.FC<HalalRadarScreenProps> = ({ onClose }) => {
  const {
    userLocation,
    restaurants,
    topPick,
    isLoading,
    error,
    radiusKm,
    setRadiusKm,
    mealtime,
    refresh,
  } = useHalalRadar({ radiusMeters: 5000 }); // Start with 5km for demo to capture more restaurants

  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);
  const [menuRestaurant, setMenuRestaurant] = useState<HalalRadarResult | null>(null);
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(true);
  const [showRadiusSlider, setShowRadiusSlider] = useState(false);

  const mealtimeInfo = getMealtimeLabel(mealtime);

  // Auto-select top pick
  useEffect(() => {
    if (topPick && !selectedRestaurant) {
      setSelectedRestaurant(topPick.restaurant.id);
    }
  }, [topPick, selectedRestaurant]);

  const selectedResult = useMemo(
    () => restaurants.find((r) => r.restaurant.id === selectedRestaurant) ?? null,
    [restaurants, selectedRestaurant]
  );

  const handleNavigate = useCallback((result: HalalRadarResult) => {
    const { lat, lng } = result.restaurant.coordinates;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`,
      '_blank'
    );
  }, []);

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  // ─── Render ────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-100">
      {/* ── Top Bar ────────────────────────────────────────── */}
      <div className="relative z-20 flex items-center gap-3 px-4 py-3 bg-white/90 backdrop-blur-xl border-b border-gray-200/50 shadow-sm">
        {/* Close */}
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors text-gray-700"
        >
          <X size={18} />
        </button>

        {/* Title */}
        <div className="flex items-center gap-2 flex-1">
          <div className="relative">
            <Radar size={20} className="text-emerald-600" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-tight">Halal Radar</h1>
            <p className="text-[10px] text-gray-500">
              {restaurants.length} nearby · {radiusKm.toFixed(1)}km radius
            </p>
          </div>
        </div>

        {/* Mealtime Pill */}
        <div className="flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-100 px-2.5 py-1.5 rounded-full">
          <span>{mealtimeInfo.emoji}</span>
          <span>{mealtimeInfo.label}</span>
        </div>

        {/* Radius Filter */}
        <button
          onClick={() => setShowRadiusSlider(!showRadiusSlider)}
          className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${
            showRadiusSlider ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          <SlidersHorizontal size={16} />
        </button>

        {/* Refresh */}
        <button
          onClick={refresh}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors text-gray-700"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Radius Slider (collapsible) ───────────────────── */}
      {showRadiusSlider && (
        <div className="relative z-20 px-4 py-3 bg-white/95 backdrop-blur-md border-b border-gray-200/50 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-500 w-10">1km</span>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={radiusKm}
              onChange={(e) => setRadiusKm(parseFloat(e.target.value))}
              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #22C55E 0%, #22C55E ${((radiusKm - 1) / 9) * 100}%, #E5E7EB ${((radiusKm - 1) / 9) * 100}%, #E5E7EB 100%)`,
              }}
            />
            <span className="text-xs font-medium text-gray-500 w-10 text-right">10km</span>
          </div>
          <p className="text-center text-[11px] text-emerald-600 font-semibold mt-1">
            {radiusKm.toFixed(1)} km walking radius
          </p>
        </div>
      )}

      {/* ── Map Area ──────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0">
        {userLocation && GOOGLE_MAPS_API_KEY ? (
          <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
            <Map
              mapId={DEFAULT_MAP_ID}
              defaultCenter={userLocation}
              defaultZoom={14}
              gestureHandling="greedy"
              disableDefaultUI
              className="w-full h-full"
            >
              {/* User location marker */}
              <UserLocationMarker position={userLocation} />

              {/* Restaurant markers */}
              {restaurants.map((result) => (
                <RestaurantMarker
                  key={result.restaurant.id}
                  result={result}
                  isSelected={result.restaurant.id === selectedRestaurant}
                  onClick={() => setSelectedRestaurant(result.restaurant.id)}
                />
              ))}
            </Map>
          </APIProvider>
        ) : (
          /* Fallback SVG map when no API key */
          <div className="w-full h-full bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 relative overflow-hidden">
            {/* Grid pattern */}
            <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#059669" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>

            {/* Radar rings */}
            {userLocation && (
              <div className="absolute inset-0 flex items-center justify-center">
                {[1, 2, 3].map((ring) => (
                  <div
                    key={ring}
                    className="absolute rounded-full border border-emerald-300/30"
                    style={{
                      width: `${ring * 30}%`,
                      height: `${ring * 30}%`,
                      animation: `pulse ${2 + ring * 0.5}s ease-in-out infinite`,
                    }}
                  />
                ))}

                {/* User dot */}
                <div className="relative z-10">
                  <div className="w-5 h-5 rounded-full bg-blue-500 border-[3px] border-white shadow-lg shadow-blue-500/50" />
                  <div className="absolute -inset-3 rounded-full bg-blue-400/20 animate-ping" style={{ animationDuration: '2s' }} />
                </div>

                {/* Restaurant dots */}
                {restaurants.map((result, i) => {
                  // Position restaurants in a circle for fallback view
                  const angle = (i / restaurants.length) * Math.PI * 2 - Math.PI / 2;
                  const radius = 80 + (result.walkingDistance.distanceMeters / (radiusKm * 1000)) * 120;
                  const x = Math.cos(angle) * radius;
                  const y = Math.sin(angle) * radius;
                  const config = HALAL_BADGE_CONFIG[result.restaurant.status];

                  return (
                    <button
                      key={result.restaurant.id}
                      onClick={() => setSelectedRestaurant(result.restaurant.id)}
                      className={`absolute rounded-full transition-all duration-300 flex items-center justify-center cursor-pointer ${
                        result.isTopPick ? 'w-10 h-10 z-20' : 'w-7 h-7 z-10'
                      } ${result.restaurant.id === selectedRestaurant ? 'ring-2 ring-white shadow-xl scale-110' : 'shadow-md hover:scale-110'}`}
                      style={{
                        backgroundColor: config.markerColor,
                        transform: `translate(${x}px, ${y}px) ${result.restaurant.id === selectedRestaurant ? 'scale(1.1)' : ''}`,
                        boxShadow: result.isTopPick ? `0 0 16px ${config.glowColor}` : undefined,
                      }}
                    >
                      <span className="text-white text-xs">🍽</span>
                      {result.isTopPick && (
                        <div className="absolute -top-5 whitespace-nowrap text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white shadow-md">
                          ⭐ TOP
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Legend */}
            <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl p-2.5 shadow-lg border border-gray-200/50">
              <p className="text-[10px] font-semibold text-gray-500 mb-1.5">HALAL TIER</p>
              {Object.values(HalalStatus).map((status) => {
                const cfg = HALAL_BADGE_CONFIG[status];
                return (
                  <div key={status} className="flex items-center gap-1.5 mb-1 last:mb-0">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.markerColor }} />
                    <span className="text-[10px] text-gray-600">{cfg.shortLabel}</span>
                  </div>
                );
              })}
            </div>

            {/* "Map requires API key" notice */}
            {!GOOGLE_MAPS_API_KEY && (
              <div className="absolute top-3 left-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 shadow-sm">
                <p className="text-[10px] text-amber-700 font-medium flex items-center gap-1">
                  <AlertCircle size={11} />
                  Radar view (Google Maps API key not configured)
                </p>
              </div>
            )}
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-30">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <Radar size={36} className="text-emerald-600 animate-spin" style={{ animationDuration: '3s' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                </div>
              </div>
              <p className="text-sm font-semibold text-gray-700">Scanning for halal food...</p>
              <p className="text-xs text-gray-500">Fetching your location</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Sheet ──────────────────────────────────── */}
      <div
        className={`relative z-20 bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-all duration-500 ease-out ${
          bottomSheetExpanded ? 'max-h-[55vh]' : 'max-h-[140px]'
        } flex flex-col`}
      >
        {/* Drag handle */}
        <button
          onClick={() => setBottomSheetExpanded(!bottomSheetExpanded)}
          className="flex items-center justify-center py-2 cursor-pointer"
        >
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </button>

        {/* Top Pick Summary (always visible) */}
        {topPick && (
          <div className="px-4 pb-2 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 shadow-md">
              <img
                src={topPick.restaurant.imageUrl}
                alt={topPick.restaurant.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md">
                  RECOMMENDED
                </span>
                <HalalBadge status={topPick.restaurant.status} size="sm" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 truncate mt-0.5">
                {topPick.restaurant.name}
              </h3>
            </div>
            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
              <span className="text-xs font-semibold text-gray-800">
                {formatDistance(topPick.walkingDistance.distanceMeters)}
              </span>
              <span className="text-[10px] text-gray-500">
                {topPick.walkingDistance.durationMinutes} min walk
              </span>
            </div>
            <button onClick={() => setBottomSheetExpanded(!bottomSheetExpanded)}>
              {bottomSheetExpanded ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronUp size={18} className="text-gray-400" />}
            </button>
          </div>
        )}

        {/* Expanded: Full restaurant list */}
        {bottomSheetExpanded && (
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5">
            {/* Divider */}
            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                {restaurants.length} nearby option{restaurants.length !== 1 ? 's' : ''}
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Restaurant Cards */}
            {restaurants.map((result) => (
              <RestaurantCard
                key={result.restaurant.id}
                result={result}
                isHighlighted={result.restaurant.id === selectedRestaurant}
                onClick={() => setSelectedRestaurant(result.restaurant.id)}
                onViewMenu={() => setMenuRestaurant(result)}
                onNavigate={() => handleNavigate(result)}
              />
            ))}

            {/* Empty state */}
            {restaurants.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                  <Utensils size={28} className="text-gray-300" />
                </div>
                <p className="text-sm font-semibold text-gray-700">No halal options nearby</p>
                <p className="text-xs text-gray-500 mt-1 max-w-[240px]">
                  Try expanding your search radius or check a different area
                </p>
                <button
                  onClick={() => setRadiusKm(Math.min(radiusKm + 2, 10))}
                  className="mt-3 text-xs font-semibold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl hover:bg-emerald-100 transition-colors"
                >
                  Expand to {Math.min(radiusKm + 2, 10).toFixed(0)}km radius
                </button>
              </div>
            )}

            {/* Error notice */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">
                <AlertCircle size={14} />
                <div>
                  <p className="font-semibold">Location: Using demo coordinates</p>
                  <p className="text-amber-600 mt-0.5">{error.message}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Menu Modal ────────────────────────────────────── */}
      {menuRestaurant && (
        <MenuModal
          result={menuRestaurant}
          onClose={() => setMenuRestaurant(null)}
        />
      )}
    </div>
  );
};
