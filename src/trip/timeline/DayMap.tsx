// The selected day on a map: numbered stops joined in visiting order, split
// groups in their own colours with dashed lines out from (and back to) the
// meeting point, a flag with the meeting time, and prayer places on the route. Tapping a
// stop on the timeline focuses it here.
import { AdvancedMarker, APIProvider, Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEffect } from 'react';
import type { GeoPoint } from '../../domain';
import { cx } from '../../ui';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

export interface MapStop {
  id: string;
  kind: 'stop' | 'booking' | 'side' | 'prayer';
  /** Pin text: "1", "2b", "•", "🕌". */
  label: string;
  title: string;
  location: GeoPoint;
  color: string;
  /** Stops where split groups meet back up: the flag text, e.g. "Meet 2:30 PM". */
  meet?: string;
}

export interface MapLink {
  from: GeoPoint;
  to: GeoPoint;
  color: string;
}

export function DayMap({ stops, links = [], selectedId, onSelect }: { stops: MapStop[]; links?: MapLink[]; selectedId?: string | null; onSelect?: (id: string) => void }) {
  if (!MAPS_KEY) return <p className="text-sm text-[#B3261E] p-4">Google Maps key missing (VITE_GOOGLE_MAPS_API_KEY).</p>;
  if (!stops.length) {
    return <div className="h-full min-h-48 flex items-center justify-center text-sm text-[#6D7A77] p-4 text-center">Stops you add to this day show up here.</div>;
  }
  // The group's path through the day, prayer places included (their place follows the stops around them).
  const route = stops.filter((s) => s.kind === 'stop' || s.kind === 'booking' || s.kind === 'prayer');
  return (
    <APIProvider apiKey={MAPS_KEY}>
      <Map mapId={MAP_ID} defaultCenter={stops[0].location} defaultZoom={13} gestureHandling="cooperative" disableDefaultUI zoomControl className="w-full h-full min-h-64">
        {stops.map((s) => {
          const on = s.id === selectedId;
          return (
            <AdvancedMarker key={s.id} position={s.location} title={s.title} zIndex={on ? 1000 : s.kind === 'prayer' ? 1 : 10} onClick={() => onSelect?.(s.id)}>
              <span className="flex flex-col items-center">
                {s.meet && <span className="mb-0.5 whitespace-nowrap rounded-md bg-[#161C23] px-1.5 py-0.5 text-[10px] font-bold text-white shadow">🚩 {s.meet}</span>}
                <span
                  className={cx(
                    'flex items-center justify-center rounded-full font-bold text-white shadow-md border-2 border-white transition-transform',
                    s.kind === 'prayer' ? 'w-6 h-6 text-[11px]' : 'w-7 h-7 text-xs',
                    on && 'scale-125 ring-4 ring-black/20',
                  )}
                  style={{ background: s.color }}
                >
                  {s.label}
                </span>
                {on && <span className="mt-1 max-w-40 truncate rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-[#161C23] shadow">{s.title}</span>}
              </span>
            </AdvancedMarker>
          );
        })}
        <Lines route={route.map((s) => s.location)} links={links} focus={stops.find((s) => s.id === selectedId)?.location} all={stops.map((s) => s.location)} />
      </Map>
    </APIProvider>
  );
}

/** The day's route (solid), split side trips (dashed, in the group's colour), and keeping the right things in view. */
function Lines({ route, links, focus, all }: { route: GeoPoint[]; links: MapLink[]; focus?: GeoPoint; all: GeoPoint[] }) {
  const map = useMap();
  const maps = useMapsLibrary('maps');
  const core = useMapsLibrary('core');
  const key = JSON.stringify([route, links]);
  const allKey = JSON.stringify(all);

  useEffect(() => {
    if (!map || !maps) return;
    const drawn: google.maps.Polyline[] = [];
    if (route.length > 1) drawn.push(new maps.Polyline({ path: route, geodesic: true, strokeColor: '#00685F', strokeOpacity: 0.8, strokeWeight: 4, map }));
    for (const l of links) {
      drawn.push(
        new maps.Polyline({
          path: [l.from, l.to],
          geodesic: true,
          strokeOpacity: 0,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: l.color, scale: 3 }, offset: '0', repeat: '12px' }],
          map,
        }),
      );
    }
    return () => drawn.forEach((p) => p.setMap(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures route + links
  }, [map, maps, key]);

  // Fit everything when the day changes.
  useEffect(() => {
    if (!map || !core || !all.length) return;
    if (all.length === 1) {
      map.setCenter(all[0]);
      map.setZoom(15);
      return;
    }
    const bounds = new core.LatLngBounds();
    all.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `allKey` captures the points
  }, [map, core, allKey]);

  // Focus the stop picked on the timeline.
  useEffect(() => {
    if (!map || !focus) return;
    map.panTo(focus);
    if ((map.getZoom() ?? 0) < 15) map.setZoom(15);
  }, [map, focus?.lat, focus?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
