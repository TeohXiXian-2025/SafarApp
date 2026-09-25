// The selected day's stops as numbered pins joined in visiting order.
import { AdvancedMarker, APIProvider, Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEffect } from 'react';
import type { GeoPoint } from '../../domain';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

export interface MapStop {
  id: string;
  label: string; // pin text: "1", "2", or an emoji for bookings
  title: string;
  location: GeoPoint;
  booking?: boolean;
}

export function DayMap({ stops, onSelect }: { stops: MapStop[]; onSelect?: (id: string) => void }) {
  if (!MAPS_KEY) return <p className="text-sm text-[#B3261E] p-4">Google Maps key missing (VITE_GOOGLE_MAPS_API_KEY).</p>;
  if (!stops.length) {
    return <div className="h-full min-h-48 flex items-center justify-center text-sm text-[#6D7A77] p-4 text-center">Stops you add to this day show up here.</div>;
  }
  return (
    <APIProvider apiKey={MAPS_KEY}>
      <Map mapId={MAP_ID} defaultCenter={stops[0].location} defaultZoom={13} gestureHandling="cooperative" disableDefaultUI zoomControl className="w-full h-full min-h-64">
        {stops.map((s) => (
          <AdvancedMarker key={s.id} position={s.location} title={s.title} onClick={() => onSelect?.(s.id)}>
            <span
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white shadow-md border-2 border-white ${s.booking ? 'bg-[#6D7A77]' : 'bg-[#00685F]'}`}
            >
              {s.label}
            </span>
          </AdvancedMarker>
        ))}
        <RouteLine points={stops.map((s) => s.location)} />
      </Map>
    </APIProvider>
  );
}

/** Draws the route and keeps every stop in view. */
function RouteLine({ points }: { points: GeoPoint[] }) {
  const map = useMap();
  const maps = useMapsLibrary('maps');
  const core = useMapsLibrary('core');
  const key = points.map((p) => `${p.lat},${p.lng}`).join('|');

  useEffect(() => {
    if (!map || !maps || !core) return;
    const line = points.length > 1 ? new maps.Polyline({ path: points, geodesic: true, strokeColor: '#00685F', strokeOpacity: 0.8, strokeWeight: 4, map }) : null;
    if (points.length > 1) {
      const bounds = new core.LatLngBounds();
      points.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 48);
    } else {
      map.setCenter(points[0]);
      map.setZoom(15);
    }
    return () => line?.setMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the points
  }, [map, maps, core, key]);
  return null;
}
