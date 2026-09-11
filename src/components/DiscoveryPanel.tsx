import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Sparkles,
  MapPin,
  Compass,
  Plus,
  Heart,
  Hotel,
  Check,
  Search,
  Utensils,
  Bookmark,
  Layers,
  ZoomIn,
  ZoomOut,
  LocateFixed,
  Eye,
  Navigation,
} from 'lucide-react';
import {
  APIProvider,
  Map,
  useMap,
  AdvancedMarker,
  InfoWindow,
} from '@vis.gl/react-google-maps';
import {
  DAY_COLORS,
  DayStopsPolyline,
  StopMarker,
  StopInfoWindow,
} from './GoogleMapPane';
import { ItineraryDay, ItineraryStop, MapLayer } from '../types/itinerary';

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

export const HOTEL_ITEMS: DiscoveryCardItem[] = [
  {
    id: 'hotel-musalla-inn',
    title: 'Kyoto Hotel Musalla Suites',
    subtitle: 'Prayer rugs, Qibla indicators & Halal breakfast.',
    icon: '🏨',
    category: 'Hotels',
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80',
    coordinate: { lat: 34.9850, lng: 135.7580 },
    city: 'Kyoto',
  },
];

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
  
  // Sliding bottom-sheet drawer state
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

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

  // API Key from .env
  const apiKey: string =
    (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ||
    'AIzaSyB36khc7_OyfIet5Ke7LG0oXLN5JA-0ZUI';

  // Sub-Filters State
  const [activeSubFilter, setActiveSubFilter] = useState<string>('All Areas');

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
    const recList = isKyoto ? KYOTO_RECOMMENDED_ITEMS : TOKYO_RECOMMENDED_ITEMS;
    const planList = isKyoto ? KYOTO_TO_PLAN_ITEMS : TOKYO_TO_PLAN_ITEMS;

    switch (activeTab) {
      case 'Recommended':
        return recList;
      case 'Saved': {
        const allItems = [...KYOTO_RECOMMENDED_ITEMS, ...KYOTO_TO_PLAN_ITEMS, ...TOKYO_RECOMMENDED_ITEMS, ...TOKYO_TO_PLAN_ITEMS];
        const keptItems = allItems.filter((item) => keptItemIds.includes(item.id));
        const combined = [...SAVED_ITEMS];
        keptItems.forEach((item) => {
          if (!combined.some((c) => c.id === item.id)) {
            combined.push(item);
          }
        });
        return combined;
      }
      case 'Hotels':
        return HOTEL_ITEMS;
      case 'To Plan':
      default:
        return planList;
    }
  };

  // Filter items by sub-filter
  const displayItems = getTabItems().filter((item) => {
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
    <div className="relative flex flex-col h-full overflow-hidden bg-[#FAF8F5] border-l border-[#E7DFD5] w-full lg:w-[45%] min-w-[340px] flex-shrink-0">
      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. BACKGROUND MAP CONTAINER: Real Google Live Map API          */}
      {/*    Sub-pixel Accurate GPS Pinpointing that Stays Anchored      */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="relative w-full h-full overflow-hidden bg-slate-100">
        {mapMode === 'google' ? (
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
            allowFullScreen=""
            loading="lazy"
            title="Kyoto Map"
          />
        )}

        {/* ── Split & Sync Branched Route Overlay (SVG, z-10) ── */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          {/* Main Path (blue solid) */}
          <path d="M 50,150 L 150,200" stroke="#3B82F6" strokeWidth="4" fill="none" />
          {/* Split — Halal Track (green dashed) */}
          <path d="M 150,200 L 220,160 L 300,220" stroke="#0D6955" strokeWidth="3" strokeDasharray="6,6" fill="none" />
          {/* Split — Standard Track (gray dashed) */}
          <path d="M 150,200 L 220,280 L 300,220" stroke="#9CA3AF" strokeWidth="3" strokeDasharray="6,6" fill="none" />
          {/* Main Path Continued (blue solid) */}
          <path d="M 300,220 L 400,180" stroke="#3B82F6" strokeWidth="4" fill="none" />
        </svg>

        {/* ── Split Origin Node (z-20) ── */}
        <div className="absolute left-[150px] top-[200px] z-20 -translate-x-1/2 -translate-y-1/2">
          <div className="w-3.5 h-3.5 rounded-full bg-[#3B82F6] border-2 border-white shadow-md" />
        </div>

        {/* ── Halal Restaurant Pin (z-20) ── */}
        <div className="absolute left-[220px] top-[160px] z-20 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5">
          <div className="bg-[#0D6955] text-white rounded-full p-1 shadow-lg">
            <Utensils className="w-3 h-3" />
          </div>
          <span className="text-[9px] font-black text-[#0D6955] bg-white px-1.5 py-0.5 rounded-full shadow border border-[#0D6955]/25">
            Halal
          </span>
        </div>

        {/* ── Standard Restaurant Pin (z-20) ── */}
        <div className="absolute left-[220px] top-[280px] z-20 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="bg-white border-2 border-gray-400 text-gray-700 rounded-full p-1 shadow-lg">
            <Utensils className="w-3 h-3" />
          </div>
        </div>

        {/* ── Group Sync Pin (z-20) ── */}
        <div className="absolute left-[300px] top-[220px] z-20 -translate-x-1/2 -translate-y-1/2">
          <div className="bg-[#0D6955] text-white px-3 py-1 rounded-full shadow-xl font-bold flex items-center gap-1">
            🤝 Group Sync
          </div>
        </div>

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

        {/* Floating Zoom & Layer Controls directly on Right Edge of Map */}
        {mapMode === 'google' && (
          <div
            className={`absolute right-3 z-10 flex flex-col items-end gap-2 transition-all duration-300 pointer-events-none ${
              isExpanded ? 'bottom-[calc(50%+64px)]' : 'bottom-32'
            }`}
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
      {/* 2. TABBED DRAWER: Pinned to bottom, expandable & persistent   */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div
        className={`absolute bottom-0 w-full bg-white rounded-t-3xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.12)] z-20 flex flex-col transition-all duration-300 ease-in-out border-t border-[#E7DFD5] ${
          isExpanded ? 'h-1/2' : 'h-[72px]'
        }`}
      >
        {/* Drawer Drag Handle / Collapse Toggle */}
        <div
          onClick={() => setIsExpanded((prev) => !prev)}
          className="w-full flex flex-col items-center justify-center pt-2 pb-1 cursor-pointer hover:bg-neutral-50/80 transition-colors group select-none shrink-0"
          title={isExpanded ? 'Collapse drawer' : 'Expand drawer'}
        >
          <div className="w-12 h-1 bg-[#D1C9BE] group-hover:bg-[#8A9592] rounded-full transition-colors" />
        </div>

        {/* Persistent Tab Headers (Horizontal Flex, Always Visible) */}
        <div className="flex items-center justify-between border-b border-[#E7DFD5] px-4 pt-1 shrink-0 bg-white">
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  if (!isExpanded) setIsExpanded(true);
                  handleSelectTab(tab);
                }}
                className={`pb-2 text-xs font-bold transition-all relative cursor-pointer ${
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

        {/* ───────────────────────────────────────────────────────────── */}
        {/* 3. COLLAPSIBLE CONTENT (Filters & Grid)                      */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div
          className={`flex flex-col flex-grow overflow-hidden transition-opacity duration-300 ${
            isExpanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
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

                  {/* Bottom Row: Category and Keep / Saved Button */}
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
