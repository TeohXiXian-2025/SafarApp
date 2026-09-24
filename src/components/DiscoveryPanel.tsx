import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle,
  Sparkles,
  MapPin,
  Compass,
  Plus,
  Heart,
  Hotel,
  Check,
  Search,
  Bookmark,
  Layers,
  ZoomIn,
  ZoomOut,
  LocateFixed,
  Eye,
  Navigation,
  Video,
  Play,
  Clipboard,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  X,
  FileText,
  Building,
  UploadCloud,
  ExternalLink,
  GripHorizontal,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  APIProvider,
  Map,
  useMap,
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  InfoWindow,
} from '@vis.gl/react-google-maps';
import {
  DAY_COLORS,
  DayStopsPolyline,
  StopMarker,
  StopInfoWindow,
} from './GoogleMapPane';
import { ItineraryDay, ItineraryStop, MapLayer } from '../types/itinerary';
import { SAMPLE_DOCUMENTS } from '../data/documentVaultData';
import { TravelDocument } from '../types';

interface DiscoveryPanelProps {
  days?: ItineraryDay[];
  activeDayId?: string;
  stops?: ItineraryStop[];
  selectedStopId?: string | null;
  hoveredStopId?: string | null;
  activeMapLayer?: MapLayer;
  mapViewport?: { center: { lat: number; lng: number }; zoom: number };
  onSelectStop?: (id: string | null) => void;
  onHoverStop?: (id: string | null) => void;
  onSetLayer?: (layer: MapLayer) => void;
  onSelectDay?: (dayId: string) => void;
  onOpenVault?: () => void;
  onAddStop?: (dayId: string, placeName: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery Card & Attraction Item with Exact Real Google Maps Coordinates
// ─────────────────────────────────────────────────────────────────────────────
export interface DiscoveryCardItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  category: 'Attractions' | 'Halal Dining' | 'Others' | 'Hotels';
  image: string;
  coordinate: { lat: number; lng: number };
  city: 'Kyoto' | 'Tokyo';
  isDraggable?: boolean;
  isExtractedFromVideo?: boolean;
  videoSource?: string;
  isVaultHotel?: boolean;
  groupMatch?: string;
  groupAFeature?: string;
  groupBFeature?: string;
  pricePerNight?: string;
  rating?: string;
  bookingRef?: string;
}

// Kyoto Tourist Attractions (Day 3)
export const KYOTO_TO_PLAN_ITEMS: DiscoveryCardItem[] = [
  {
    id: 'card-kiyomizu-dera',
    title: 'Kiyomizu-dera Temple',
    subtitle: 'Historic temple on Mount Otowa with panoramic veranda views.',
    icon: '⛩️',
    category: 'Attractions',
    image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 34.9949, lng: 135.7850 },
    city: 'Kyoto',
    isDraggable: true,
  },
  {
    id: 'card-fushimi-inari',
    title: 'Fushimi Inari Shrine',
    subtitle: 'Iconic mountain trail of 10,000 crimson torii gates.',
    icon: '⛩️',
    category: 'Attractions',
    image: 'https://images.unsplash.com/photo-1478436127897-769e00d2c715?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 34.9671, lng: 135.7727 },
    city: 'Kyoto',
  },
  {
    id: 'card-ayam-ya',
    title: 'Ayam-Ya Halal Ramen',
    subtitle: '100% Halal certified Tori Paitan rich broth & dedicated musalla.',
    icon: '🍜',
    category: 'Halal Dining',
    image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.0021, lng: 135.7588 },
    city: 'Kyoto',
  },
  {
    id: 'card-arashiyama',
    title: 'Arashiyama Bamboo Grove',
    subtitle: 'Towering emerald bamboo stalks and scenic nature trail.',
    icon: '🎋',
    category: 'Attractions',
    image: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.0165, lng: 135.6713 },
    city: 'Kyoto',
  },
  {
    id: 'card-kyoto-tower',
    title: 'Nidec Kyoto Tower',
    subtitle: 'Panoramic skyline observation deck & mountain views.',
    icon: '🗼',
    category: 'Others',
    image: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 34.9875, lng: 135.7593 },
    city: 'Kyoto',
  },
  {
    id: 'card-kinkakuji',
    title: 'Kinkaku-ji (Golden Pavilion)',
    subtitle: 'Zen Buddhist temple covered in gleaming gold leaf.',
    icon: '🏛️',
    category: 'Attractions',
    image: 'https://images.unsplash.com/photo-1578637387939-43c525550085?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.0394, lng: 135.7292 },
    city: 'Kyoto',
  },
];

export const KYOTO_RECOMMENDED_ITEMS: DiscoveryCardItem[] = [
  {
    id: 'rec-gion',
    title: 'Gion Historic District',
    subtitle: 'Preserved wooden machiya merchant houses & lantern alleys.',
    icon: '🏮',
    category: 'Attractions',
    image: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.0037, lng: 135.7772 },
    city: 'Kyoto',
    isDraggable: true,
  },
  {
    id: 'rec-nishiki',
    title: 'Nishiki Market Corridors',
    subtitle: 'Traditional Kyoto seafood, roasted chestnuts & street snacks.',
    icon: '🍢',
    category: 'Halal Dining',
    image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.0050, lng: 135.7649 },
    city: 'Kyoto',
    isDraggable: true,
  },
  {
    id: 'rec-naritaya',
    title: 'Halal Yakiniku Naritaya',
    subtitle: '100% Halal certified Wagyu beef dining near Gion.',
    icon: '🥩',
    category: 'Halal Dining',
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.0054, lng: 135.7745 },
    city: 'Kyoto',
    isDraggable: true,
  },
  {
    id: 'rec-philosopher',
    title: "Philosopher's Path",
    subtitle: 'Tranquil stone canal walkway under weeping cherry trees.',
    icon: '🌸',
    category: 'Attractions',
    image: 'https://images.unsplash.com/photo-1528164344705-475426879c0d?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.0272, lng: 135.7954 },
    city: 'Kyoto',
    isDraggable: true,
  },
  {
    id: 'rec-toji',
    title: 'Toji Temple & 5-Story Pagoda',
    subtitle: 'Historic wooden pagoda with sacred pond reflection.',
    icon: '🏯',
    category: 'Others',
    image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 34.9811, lng: 135.7476 },
    city: 'Kyoto',
    isDraggable: true,
  },
  {
    id: 'rec-masjid',
    title: 'Kyoto Islamic Cultural Center',
    subtitle: 'Central Kyoto prayer hall with wudu and info desk.',
    icon: '🕌',
    category: 'Others',
    image: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.0210, lng: 135.7710 },
    city: 'Kyoto',
    isDraggable: true,
  },
];

// Tokyo Tourist Attractions (Day 1 & Day 2)
export const TOKYO_TO_PLAN_ITEMS: DiscoveryCardItem[] = [
  {
    id: 'card-tokyo-skytree',
    title: 'Tokyo Skytree',
    subtitle: 'World\'s tallest tower with 360-degree observation deck views.',
    icon: '🗼',
    category: 'Attractions',
    image: 'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.7101, lng: 139.8107 },
    city: 'Tokyo',
    isDraggable: true,
  },
  {
    id: 'card-teamlab-planets',
    title: 'teamLab Planets TOKYO',
    subtitle: 'Sensory body-immersive digital art museum in Toyosu.',
    icon: '✨',
    category: 'Attractions',
    image: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.6492, lng: 139.7898 },
    city: 'Tokyo',
    isDraggable: true,
  },
  {
    id: 'card-tsukiji-market',
    title: 'Tsukiji Outer Market',
    subtitle: 'Sprawling wholesale market with fresh seafood & tuna auction.',
    icon: '🍣',
    category: 'Halal Dining',
    image: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.6655, lng: 139.7708 },
    city: 'Tokyo',
    isDraggable: true,
  },
  {
    id: 'card-tokyo-disney',
    title: 'Tokyo Disney Resort',
    subtitle: 'World-renowned theme park with dedicated Guest Musalla.',
    icon: '🏰',
    category: 'Attractions',
    image: 'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.6329, lng: 139.8804 },
    city: 'Tokyo',
    isDraggable: true,
  },
];

export const TOKYO_RECOMMENDED_ITEMS: DiscoveryCardItem[] = [
  {
    id: 'rec-sensoji',
    title: 'Sensō-ji Temple',
    subtitle: 'Tokyo\'s oldest Buddhist temple honoring Kannon in historic Asakusa.',
    icon: '⛩️',
    category: 'Attractions',
    image: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.7148, lng: 139.7967 },
    city: 'Tokyo',
    isDraggable: true,
  },
  {
    id: 'rec-meiji-jingu',
    title: 'Meiji Jingu Gyoen',
    subtitle: 'Tranquil shrine grounds featuring iris garden and lush cedar forest.',
    icon: '🌲',
    category: 'Attractions',
    image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.6764, lng: 139.6993 },
    city: 'Tokyo',
    isDraggable: true,
  },
  {
    id: 'rec-shibuya-crossing',
    title: 'Shibuya Crossing & Tsutaya',
    subtitle: 'World\'s busiest pedestrian intersection with bird\'s eye view.',
    icon: '🚦',
    category: 'Attractions',
    image: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.6595, lng: 139.7006 },
    city: 'Tokyo',
    isDraggable: true,
  },
  {
    id: 'rec-tokyo-camii',
    title: 'Tokyo Camii Ottoman Mosque',
    subtitle: 'Largest Ottoman-style mosque in Japan with Turkish cultural center.',
    icon: '🕌',
    category: 'Others',
    image: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.6682, lng: 139.6767 },
    city: 'Tokyo',
    isDraggable: true,
  },
];

export const SAVED_ITEMS: DiscoveryCardItem[] = [
  {
    id: 'saved-masjid',
    title: 'Kyoto Islamic Cultural Center',
    subtitle: 'Central Kyoto Masjid with full wudu facilities.',
    icon: '🕌',
    category: 'Others',
    image: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.0210, lng: 135.7710 },
    city: 'Kyoto',
  },
];

export const GROUP_PREFERENCE_HOTELS: DiscoveryCardItem[] = [
  {
    id: 'hotel-mimaru-kyoto',
    title: 'MIMARU Kyoto Station Suites',
    subtitle: 'Connecting family suites with Halal kitchenware, Tatami area & Qibla direction.',
    icon: '🏨',
    category: 'Hotels',
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 34.9860, lng: 135.7590 },
    city: 'Kyoto',
    isDraggable: true,
    groupMatch: '98% Group Sync Match',
    groupAFeature: 'Dedicated prayer mats, Qibla compass & certified Halal kitchenette set',
    groupBFeature: 'Spacious Japanese tatami living area, 2-min walk to Shinkansen',
    pricePerNight: '¥28,000 / night',
    rating: '4.9 ★ (1,240)',
  },
  {
    id: 'hotel-granvia-kyoto-pref',
    title: 'Hotel Granvia Kyoto',
    subtitle: 'Directly inside JR Kyoto Station. Muslim-friendly breakfast & zero transit friction.',
    icon: '🏨',
    category: 'Hotels',
    image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 34.9858, lng: 135.7588 },
    city: 'Kyoto',
    isDraggable: true,
    groupMatch: 'Transit & Comfort Pick',
    groupAFeature: 'Muslim Meal (MOML) certified breakfast & 2-min walk to Kyoto Station musalla',
    groupBFeature: 'Direct train access to Kansai Airport (Haruka) & Tokyo Shinkansen',
    pricePerNight: '¥32,000 / night',
    rating: '4.8 ★ (2,150)',
  },
  {
    id: 'hotel-nazuna-ryokan',
    title: 'Nazuna Kyoto Gion Machiya Ryokan',
    subtitle: 'Authentic Kyoto heritage townhome with private hinoki bath & Halal dining concierge.',
    icon: '🏮',
    category: 'Hotels',
    image: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.0045, lng: 135.7760 },
    city: 'Kyoto',
    isDraggable: true,
    groupMatch: 'Culture & Heritage Pick',
    groupAFeature: 'Halal multi-course Kaiseki dinner on advance request & non-alcoholic mirin used',
    groupBFeature: 'Traditional tatami mats, paper shoji screens & historic Gion lantern stroll',
    pricePerNight: '¥42,000 / night',
    rating: '4.9 ★ (880)',
  },
  {
    id: 'hotel-musalla-inn',
    title: 'Kyoto Hotel Musalla Suites',
    subtitle: 'On-site prayer hall, Qibla indicators, bidet washrooms & Halal buffet breakfast.',
    icon: '🏨',
    category: 'Hotels',
    image: 'https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 34.9850, lng: 135.7580 },
    city: 'Kyoto',
    isDraggable: true,
    groupMatch: '100% Halal Verified',
    groupAFeature: 'Permanent Musalla prayer room with Wudu station & Halal breakfast buffet',
    groupBFeature: 'Close to Karasuma subway line & central Kyoto shopping district',
    pricePerNight: '¥22,000 / night',
    rating: '4.8 ★ (730)',
  },
  {
    id: 'hotel-candeo-tokyo',
    title: 'Candeo Hotels Tokyo Ueno Park',
    subtitle: 'Open-air Japanese Sky Spa with Okachimachi Mosque 350m away & pork-free buffet.',
    icon: '🏨',
    category: 'Hotels',
    image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.7180, lng: 139.7780 },
    city: 'Tokyo',
    isDraggable: true,
    groupMatch: 'Tokyo Group Pick',
    groupAFeature: 'Assalaam Mosque 350m walk, Halal food market within 5 mins',
    groupBFeature: 'Rooftop onsen with Tokyo skyline view, 3-min walk to JR Yamanote line',
    pricePerNight: '¥24,000 / night',
    rating: '4.7 ★ (1,540)',
  },
  {
    id: 'hotel-mimaru-shinjuku',
    title: 'MIMARU Tokyo Shinjuku West',
    subtitle: 'Apartment-style hotel with private kitchen for group cooking and Halal utensils.',
    icon: '🏨',
    category: 'Hotels',
    image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 35.6890, lng: 139.6970 },
    city: 'Tokyo',
    isDraggable: true,
    groupMatch: 'Central Tokyo Pick',
    groupAFeature: 'Halal cookware rental & prayer rugs provided upon check-in',
    groupBFeature: 'Immediate access to Shinjuku shopping, gardens & express airport trains',
    pricePerNight: '¥29,000 / night',
    rating: '4.8 ★ (990)',
  },
];

export const HOTEL_ITEMS: DiscoveryCardItem[] = GROUP_PREFERENCE_HOTELS;

// ─────────────────────────────────────────────────────────────────────────────
// Smooth Camera Director (Flies across cities, fits bounds, never fights zoom)
// ─────────────────────────────────────────────────────────────────────────────
function MapCameraControl({
  activeDayId,
  center,
  selectedStop,
  selectedDiscoveryItem,
  fitTrigger,
  displayCoordinates,
}: {
  activeDayId: string;
  center: { lat: number; lng: number };
  selectedStop: ItineraryStop | null;
  selectedDiscoveryItem: DiscoveryCardItem | null;
  fitTrigger: number;
  displayCoordinates: Array<{ lat: number; lng: number }>;
}) {
  const map = useMap();
  const lastDayRef = useRef<string>(activeDayId);

  // Pan & Zoom to selected itinerary stop
  useEffect(() => {
    if (map && selectedStop?.coordinate) {
      map.setCenter(selectedStop.coordinate);
      map.setZoom(15);
    }
  }, [map, selectedStop?.id]);

  // Pan & Zoom to selected discovery attraction point
  useEffect(() => {
    if (map && selectedDiscoveryItem?.coordinate) {
      map.setCenter(selectedDiscoveryItem.coordinate);
      map.setZoom(15);
    }
  }, [map, selectedDiscoveryItem?.id]);

  // When day changes (e.g. Day 1 Tokyo -> Day 3 Kyoto)
  useEffect(() => {
    if (!map) return;
    if (lastDayRef.current !== activeDayId) {
      lastDayRef.current = activeDayId;
      map.setCenter(center);
      map.setZoom(13);
    }
  }, [map, activeDayId, center]);

  // When "Fit All Attractions" button is pressed
  useEffect(() => {
    if (!map || fitTrigger === 0 || !displayCoordinates || displayCoordinates.length === 0) return;
    try {
      const bounds = new google.maps.LatLngBounds();
      displayCoordinates.forEach((c) => bounds.extend(c));
      map.fitBounds(bounds, { top: 90, right: 60, bottom: 130, left: 60 });
    } catch {}
  }, [map, fitTrigger, displayCoordinates]);

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// High-Visibility Tourist Attraction Spot Pin (Sub-pixel needle tip anchor)
// ─────────────────────────────────────────────────────────────────────────────
function DiscoverySpotMarker({
  item,
  isSelected,
  onClick,
}: {
  item: DiscoveryCardItem;
  isSelected: boolean;
  onClick: (item: DiscoveryCardItem) => void;
  key?: React.Key;
}) {
  const markerColor =
    item.category === 'Attractions'
      ? '#D97706' // Warm Amber
      : item.category === 'Halal Dining'
      ? '#059669' // Emerald
      : item.category === 'Hotels'
      ? '#2563EB' // Royal Blue
      : '#7C3AED'; // Purple

  return (
    <AdvancedMarker
      position={item.coordinate}
      onClick={() => onClick(item)}
      zIndex={isSelected ? 350 : 180}
      anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM}
    >
      <div
        className="relative flex flex-col items-center cursor-pointer select-none transition-all duration-200"
        style={{
          transformOrigin: 'bottom center',
          transform: isSelected ? 'scale(1.3)' : 'scale(1)',
        }}
      >
        {/* Floating Landmark Name Pill with Icon (Visible & Bold) */}
        <div
          className={`mb-1 px-2.5 py-0.5 rounded-lg text-[10px] font-black whitespace-nowrap shadow-md border pointer-events-none transition-all flex items-center gap-1 ${
            isSelected
              ? 'bg-[#161C23] text-white border-amber-400 ring-2 ring-amber-400/40 shadow-xl'
              : 'bg-white/95 text-[#161C23] border-[#E7DFD5] hover:border-[#161C23]'
          }`}
          style={{ boxShadow: '0 3px 8px rgba(0,0,0,0.2)' }}
        >
          <span>{item.icon}</span>
          <span>{item.title.split('—')[0].trim()}</span>
        </div>

        {/* Pulsing beacon wave when selected */}
        {isSelected && (
          <div
            className="absolute top-5 w-10 h-10 rounded-full animate-ping opacity-60 pointer-events-none"
            style={{ backgroundColor: markerColor }}
          />
        )}

        {/* Pin Head Bubble */}
        <div
          className="relative w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-xl border-2 border-white transition-transform"
          style={{ backgroundColor: markerColor }}
        >
          <span>{item.icon}</span>
        </div>

        {/* Sharp Needle Tip pointing directly to ground coordinates */}
        <div
          className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] -mt-0.5 shadow-sm"
          style={{ borderTopColor: markerColor }}
        />
        {/* Sub-pixel ground anchor dot */}
        <div className="w-2 h-2 rounded-full bg-[#161C23] border border-white -mt-0.5 shadow-xs" />
      </div>
    </AdvancedMarker>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Info Window for Discovery Attractions
// ─────────────────────────────────────────────────────────────────────────────
function DiscoverySpotInfoWindow({
  item,
  onClose,
  onKeep,
  isKept,
}: {
  item: DiscoveryCardItem;
  onClose: () => void;
  onKeep: (item: DiscoveryCardItem) => void;
  isKept: boolean;
}) {
  return (
    <InfoWindow
      position={item.coordinate}
      onCloseClick={onClose}
      pixelOffset={[0, -42]}
    >
      <div className="max-w-[250px] font-sans p-1">
        {item.image && (
          <div className="w-full h-24 rounded-lg overflow-hidden mb-2 bg-neutral-100 shadow-xs">
            <img
              src={item.image}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-base">{item.icon}</span>
          <span className="text-xs font-black text-[#161C23] truncate">
            {item.title}
          </span>
        </div>
        <p className="text-[11px] text-[#526360] leading-tight mb-2">
          {item.subtitle}
        </p>
        <div className="text-[9px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded w-fit mb-2 font-bold border border-emerald-200">
          📍 {item.coordinate.lat.toFixed(4)}° N, {item.coordinate.lng.toFixed(4)}° E ({item.city})
        </div>
        <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-neutral-200">
          <span className="text-[10px] font-bold text-[#8A9592] uppercase">
            {item.category}
          </span>
          <button
            type="button"
            onClick={() => onKeep(item)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-black cursor-pointer flex items-center gap-1 transition-all ${
              isKept
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-[#161C23] text-white hover:bg-black shadow-xs'
            }`}
          >
            <Bookmark className={`w-2.5 h-2.5 ${isKept ? 'fill-emerald-800' : ''}`} />
            <span>{isKept ? 'Kept ✓' : 'Keep 📌'}</span>
          </button>
        </div>
      </div>
    </InfoWindow>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Floating Zoom & Re-Center Controls
// ─────────────────────────────────────────────────────────────────────────────
function MapZoomAndCenterControls({
  defaultCenter,
  onFitAll,
}: {
  defaultCenter: { lat: number; lng: number };
  onFitAll: () => void;
}) {
  const map = useMap();

  return (
    <div className="flex flex-col gap-1.5 bg-white/95 backdrop-blur-md border border-[#E7DFD5] shadow-lg rounded-xl p-1 pointer-events-auto">
      <button
        type="button"
        onClick={() => {
          if (map) {
            map.setZoom((map.getZoom() || 13) + 1);
          }
        }}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#526360] hover:text-[#161C23] hover:bg-[#FAF8F5] transition-colors cursor-pointer font-bold"
        title="Zoom In (+)"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          if (map) {
            map.setZoom((map.getZoom() || 13) - 1);
          }
        }}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#526360] hover:text-[#161C23] hover:bg-[#FAF8F5] transition-colors cursor-pointer font-bold"
        title="Zoom Out (-)"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      <div className="w-full h-px bg-[#E7DFD5]" />
      <button
        type="button"
        onClick={onFitAll}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#0D6955] hover:bg-emerald-50 transition-colors cursor-pointer"
        title="Fit & Center All Attractions in View"
      >
        <LocateFixed className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main DiscoveryPanel Component
// ─────────────────────────────────────────────────────────────────────────────
export const DiscoveryPanel: React.FC<DiscoveryPanelProps> = ({
  days = [],
  activeDayId = 'day-3',
  stops = [],
  selectedStopId = null,
  onSelectStop,
  onSelectDay,
  onOpenVault,
  onAddStop,
}) => {
  // Header Tabs State with persistence so Recommended tab can be opened and kept
  const [activeTab, setActiveTab] = useState<'Recommended' | 'To Plan' | 'Saved' | 'Hotels'>(() => {
    try {
      const saved = localStorage.getItem('safar_discovery_active_tab');
      if (saved && ['Recommended', 'To Plan', 'Saved', 'Hotels'].includes(saved)) {
        return saved as 'Recommended' | 'To Plan' | 'Saved' | 'Hotels';
      }
    } catch {}
    return 'Recommended';
  });

  const handleSelectTab = (tab: 'Recommended' | 'To Plan' | 'Saved' | 'Hotels') => {
    setActiveTab(tab);
    try {
      localStorage.setItem('safar_discovery_active_tab', tab);
    } catch {}
  };

  // Vault Hotel Document State (Synchronized with DocumentVaultScreen)
  const [vaultHotelDoc, setVaultHotelDoc] = useState<TravelDocument | null>(() => {
    try {
      const isRemoved = localStorage.getItem('safar_vault_hotel_removed');
      if (isRemoved === 'true') return null;
      const saved = localStorage.getItem('safar_vault_hotel_document');
      if (saved) return JSON.parse(saved);
      return SAMPLE_DOCUMENTS.hotels;
    } catch {
      return SAMPLE_DOCUMENTS.hotels;
    }
  });

  // Planned hotel ID
  const [plannedHotelId, setPlannedHotelId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('safar_planned_hotel_id') || 'vault-hotel';
    } catch {
      return 'vault-hotel';
    }
  });

  useEffect(() => {
    const handleVaultSync = (e: any) => {
      if (e?.detail !== undefined) {
        setVaultHotelDoc(e.detail);
      } else {
        try {
          const isRemoved = localStorage.getItem('safar_vault_hotel_removed');
          if (isRemoved === 'true') {
            setVaultHotelDoc(null);
          } else {
            const saved = localStorage.getItem('safar_vault_hotel_document');
            setVaultHotelDoc(saved ? JSON.parse(saved) : SAMPLE_DOCUMENTS.hotels);
          }
        } catch {}
      }
    };

    window.addEventListener('safar_vault_hotel_updated', handleVaultSync);
    window.addEventListener('storage', handleVaultSync);
    return () => {
      window.removeEventListener('safar_vault_hotel_updated', handleVaultSync);
      window.removeEventListener('storage', handleVaultSync);
    };
  }, []);

  const handleUseHotelForPlanning = (hotelId: string, hotelTitle: string) => {
    setPlannedHotelId(hotelId);
    try {
      localStorage.setItem('safar_planned_hotel_id', hotelId);
      localStorage.setItem('safar_planned_hotel_name', hotelTitle);
    } catch {}

    const hotelObj = getTabItems().find((i) => i.id === hotelId);
    if (hotelObj) {
      setSelectedDiscoveryItem(hotelObj);
    }

    if (onAddStop && activeDayId) {
      onAddStop(activeDayId, `🏨 Base: ${hotelTitle}`);
    }

    setToastMessage(`✓ "${hotelTitle}" anchored as Day ${dayNumber} accommodation for planning! 🏨`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleClearVaultHotel = () => {
    setVaultHotelDoc(null);
    try {
      localStorage.removeItem('safar_vault_hotel_document');
      localStorage.setItem('safar_vault_hotel_removed', 'true');
      window.dispatchEvent(new CustomEvent('safar_vault_hotel_updated', { detail: null }));
    } catch {}
    setToastMessage('Hotel booking removed from vault. Showing group preference suggestions.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSimulateSampleUpload = () => {
    const sample = SAMPLE_DOCUMENTS.hotels;
    setVaultHotelDoc(sample);
    try {
      localStorage.setItem('safar_vault_hotel_document', JSON.stringify(sample));
      localStorage.removeItem('safar_vault_hotel_removed');
      window.dispatchEvent(new CustomEvent('safar_vault_hotel_updated', { detail: sample }));
    } catch {}
    setToastMessage('✓ Hotel Granvia Kyoto voucher loaded from vault!');
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Kept items state so recommendations can be kept / saved
  const [keptItemIds, setKeptItemIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('safar_kept_recommendations');
      return saved ? JSON.parse(saved) : ['rec-gion', 'rec-naritaya'];
    } catch {
      return ['rec-gion', 'rec-naritaya'];
    }
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleToggleKeep = (item: DiscoveryCardItem) => {
    const isCurrentlyKept = keptItemIds.includes(item.id);
    const updated = isCurrentlyKept
      ? keptItemIds.filter((id) => id !== item.id)
      : [...keptItemIds, item.id];

    setKeptItemIds(updated);
    try {
      localStorage.setItem('safar_kept_recommendations', JSON.stringify(updated));
    } catch {}

    setToastMessage(
      isCurrentlyKept
        ? `Removed "${item.title}" from Kept places`
        : `Kept "${item.title}" to your Saved list! 📌`
    );
    setTimeout(() => setToastMessage(null), 2500);
  };
  
  // Container ref for measuring panel height
  const containerRef = useRef<HTMLDivElement>(null);

  const MIN_DRAWER_HEIGHT = 68; // collapsed (handle + tabs visible)
  
  const getContainerHeight = () => {
    return containerRef.current?.getBoundingClientRect().height || (typeof window !== 'undefined' ? window.innerHeight - 64 : 720);
  };

  // Draggable Drawer Height State (in pixels)
  const [drawerHeight, setDrawerHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('safar_discovery_drawer_height');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 68 && val <= 1200) return val;
      }
    } catch {}
    return 360; // default initial height ~50%
  });

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartYRef = useRef<number>(0);
  const dragStartHeightRef = useRef<number>(360);
  const hasMovedRef = useRef<boolean>(false);

  // Synchronize isExpanded boolean with drawerHeight
  const isExpanded = drawerHeight > 80;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    hasMovedRef.current = false;
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = drawerHeight;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const deltaY = dragStartYRef.current - e.clientY; // dragging UP increases height
    if (Math.abs(deltaY) > 3) {
      hasMovedRef.current = true;
    }
    const containerH = getContainerHeight();
    const maxDrawerH = Math.max(MIN_DRAWER_HEIGHT, containerH - 48);
    const newH = Math.max(MIN_DRAWER_HEIGHT, Math.min(maxDrawerH, dragStartHeightRef.current + deltaY));
    setDrawerHeight(newH);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}

    const containerH = getContainerHeight();
    const maxDrawerH = Math.max(MIN_DRAWER_HEIGHT, containerH - 48);

    if (hasMovedRef.current) {
      // Smart snapping threshold
      if (drawerHeight < 120) {
        setDrawerHeight(MIN_DRAWER_HEIGHT);
        try { localStorage.setItem('safar_discovery_drawer_height', String(MIN_DRAWER_HEIGHT)); } catch {}
      } else if (drawerHeight > containerH * 0.72) {
        setDrawerHeight(maxDrawerH);
        try { localStorage.setItem('safar_discovery_drawer_height', String(maxDrawerH)); } catch {}
      } else {
        try { localStorage.setItem('safar_discovery_drawer_height', String(Math.round(drawerHeight))); } catch {}
      }
    } else {
      // If clicked without dragging: toggle between collapsed and 50%
      toggleDrawer();
    }
  };

  const toggleDrawer = () => {
    const containerH = getContainerHeight();
    if (drawerHeight <= MIN_DRAWER_HEIGHT + 10) {
      const midH = Math.round(containerH * 0.5);
      setDrawerHeight(midH);
      try { localStorage.setItem('safar_discovery_drawer_height', String(midH)); } catch {}
    } else {
      setDrawerHeight(MIN_DRAWER_HEIGHT);
      try { localStorage.setItem('safar_discovery_drawer_height', String(MIN_DRAWER_HEIGHT)); } catch {}
    }
  };

  const maximizeDrawer = () => {
    const containerH = getContainerHeight();
    const maxH = Math.max(MIN_DRAWER_HEIGHT, containerH - 48);
    setDrawerHeight(maxH);
    try { localStorage.setItem('safar_discovery_drawer_height', String(maxH)); } catch {}
  };

  const collapseDrawer = () => {
    setDrawerHeight(MIN_DRAWER_HEIGHT);
    try { localStorage.setItem('safar_discovery_drawer_height', String(MIN_DRAWER_HEIGHT)); } catch {}
  };

  // Map Provider Mode: 'google' for 100% accurate pinpointing when zooming in/out
  const [mapMode, setMapMode] = useState<'google' | 'osm'>('google');

  // Layer filter on map: 'all' (route + attractions), 'route', 'attractions'
  const [mapDisplayLayer, setMapDisplayLayer] = useState<'all' | 'route' | 'attractions'>('all');

  // Trigger for fitting bounds to all attractions
  const [fitTrigger, setFitTrigger] = useState<number>(1);

  // Selected city filter ('all' / 'Kyoto' / 'Tokyo')
  const activeDay = days.find((d) => d.id === activeDayId) || days[0];
  const defaultCity = activeDay?.city === 'Kyoto' || activeDay?.dayNumber === 3 ? 'Kyoto' : 'Tokyo';
  const [cityFilter, setCityFilter] = useState<'Kyoto' | 'Tokyo'>(defaultCity);

  useEffect(() => {
    if (activeDay?.city) {
      setCityFilter(activeDay.city === 'Kyoto' ? 'Kyoto' : 'Tokyo');
    }
  }, [activeDayId, activeDay?.city]);

  // Google Maps key is injected at build time (see .env / .env.example).
  // Never hard-code a key here: it would be shipped in the public bundle.
  // When absent, the panel falls back to the OpenStreetMap layer below.
  const apiKey: string = ((import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const hasGoogleMapsKey = apiKey.length > 0;

  // Sub-Filters State
  const [activeSubFilter, setActiveSubFilter] = useState<string>('All Areas');

  // Video Link Extraction in Recommended Tab
  const [videoUrl, setVideoUrl] = useState('');
  const [isExtractingVideo, setIsExtractingVideo] = useState(false);
  const [extractedVideoData, setExtractedVideoData] = useState<{
    platform: 'rednote' | 'tiktok' | 'instagram' | 'youtube';
    title: string;
    author: string;
    thumbnail: string;
    halalCertification: string;
    weatherAdvisory: string;
    spots: Array<{
      title: string;
      category: 'Attractions' | 'Halal Dining' | 'Others';
      icon: string;
      halalInfo: string;
      lat: number;
      lng: number;
      image: string;
      description: string;
    }>;
  } | null>(null);
  const [videoAddedSuccess, setVideoAddedSuccess] = useState(false);
  const [isBoxCollapsed, setIsBoxCollapsed] = useState(false);
  const [extraRecommendedItems, setExtraRecommendedItems] = useState<DiscoveryCardItem[]>(() => {
    try {
      const saved = localStorage.getItem('safar_video_extracted_items');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleExtractVideo = (urlToExtract?: string) => {
    const url = (urlToExtract !== undefined ? urlToExtract : videoUrl).trim();
    if (!url) return;

    setIsExtractingVideo(true);
    setExtractedVideoData(null);
    setVideoAddedSuccess(false);

    setTimeout(() => {
      setIsExtractingVideo(false);
      const lower = url.toLowerCase();
      if (lower.includes('xhs') || lower.includes('xiaohongshu') || lower.includes('rednote')) {
        setExtractedVideoData({
          platform: 'rednote',
          title: '小红书京都3日清真深度游: 必吃和牛与古都巡礼',
          author: '@kyoto_halal_wanderer',
          thumbnail: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=400&q=80',
          halalCertification: '100% Halal Verified Kitchens · Dedicated Wudu Spot',
          weatherAdvisory: '☀️ 21°C Mild Autumn · Ideal for walking tour',
          spots: [
            {
              title: 'Ayam-YA Halal Ramen Karasuma',
              category: 'Halal Dining',
              icon: '🍜',
              halalInfo: '100% Halal Certified (NAHA / JHA)',
              lat: 35.0021,
              lng: 135.7588,
              image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&q=80',
              description: 'Rich chicken paitan ramen with dedicated prayer room on 2nd floor.',
            },
            {
              title: 'Halal Wagyu Panga Gion',
              category: 'Halal Dining',
              icon: '🥩',
              halalInfo: 'Certified A5 Halal Japanese Wagyu',
              lat: 35.0035,
              lng: 135.7765,
              image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80',
              description: 'A5 Kuroge Wagyu yakiniku platter with private tatami dining.',
            },
            {
              title: 'Gion Karyo Halal Tea Garden',
              category: 'Attractions',
              icon: '🍵',
              halalInfo: 'Muslim-Friendly / Pork-Free',
              lat: 35.0042,
              lng: 135.7780,
              image: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=400&q=80',
              description: 'Historic tea house stroll with Halal matcha and accessible seating.',
            },
          ],
        });
      } else if (lower.includes('tiktok')) {
        setExtractedVideoData({
          platform: 'tiktok',
          title: 'Viral Kyoto Muslim Food Crawl & Hidden Gems (#KyotoHalal)',
          author: '@halal_travels_jp',
          thumbnail: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=400&q=80',
          halalCertification: 'Certified Halal (NAHA / JHA) · Alcohol-Free',
          weatherAdvisory: '🌤️ 20°C Partly Cloudy · Stroll Recommended',
          spots: [
            {
              title: 'Halal Wagyu Panga Gion',
              category: 'Halal Dining',
              icon: '🥩',
              halalInfo: 'Certified Halal Wagyu (NAHA / JHA)',
              lat: 35.0035,
              lng: 135.7765,
              image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80',
              description: 'Viral TikTok Wagyu yakiniku with dedicated prayer space nearby.',
            },
            {
              title: 'Kyoto Islamic Cultural Center & Musalla',
              category: 'Others',
              icon: '🕌',
              halalInfo: 'Official Islamic Center',
              lat: 35.0310,
              lng: 135.7785,
              image: 'https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?auto=format&fit=crop&w=400&q=80',
              description: 'Community musalla with pristine wudu ablution stations and Friday Jummah.',
            },
            {
              title: '% Arabica Kyoto Higashiyama',
              category: 'Attractions',
              icon: '☕',
              halalInfo: 'Pork-Free & Muslim-Friendly Drinks',
              lat: 34.9984,
              lng: 135.7795,
              image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=400&q=80',
              description: 'Iconic scenic coffee shop overlooking Yasaka Pagoda.',
            },
          ],
        });
      } else {
        setExtractedVideoData({
          platform: 'instagram',
          title: 'Autumn in Kansai: Cafes, Shrines & Halal Dining (IG Reel)',
          author: '@muslimtraveler.reel',
          thumbnail: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&q=80',
          halalCertification: 'Muslim-Friendly & Halal Certified Options',
          weatherAdvisory: '🍂 19°C Peak Autumn Foliage Season',
          spots: [
            {
              title: 'Nishiki Market Halal Skewers',
              category: 'Halal Dining',
              icon: '🍢',
              halalInfo: 'Halal Certified Stall',
              lat: 35.0050,
              lng: 135.7645,
              image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&q=80',
              description: 'Grilled halal beef skewers & roasted green tea in historic market alley.',
            },
            {
              title: 'Matsubara Musalla Prayer Space',
              category: 'Others',
              icon: '🕌',
              halalInfo: 'Dedicated Wudu Facility',
              lat: 34.9970,
              lng: 135.7680,
              image: 'https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?auto=format&fit=crop&w=400&q=80',
              description: 'Quiet indoor prayer room with direction indicators and separate sisters section.',
            },
            {
              title: 'Arashiyama River & Bamboo Walk',
              category: 'Attractions',
              icon: '🎋',
              halalInfo: 'Nature & Accessible Walking Trail',
              lat: 35.0165,
              lng: 135.6713,
              image: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=400&q=80',
              description: 'Picturesque bamboo walkway along the Katsura River with shaded rest benches.',
            },
          ],
        });
      }
    }, 600);
  };

  const handleQuickPasteVideo = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().length > 0) {
          setVideoUrl(text.trim());
          handleExtractVideo(text.trim());
          return;
        }
      }
    } catch {}
    const sample = 'https://xhslink.com/a/kyoto_halal_guide';
    setVideoUrl(sample);
    handleExtractVideo(sample);
  };

  const handleAddAllExtractedToRecommended = () => {
    if (!extractedVideoData) return;
    const isKyoto = cityFilter === 'Kyoto';
    const newItems: DiscoveryCardItem[] = extractedVideoData.spots.map((spot, idx) => ({
      id: `vid-ext-${Date.now()}-${idx}`,
      title: spot.title,
      subtitle: `${spot.description} [${spot.halalInfo}]`,
      icon: spot.icon,
      category: spot.category,
      image: spot.image,
      coordinate: { lat: spot.lat, lng: spot.lng },
      city: isKyoto ? 'Kyoto' : 'Tokyo',
      isDraggable: true,
      isExtractedFromVideo: true,
      videoSource: extractedVideoData.title,
    }));

    setExtraRecommendedItems((prev) => {
      const updated = [...newItems, ...prev];
      try {
        localStorage.setItem('safar_video_extracted_items', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setVideoAddedSuccess(true);
    setToastMessage(`✓ Added ${newItems.length} spots from video to Recommended list! ✨`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Interactive Attraction Map Pins State
  const [internalSelectedStopId, setInternalSelectedStopId] = useState<string | null>(selectedStopId);
  const [internalHoveredStopId, setInternalHoveredStopId] = useState<string | null>(null);

  // Selected Discovery Attraction Card
  const [selectedDiscoveryItem, setSelectedDiscoveryItem] = useState<DiscoveryCardItem | null>(null);

  // Active day and daily color mapping strategy
  const dayNumber = activeDay?.dayNumber || 3;
  const dayColorConfig = DAY_COLORS[dayNumber] || DAY_COLORS[3];
  const dayColor = activeDay?.color || dayColorConfig.main;

  // Stops for current day
  const activeDayStops = stops && stops.length > 0 ? stops : activeDay?.stops || [];

  // Center coordinate on Kyoto or active day center
  const defaultCenter = useMemo(() => {
    if (cityFilter === 'Kyoto') {
      return { lat: 34.9949, lng: 135.7850 }; // Kiyomizu-dera / Central Kyoto
    }
    if (activeDay?.centerCoordinate) {
      return activeDay.centerCoordinate;
    }
    if (activeDayStops.length > 0 && activeDayStops[0]?.coordinate) {
      return activeDayStops[0].coordinate;
    }
    return { lat: 35.6700, lng: 139.8100 }; // Tokyo center
  }, [cityFilter, activeDay?.centerCoordinate, activeDayStops]);

  const handleStopClick = (stopId: string) => {
    setInternalSelectedStopId((prev) => (prev === stopId ? null : stopId));
    setSelectedDiscoveryItem(null);
    if (onSelectStop) {
      onSelectStop(stopId);
    }
  };

  const handleDiscoveryCardClick = (item: DiscoveryCardItem) => {
    setSelectedDiscoveryItem(item);
    setInternalSelectedStopId(null);
  };

  const selectedStopObject = activeDayStops.find((s) => s.id === internalSelectedStopId) || null;

  const tabs: Array<'Recommended' | 'To Plan' | 'Saved' | 'Hotels'> = [
    'Recommended',
    'To Plan',
    'Saved',
    'Hotels',
  ];

  const subFilters = [
    'All Areas',
    'Attractions (9)',
    'Halal Dining (2)',
    'Others (4)',
  ];

  // Pick list based on activeTab and cityFilter
  const getTabItems = () => {
    const isKyoto = cityFilter === 'Kyoto';
    const extraForCity = extraRecommendedItems.filter((i) => i.city === (isKyoto ? 'Kyoto' : 'Tokyo'));
    const recList = isKyoto ? [...extraForCity, ...KYOTO_RECOMMENDED_ITEMS] : [...extraForCity, ...TOKYO_RECOMMENDED_ITEMS];
    const planList = isKyoto ? KYOTO_TO_PLAN_ITEMS : TOKYO_TO_PLAN_ITEMS;

    switch (activeTab) {
      case 'Recommended':
        return recList;
      case 'Saved': {
        const allItems = [
          ...extraRecommendedItems,
          ...KYOTO_RECOMMENDED_ITEMS,
          ...KYOTO_TO_PLAN_ITEMS,
          ...TOKYO_RECOMMENDED_ITEMS,
          ...TOKYO_TO_PLAN_ITEMS,
        ];
        const keptItems = allItems.filter((item) => keptItemIds.includes(item.id));
        const combined = [...SAVED_ITEMS];
        keptItems.forEach((item) => {
          if (!combined.some((c) => c.id === item.id)) {
            combined.push(item);
          }
        });
        return combined;
      }
      case 'Hotels': {
        const groupHotels = GROUP_PREFERENCE_HOTELS.filter((h) => h.city === (isKyoto ? 'Kyoto' : 'Tokyo'));
        if (vaultHotelDoc) {
          const hotelName = vaultHotelDoc.extractedDetails?.hotelName || vaultHotelDoc.fileName.replace(/\.[^/.]+$/, '');
          const brn = vaultHotelDoc.extractedDetails?.bookingReference || 'KYO-99214';
          const nights = vaultHotelDoc.extractedDetails?.nights || 4;
          const checkIn = vaultHotelDoc.extractedDetails?.checkInDate?.split(' ')[0] || '2026-10-21';
          const checkOut = vaultHotelDoc.extractedDetails?.checkOutDate?.split(' ')[0] || '2026-10-25';
          const vaultCard: DiscoveryCardItem = {
            id: 'vault-hotel',
            title: hotelName,
            subtitle: `Confirmed in Document Vault (BRN: ${brn}) · ${nights} Nights (${checkIn} - ${checkOut})`,
            icon: '🏨',
            category: 'Hotels',
            image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=400&q=80',
            coordinate: isKyoto ? { lat: 34.9858, lng: 135.7588 } : { lat: 35.6890, lng: 139.6970 },
            city: isKyoto ? 'Kyoto' : 'Tokyo',
            isDraggable: true,
            isVaultHotel: true,
            bookingRef: brn,
            groupMatch: 'Booked in Document Vault ✓',
            groupAFeature: 'Halal breakfast request on file & non-smoking room confirmed',
            groupBFeature: 'Direct JR station hub access for full group convenience',
            pricePerNight: 'Confirmed Booking',
            rating: '5.0 ★ (Verified)',
          };
          return [vaultCard, ...groupHotels];
        }
        return groupHotels;
      }
      case 'To Plan':
      default:
        return planList;
    }
  };

  // Filter items by sub-filter
  const displayItems = getTabItems().filter((item) => {
    if (activeTab === 'Hotels') return true;
    if (activeSubFilter === 'All Areas') return true;
    if (activeSubFilter.startsWith('Attractions')) return item.category === 'Attractions';
    if (activeSubFilter.startsWith('Halal Dining')) return item.category === 'Halal Dining';
    if (activeSubFilter.startsWith('Others')) return item.category === 'Others';
    return true;
  });

  // Coordinates array for bounding box
  const allDisplayCoordinates = useMemo(() => {
    const coords: Array<{ lat: number; lng: number }> = [];
    displayItems.forEach((item) => coords.push(item.coordinate));
    activeDayStops.forEach((stop) => coords.push(stop.coordinate));
    return coords;
  }, [displayItems, activeDayStops]);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full overflow-hidden bg-[#FAF8F5] border-l border-[#E7DFD5] w-full lg:w-[45%] min-w-[340px] flex-shrink-0"
    >
      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. BACKGROUND MAP CONTAINER: Real Google Live Map API          */}
      {/*    Sub-pixel Accurate GPS Pinpointing that Stays Anchored      */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="relative w-full h-full overflow-hidden bg-slate-100">
        {mapMode === 'google' && hasGoogleMapsKey ? (
          <APIProvider apiKey={apiKey} libraries={['places', 'marker']}>
            <Map
              defaultCenter={defaultCenter}
              defaultZoom={13}
              mapId="safar-trip-planner-map"
              style={{ width: '100%', height: '100%' }}
              gestureHandling="greedy"
              disableDefaultUI={false}
              clickableIcons={false}
              reuseMaps
            >
              {/* Smooth Camera Director: pans only on explicit user click, never fights zoom */}
              <MapCameraControl
                activeDayId={activeDayId}
                center={defaultCenter}
                selectedStop={selectedStopObject}
                selectedDiscoveryItem={selectedDiscoveryItem}
                fitTrigger={fitTrigger}
                displayCoordinates={allDisplayCoordinates}
              />

              {/* Connecting Route Polylines across the active stops */}
              {(mapDisplayLayer === 'all' || mapDisplayLayer === 'route') && (
                <DayStopsPolyline
                  stops={activeDayStops}
                  color={dayColor}
                  isActive={true}
                />
              )}

              {/* Day Route Stop Markers with needle-tip ground anchor */}
              {(mapDisplayLayer === 'all' || mapDisplayLayer === 'route') &&
                activeDayStops.map((stop, i) => (
                  <StopMarker
                    key={stop.id}
                    stop={stop}
                    index={i}
                    dayNumber={dayNumber}
                    isSelected={internalSelectedStopId === stop.id}
                    isHovered={internalHoveredStopId === stop.id}
                    onClick={handleStopClick}
                    onHover={setInternalHoveredStopId}
                  />
                ))}

              {/* Discovery Tourist Attraction Markers with needle-tip anchor */}
              {(mapDisplayLayer === 'all' || mapDisplayLayer === 'attractions') &&
                displayItems.map((item) => (
                  <DiscoverySpotMarker
                    key={item.id}
                    item={item}
                    isSelected={selectedDiscoveryItem?.id === item.id}
                    onClick={handleDiscoveryCardClick}
                  />
                ))}

              {/* Real Google Map InfoWindow on Selected Day Route Stop */}
              {selectedStopObject && (
                <StopInfoWindow
                  stop={selectedStopObject}
                  dayNumber={dayNumber}
                  onClose={() => setInternalSelectedStopId(null)}
                />
              )}

              {/* Real Google Map InfoWindow on Selected Discovery Attraction */}
              {selectedDiscoveryItem && (
                <DiscoverySpotInfoWindow
                  item={selectedDiscoveryItem}
                  onClose={() => setSelectedDiscoveryItem(null)}
                  onKeep={handleToggleKeep}
                  isKept={keptItemIds.includes(selectedDiscoveryItem.id)}
                />
              )}
            </Map>
          </APIProvider>
        ) : (
          <iframe
            className="absolute inset-0 w-full h-full object-cover border-0 z-0"
            src="https://www.openstreetmap.org/export/embed.html?bbox=135.65%2C34.95%2C135.82%2C35.05&amp;layer=mapnik"
            allowFullScreen
            loading="lazy"
            title="Kyoto Map"
          />
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* Layered Floating Top HUD on Map (z-index 10)                 */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none flex-wrap">
          {/* Day & City Quick-Switch Tabs */}
          <div className="pointer-events-auto flex items-center gap-1 bg-white/95 backdrop-blur-md border border-[#E7DFD5] shadow-lg rounded-2xl p-1 text-xs font-bold">
            {days.map((day) => {
              const isDayActive = day.id === activeDayId;
              const isKyoto = day.city === 'Kyoto' || day.dayNumber === 3;
              return (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => {
                    if (onSelectDay) onSelectDay(day.id);
                    setCityFilter(isKyoto ? 'Kyoto' : 'Tokyo');
                    setFitTrigger((prev) => prev + 1);
                  }}
                  className={`px-2.5 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-[11px] ${
                    isDayActive
                      ? 'bg-[#161C23] text-white shadow-xs'
                      : 'text-[#526360] hover:text-[#161C23] hover:bg-[#FAF8F5]'
                  }`}
                  title={`Switch to Day ${day.dayNumber} (${day.city})`}
                >
                  <span>{isKyoto ? '🌸' : '🗼'}</span>
                  <span>Day {day.dayNumber} ({day.city || (isKyoto ? 'Kyoto' : 'Tokyo')})</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Live Map Switcher: Google Map ↔ OSM */}
            <div className="bg-white/95 backdrop-blur-md border border-[#E7DFD5] shadow-lg rounded-2xl p-1 flex items-center gap-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setMapMode('google')}
                className={`px-2.5 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                  mapMode === 'google'
                    ? 'bg-[#161C23] text-white shadow-xs'
                    : 'text-[#526360] hover:text-[#161C23]'
                }`}
                title="Google Live Map (Real GPS Pins that Stay Anchored on Zoom)"
              >
                <span>🗺️</span>
                <span>Google Map</span>
              </button>
              <button
                type="button"
                onClick={() => setMapMode('osm')}
                className={`px-2.5 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                  mapMode === 'osm'
                    ? 'bg-[#161C23] text-white shadow-xs'
                    : 'text-[#526360] hover:text-[#161C23]'
                }`}
                title="OpenStreetMap Fallback"
              >
                <span>🌐</span>
                <span>OSM</span>
              </button>
            </div>

            {/* 19.4°C / Radar pill */}
            <div className="bg-white/95 backdrop-blur-md border border-[#E7DFD5] shadow-lg rounded-2xl px-3 py-1.5 flex items-center gap-2 text-xs font-bold text-[#161C23]">
              <span className="text-sm">🌤️</span>
              <span>19.4°C</span>
              <span className="text-[#C4BCB3]">/</span>
              <span className="text-[#0D6955] flex items-center gap-1 font-extrabold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Radar
              </span>
            </div>
          </div>
        </div>

        {/* Google Maps key missing → panel automatically renders the OSM layer */}
        {mapMode === 'google' && !hasGoogleMapsKey && (
          <div
            className="absolute left-3 z-20 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 shadow-sm max-w-[280px]"
            style={{ top: 64 }}
          >
            <p className="text-[10px] text-amber-700 font-medium flex items-center gap-1">
              <AlertCircle size={11} />
              Google Map needs VITE_GOOGLE_MAPS_API_KEY · showing OSM fallback
            </p>
          </div>
        )}

        {/* Transparent touch/drag overlay when dragging to prevent map stealing pointer */}
        {isDragging && (
          <div className="absolute inset-0 z-30 pointer-events-auto cursor-ns-resize" />
        )}

        {/* Floating Zoom & Layer Controls directly on Right Edge of Map */}
        {mapMode === 'google' && hasGoogleMapsKey && (
          <div
            className="absolute right-3 z-10 flex flex-col items-end gap-2 pointer-events-none"
            style={{
              bottom: `${drawerHeight + 16}px`,
              transition: isDragging ? 'none' : 'bottom 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          >
            {/* Filter: All / Route / Spots */}
            <div className="pointer-events-auto bg-white/95 backdrop-blur-md border border-[#E7DFD5] shadow-lg rounded-xl p-0.5 flex items-center text-[10px] font-black">
              <button
                type="button"
                onClick={() => setMapDisplayLayer('all')}
                className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                  mapDisplayLayer === 'all'
                    ? 'bg-[#161C23] text-white shadow-xs'
                    : 'text-[#526360] hover:text-[#161C23]'
                }`}
                title="Show Route and All Tourist Attractions"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setMapDisplayLayer('route')}
                className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                  mapDisplayLayer === 'route'
                    ? 'bg-[#161C23] text-white shadow-xs'
                    : 'text-[#526360] hover:text-[#161C23]'
                }`}
                title="Show Day Itinerary Route Only"
              >
                Route
              </button>
              <button
                type="button"
                onClick={() => setMapDisplayLayer('attractions')}
                className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                  mapDisplayLayer === 'attractions'
                    ? 'bg-[#161C23] text-white shadow-xs'
                    : 'text-[#526360] hover:text-[#161C23]'
                }`}
                title="Show Tourist Spots Only"
              >
                Spots
              </button>
            </div>

            {/* Zoom In/Out & Re-Center Buttons */}
            <MapZoomAndCenterControls
              defaultCenter={defaultCenter}
              onFitAll={() => setFitTrigger((prev) => prev + 1)}
            />
          </div>
        )}

        {/* Floating Bottom Route Stops Strip */}
        <div
          className={`absolute left-3 right-3 z-10 pointer-events-none transition-all duration-300 ${
            isExpanded ? 'bottom-[calc(50%+12px)]' : 'bottom-22'
          }`}
        >
          <div className="pointer-events-auto bg-white/95 backdrop-blur-md border border-[#E7DFD5] shadow-lg rounded-2xl px-2.5 py-1.5 flex items-center gap-1.5 overflow-x-auto">
            <span
              className="text-[10px] font-black text-white px-2 py-0.5 rounded-full shrink-0 shadow-xs"
              style={{ backgroundColor: dayColor }}
            >
              Day {dayNumber} ({activeDay?.city || 'Kyoto'})
            </span>
            <span className="text-[#C4BCB3] text-xs">|</span>
            {activeDayStops.map((stop, i) => {
              const isSelected = internalSelectedStopId === stop.id;
              const isPrayer = stop.category === 'PRAYER';
              return (
                <button
                  key={stop.id}
                  type="button"
                  onClick={() => handleStopClick(stop.id)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1 ${
                    isSelected
                      ? 'bg-[#161C23] text-white shadow-xs'
                      : 'bg-[#FAF8F5] text-[#526360] hover:bg-white hover:text-[#161C23] border border-[#E7DFD5]'
                  }`}
                >
                  <span>{isPrayer ? '🕌' : `${i + 1}.`}</span>
                  <span className="truncate max-w-[100px]">
                    {stop.title.split('—')[0].trim()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. TABBED DRAWER: Pinned to bottom, smoothly draggable up/down */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div
        className="absolute bottom-0 w-full bg-white rounded-t-3xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.12)] z-20 flex flex-col border-t border-[#E7DFD5] overflow-hidden select-none"
        style={{
          height: `${drawerHeight}px`,
          transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        {/* Drawer Drag Handle Bar (Draggable up and down) */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-full flex flex-col items-center justify-center pt-2 pb-1 cursor-ns-resize hover:bg-neutral-50/90 active:bg-neutral-100 transition-colors group shrink-0 touch-none"
          title="Drag up or down to resize tab panel · Click to toggle"
        >
          {/* Grip pill handle */}
          <div className="flex items-center gap-1">
            <div
              className={`w-14 h-1.5 rounded-full transition-all duration-150 ${
                isDragging
                  ? 'bg-[#0D6955] scale-105'
                  : 'bg-[#D1C9BE] group-hover:bg-[#8A9592]'
              }`}
            />
          </div>
          <span className="text-[9px] font-bold text-[#8A9592] opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 tracking-tight">
            {drawerHeight <= MIN_DRAWER_HEIGHT + 10 ? 'Drag up to expand' : 'Drag up / down to resize'}
          </span>
        </div>

        {/* Persistent Tab Headers (Horizontal Flex, Always Visible) */}
        <div className="flex items-center justify-between border-b border-[#E7DFD5] px-4 pt-1 shrink-0 bg-white">
          <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto py-0.5">
            {tabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    if (drawerHeight <= MIN_DRAWER_HEIGHT + 10) {
                      const containerH = getContainerHeight();
                      const midH = Math.round(containerH * 0.5);
                      setDrawerHeight(midH);
                      try { localStorage.setItem('safar_discovery_drawer_height', String(midH)); } catch {}
                    }
                    handleSelectTab(tab);
                  }}
                  className={`pb-2 text-xs font-bold transition-all relative cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'text-[#0D6955] font-black border-b-2 border-[#0D6955]'
                      : 'text-[#526360] hover:text-[#161C23]'
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Quick Collapse / Expand Action Controls */}
          <div className="flex items-center gap-1 pb-1 shrink-0">
            <button
              type="button"
              onClick={toggleDrawer}
              className="p-1 rounded-lg text-[#8A9592] hover:text-[#161C23] hover:bg-[#FAF8F5] transition-colors cursor-pointer"
              title={isExpanded ? 'Collapse to bar' : 'Expand panel'}
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
            {isExpanded && (
              <button
                type="button"
                onClick={drawerHeight > 550 ? collapseDrawer : maximizeDrawer}
                className="p-1 rounded-lg text-[#8A9592] hover:text-[#161C23] hover:bg-[#FAF8F5] transition-colors cursor-pointer"
                title={drawerHeight > 550 ? 'Restore height' : 'Full height'}
              >
                {drawerHeight > 550 ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* 3. COLLAPSIBLE CONTENT (Filters & Grid)                      */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div
          className={`flex flex-col flex-grow overflow-hidden ${
            drawerHeight > MIN_DRAWER_HEIGHT + 10 ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          style={{
            transition: isDragging ? 'none' : 'opacity 0.2s ease-in-out',
          }}
        >
          {/* Video Extraction Box: ONLY shown in Recommended Tab */}
          {activeTab === 'Recommended' && (
            <div className="mx-3 mt-2 mb-1 p-2.5 bg-gradient-to-br from-[#FAF8F5] via-white to-emerald-50/40 border border-[#E7DFD5] rounded-2xl shadow-xs space-y-2 shrink-0">
              {/* Header with Title & Collapse Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#00685F] text-white flex items-center justify-center shadow-xs">
                    <Video className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-[#161C23] flex items-center gap-1.5">
                      <span>Extract Spots from Video</span>
                      <span className="text-[10px] font-extrabold text-[#00685F] bg-[#EEF4FE] px-1.5 py-0.5 rounded-full">
                        AI Parser
                      </span>
                    </h4>
                    <p className="text-[10px] text-[#6D7A77]">
                      Paste RedNote (小红书), TikTok, or Reel link to extract Halal spots &amp; map pins
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsBoxCollapsed(!isBoxCollapsed)}
                  className="p-1 text-[#6D7A77] hover:text-[#161C23] hover:bg-white rounded-lg transition-colors cursor-pointer"
                  title={isBoxCollapsed ? 'Expand video extractor' : 'Collapse video extractor'}
                >
                  {isBoxCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>

              {!isBoxCollapsed && (
                <>
                  {/* Input Bar */}
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8A9592] pointer-events-none">
                        <LinkIcon className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type="text"
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleExtractVideo();
                        }}
                        placeholder="Paste RedNote (xhslink.com/...), TikTok, or Reel link..."
                        className="w-full h-8.5 pl-8 pr-16 bg-white rounded-xl border border-[#E7DFD5] text-xs font-medium text-[#161C23] placeholder:text-[#8A9592] focus:outline-none focus:ring-2 focus:ring-[#00685F]/30 focus:border-[#00685F] transition-all"
                      />
                      <button
                        type="button"
                        onClick={handleQuickPasteVideo}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-lg bg-[#FAF8F5] hover:bg-[#E7DFD5] text-[#526360] hover:text-[#161C23] text-[10px] font-bold border border-[#E7DFD5] transition-colors cursor-pointer flex items-center gap-1"
                        title="Paste from clipboard"
                      >
                        <Clipboard className="w-2.5 h-2.5 text-[#00685F]" />
                        <span>Paste</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={!videoUrl.trim() || isExtractingVideo}
                      onClick={() => handleExtractVideo()}
                      className="h-8.5 px-3 rounded-xl bg-[#00685F] hover:bg-[#008378] disabled:bg-neutral-300 text-white font-bold text-xs transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer disabled:cursor-not-allowed active:scale-95"
                    >
                      {isExtractingVideo ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Extracting...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Extract</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Quick Sample Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                    <span className="font-bold text-[#8A9592]">Try sample:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const sample = 'https://xhslink.com/a/kyoto_halal_guide';
                        setVideoUrl(sample);
                        handleExtractVideo(sample);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-bold transition-colors cursor-pointer"
                    >
                      📕 RedNote Kyoto
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const sample = 'https://tiktok.com/@halaltraveler/video/kyoto_wagyu';
                        setVideoUrl(sample);
                        handleExtractVideo(sample);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-[#EEF4FE] text-[#00685F] border border-[#00685F]/20 hover:bg-teal-100 font-bold transition-colors cursor-pointer"
                    >
                      🎵 TikTok Wagyu
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const sample = 'https://instagram.com/reel/autumn_kyoto_spots';
                        setVideoUrl(sample);
                        handleExtractVideo(sample);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100 font-bold transition-colors cursor-pointer"
                    >
                      📸 IG Reel
                    </button>
                  </div>

                  {/* Loading Animated State */}
                  {isExtractingVideo && (
                    <div className="p-2.5 bg-white rounded-xl border border-emerald-200 flex items-center justify-center gap-2 text-xs font-bold text-[#00685F] animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00685F]" />
                      <span>Safar AI is scanning video audio transcript, GPS tags &amp; Halal certificates...</span>
                    </div>
                  )}

                  {/* Extracted Video Result Card */}
                  {extractedVideoData && !isExtractingVideo && (
                    <div className="bg-white rounded-xl p-2.5 border border-emerald-300/80 shadow-xs space-y-2 animate-in fade-in">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <img
                            src={extractedVideoData.thumbnail}
                            alt={extractedVideoData.title}
                            className="w-11 h-11 rounded-lg object-cover border border-[#E7DFD5] shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-red-100 text-red-800">
                                {extractedVideoData.platform}
                              </span>
                              <span className="text-[10px] text-[#8A9592] font-semibold">
                                {extractedVideoData.author}
                              </span>
                            </div>
                            <h5 className="text-xs font-black text-[#161C23] truncate mt-0.5">
                              {extractedVideoData.title}
                            </h5>
                            <div className="flex items-center gap-2 text-[10px] text-emerald-800 font-bold mt-0.5">
                              <span>✓ {extractedVideoData.halalCertification}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setExtractedVideoData(null);
                            setVideoUrl('');
                          }}
                          className="text-[#8A9592] hover:text-[#161C23] p-1 rounded-md cursor-pointer"
                          title="Clear extracted video"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Extracted Spots Pills */}
                      <div className="space-y-1">
                        <div className="text-[10px] font-extrabold text-[#526360] uppercase">
                          Extracted Locations ({extractedVideoData.spots.length} spots found):
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                          {extractedVideoData.spots.map((s, idx) => (
                            <div
                              key={idx}
                              className="p-1.5 bg-[#FAF8F5] rounded-lg border border-[#E7DFD5] text-[10px]"
                            >
                              <div className="font-black text-[#161C23] truncate flex items-center gap-1">
                                <span>{s.icon}</span>
                                <span className="truncate">{s.title}</span>
                              </div>
                              <div className="text-emerald-700 font-semibold truncate text-[9px] mt-0.5">
                                {s.halalInfo}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between pt-1 border-t border-[#F3EFEA] flex-wrap gap-1.5">
                        <span className="text-[10px] text-[#6D7A77]">
                          {extractedVideoData.weatherAdvisory}
                        </span>

                        {videoAddedSuccess ? (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                            <span>Added to Recommended ✓</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={handleAddAllExtractedToRecommended}
                            className="px-2.5 py-1 rounded-lg bg-[#00685F] hover:bg-[#008378] text-white text-[10px] font-black transition-colors flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add Spots to Recommended</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Hotel Tab Banner: Either Uploaded Hotel from Vault or Group Preference Suggestions */}
          {activeTab === 'Hotels' && (
            <div className="mx-3 mt-2 mb-1 p-2.5 rounded-2xl border shadow-xs space-y-2 shrink-0 transition-all">
              {vaultHotelDoc ? (
                /* ── CASE 1: USER UPLOADED HOTEL IN DOCUMENT VAULT ── */
                <div className="space-y-2 bg-gradient-to-br from-emerald-50/70 via-white to-[#FAF8F5] p-3 rounded-xl border border-emerald-300/80">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-[#00685F] text-white flex items-center justify-center shrink-0 shadow-xs">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300/60 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                            <span>Document Vault Booking</span>
                          </span>
                          <span className="text-[10px] font-mono font-bold text-[#6D7A77]">
                            BRN: {vaultHotelDoc.extractedDetails?.bookingReference || 'KYO-99214'}
                          </span>
                        </div>
                        <h4 className="text-xs sm:text-sm font-black text-[#161C23] truncate mt-1">
                          {vaultHotelDoc.extractedDetails?.hotelName || 'Hotel Granvia Kyoto (JR Kyoto Station)'}
                        </h4>
                        <p className="text-[10px] text-[#6D7A77] mt-0.5">
                          {vaultHotelDoc.fileName} · {vaultHotelDoc.extractedDetails?.nights || 4} Nights · Check-in {vaultHotelDoc.extractedDetails?.checkInDate?.split(' ')[0]} to {vaultHotelDoc.extractedDetails?.checkOutDate?.split(' ')[0]}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {onOpenVault && (
                        <button
                          type="button"
                          onClick={onOpenVault}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-[#00685F] bg-white hover:bg-emerald-50 border border-[#00685F]/20 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Open Document Vault"
                        >
                          <span>Manage in Vault</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleClearVaultHotel}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Remove hotel from vault to test group preferences fallback"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Planning Anchor Status & Action */}
                  <div className="flex items-center justify-between pt-1 border-t border-emerald-100 flex-wrap gap-2">
                    <div className="text-[10px] text-[#161C23] font-medium flex items-center gap-1">
                      <span className="text-emerald-700 font-bold">✓ Synced for Planning:</span>
                      <span>Used as daily departure &amp; night rest accommodation base</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleUseHotelForPlanning('vault-hotel', vaultHotelDoc.extractedDetails?.hotelName || 'Hotel Granvia Kyoto')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 ${
                        plannedHotelId === 'vault-hotel'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[#00685F] hover:bg-[#008378] text-white'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{plannedHotelId === 'vault-hotel' ? 'Anchored to Itinerary ✓' : 'Use for Planning'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* ── CASE 2: NO HOTEL UPLOADED IN DOCUMENT VAULT ── */
                <div className="space-y-2 bg-gradient-to-br from-amber-50/60 via-white to-[#FAF8F5] p-3 rounded-xl border border-amber-200 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <Building className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                            No Hotel Uploaded
                          </span>
                          <span className="text-[10px] font-bold text-[#00685F]">
                            ★ Group Preference AI Suggestions
                          </span>
                        </div>
                        <p className="text-[11px] text-[#526360] font-medium mt-1">
                          No hotel voucher found in Document Vault. Showing curated accommodations based on group preferences:
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {onOpenVault && (
                        <button
                          type="button"
                          onClick={onOpenVault}
                          className="px-2.5 py-1.5 rounded-xl bg-[#00685F] hover:bg-[#008378] text-white text-[10px] font-bold shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <UploadCloud className="w-3 h-3" />
                          <span>Upload to Vault</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSimulateSampleUpload}
                        className="px-2 py-1.5 rounded-xl bg-white border border-[#E7DFD5] text-[#161C23] hover:bg-[#FAF8F5] text-[10px] font-bold transition-all cursor-pointer"
                        title="Simulate uploading a hotel voucher"
                      >
                        <span>+ Sample Hotel</span>
                      </button>
                    </div>
                  </div>

                  {/* Group Preferences Breakdown Badges */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 border-t border-amber-100/80 text-[10px]">
                    <div className="bg-white/80 p-1.5 rounded-lg border border-emerald-200 flex items-center gap-1.5 text-[#161C23]">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                      <span><strong>Group A:</strong> Strictly Halal meals &amp; Musalla / Wudu space</span>
                    </div>
                    <div className="bg-white/80 p-1.5 rounded-lg border border-purple-200 flex items-center gap-1.5 text-[#161C23]">
                      <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0"></span>
                      <span><strong>Group B:</strong> Japanese Tatami &amp; Station Transit accessibility</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sub-Filters (Below Tabs) */}
          <div className="flex items-center justify-between px-4 py-2.5 overflow-x-auto shrink-0 bg-white border-b border-[#F3EFEA] gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {subFilters.map((filter) => {
                const isFilterActive = activeSubFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveSubFilter(filter)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer shrink-0 ${
                      isFilterActive
                        ? 'bg-[#0D6955] text-white shadow-xs'
                        : 'bg-[#FAF8F5] text-[#526360] hover:bg-[#E7DFD5] hover:text-[#161C23]'
                    }`}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>

            {/* City Selector Chip */}
            <div className="flex items-center gap-1 bg-[#FAF8F5] p-0.5 rounded-xl border border-[#E7DFD5] shrink-0">
              <button
                type="button"
                onClick={() => {
                  setCityFilter('Kyoto');
                  if (onSelectDay) onSelectDay('day-3');
                  setFitTrigger((prev) => prev + 1);
                }}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                  cityFilter === 'Kyoto'
                    ? 'bg-[#0D6955] text-white shadow-xs'
                    : 'text-[#526360] hover:text-[#161C23]'
                }`}
              >
                🌸 Kyoto
              </button>
              <button
                type="button"
                onClick={() => {
                  setCityFilter('Tokyo');
                  if (onSelectDay) onSelectDay('day-1');
                  setFitTrigger((prev) => prev + 1);
                }}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                  cityFilter === 'Tokyo'
                    ? 'bg-[#0D6955] text-white shadow-xs'
                    : 'text-[#526360] hover:text-[#161C23]'
                }`}
              >
                🗼 Tokyo
              </button>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────── */}
          {/* 4. THE GRID CONTENT: Clickable & Draggable Attraction Cards */}
          {/* ─────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 p-3 overflow-y-auto flex-1 bg-white relative">
            {displayItems.map((item) => {
              const isKiyomizu = item.id === 'card-kiyomizu-dera';
              const isKept = keptItemIds.includes(item.id);
              const isSelected = selectedDiscoveryItem?.id === item.id;

              return (
                <div
                  key={item.id}
                  id={item.id}
                  draggable={true}
                  onClick={() => handleDiscoveryCardClick(item)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', item.title);
                    e.dataTransfer.setData(
                      'application/json',
                      JSON.stringify({
                        id: item.id,
                        title: item.title,
                        subtitle: item.subtitle,
                      })
                    );
                    e.dataTransfer.effectAllowed = 'copyMove';
                  }}
                  className={`bg-white border rounded-xl flex flex-col gap-1.5 p-2 cursor-pointer active:cursor-grabbing hover:shadow-md transition-all relative group select-none ${
                    isSelected
                      ? 'border-[#0D6955] ring-2 ring-[#0D6955]/20 bg-emerald-50/20'
                      : 'border-[#E7DFD5] hover:border-[#0D6955]'
                  } ${isKiyomizu && !isSelected ? 'ring-1 ring-[#0D6955]/20' : ''}`}
                  title={`Click to show and fly to on Google Map! (${item.title})`}
                >
                  {/* Top: Thumbnail placeholder rectangle and icon */}
                  <div className="relative w-full h-20 rounded-lg overflow-hidden bg-neutral-200 flex items-center justify-center">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    {/* Category icon */}
                    <div className="absolute top-1.5 left-1.5 w-6 h-6 rounded-md bg-white/95 backdrop-blur-xs flex items-center justify-center text-xs shadow-xs">
                      {item.icon}
                    </div>

                    {/* Drag badge for Kiyomizu-dera card */}
                    {isKiyomizu && (
                      <span className="absolute bottom-1.5 right-1.5 text-[9px] font-black bg-[#0D6955] text-white px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                        <span>Drag to Plan</span>
                      </span>
                    )}

                    {/* From Video badge */}
                    {item.isExtractedFromVideo && (
                      <span className="absolute bottom-1.5 left-1.5 text-[8px] font-black bg-gradient-to-r from-red-600 to-amber-600 text-white px-1.5 py-0.5 rounded shadow-xs flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>From Video</span>
                      </span>
                    )}

                    {/* Vault Booking badge */}
                    {item.isVaultHotel && (
                      <span className="absolute bottom-1.5 left-1.5 text-[8px] font-black bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-1.5 py-0.5 rounded shadow-xs flex items-center gap-0.5">
                        <FileText className="w-2.5 h-2.5" />
                        <span>Vault Booking</span>
                      </span>
                    )}

                    {/* Group Match badge */}
                    {item.groupMatch && !item.isVaultHotel && (
                      <span className="absolute bottom-1.5 left-1.5 text-[8px] font-black bg-gradient-to-r from-amber-600 to-orange-600 text-white px-1.5 py-0.5 rounded shadow-xs flex items-center gap-0.5">
                        <span>★ {item.groupMatch}</span>
                      </span>
                    )}

                    {/* Exact Location Pill on Card */}
                    <span className="absolute top-1.5 right-1.5 text-[8px] font-mono font-bold bg-[#161C23]/80 text-white px-1.5 py-0.5 rounded backdrop-blur-xs">
                      📍 {item.coordinate.lat.toFixed(2)}, {item.coordinate.lng.toFixed(2)}
                    </span>
                  </div>

                  {/* Middle: Bold title */}
                  <div className={`font-bold text-xs line-clamp-1 transition-colors ${
                    isSelected ? 'text-[#0D6955]' : 'text-[#161C23] group-hover:text-[#0D6955]'
                  }`}>
                    {item.title}
                  </div>

                  {/* Subtitle */}
                  <div className="text-[11px] text-[#526360] line-clamp-2 leading-tight">
                    {item.subtitle}
                  </div>

                  {/* Group Preference Features for Hotels */}
                  {item.groupAFeature && (
                    <div className="text-[9px] text-[#0D6955] font-semibold flex items-center gap-1 line-clamp-1 mt-0.5">
                      <span className="text-[8px] px-1 py-0.2 bg-emerald-100 rounded text-emerald-800 font-bold shrink-0">Group A</span>
                      <span className="truncate">{item.groupAFeature}</span>
                    </div>
                  )}
                  {item.groupBFeature && (
                    <div className="text-[9px] text-purple-700 font-semibold flex items-center gap-1 line-clamp-1">
                      <span className="text-[8px] px-1 py-0.2 bg-purple-100 rounded text-purple-800 font-bold shrink-0">Group B</span>
                      <span className="truncate">{item.groupBFeature}</span>
                    </div>
                  )}

                  {/* Bottom Row: Category and Keep / Saved Button or Hotel Planning Action */}
                  {item.category === 'Hotels' ? (
                    <div className="flex items-center justify-between pt-1 mt-auto border-t border-[#F3EFEA] gap-1">
                      <div className="flex flex-col min-w-0">
                        <span className="text-[9px] font-black text-[#161C23] truncate">
                          {item.pricePerNight || 'Hotel Base'}
                        </span>
                        <span className="text-[8px] text-[#8A9592]">{item.rating || 'Verified'}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUseHotelForPlanning(item.id, item.title);
                          }}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                            plannedHotelId === item.id
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-[#00685F] hover:bg-[#008378] text-white shadow-xs'
                          }`}
                          title="Anchor this hotel for trip itinerary planning"
                        >
                          <span>{plannedHotelId === item.id ? 'Planned ✓' : 'Plan Base'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleKeep(item);
                          }}
                          className={`p-1 rounded-lg text-[10px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                            isKept
                              ? 'bg-emerald-50 text-[#0D6955] border border-emerald-300'
                              : 'bg-[#FAF8F5] text-[#526360] hover:bg-[#E7DFD5] border border-[#E7DFD5]'
                          }`}
                          title={isKept ? 'Place is kept in Saved (click to remove)' : 'Keep this place in Saved'}
                        >
                          <Bookmark className={`w-2.5 h-2.5 ${isKept ? 'fill-[#0D6955] text-[#0D6955]' : ''}`} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pt-1 mt-auto border-t border-[#F3EFEA]">
                      <span className="text-[9px] font-bold text-[#8A9592] uppercase">
                        {item.category}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleKeep(item);
                        }}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                          isKept
                            ? 'bg-emerald-50 text-[#0D6955] border border-emerald-300 shadow-xs'
                            : 'bg-[#FAF8F5] text-[#526360] hover:bg-[#E7DFD5] hover:text-[#161C23] border border-[#E7DFD5]'
                        }`}
                        title={isKept ? 'Place is kept in Saved (click to remove)' : 'Keep this place in Saved'}
                      >
                        <Bookmark className={`w-2.5 h-2.5 ${isKept ? 'fill-[#0D6955] text-[#0D6955]' : ''}`} />
                        <span>{isKept ? 'Kept ✓' : 'Keep'}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {displayItems.length === 0 && (
              <div className="col-span-full py-8 text-center text-xs text-[#8A9592]">
                No places found in this category.
              </div>
            )}
          </div>

          {/* Floating Toast Notification when recommendation is kept */}
          {toastMessage && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 bg-[#161C23] text-white text-xs font-bold px-3.5 py-1.5 rounded-full shadow-2xl flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2">
              <span>{toastMessage}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiscoveryPanel;
