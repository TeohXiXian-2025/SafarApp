// Where to pray for one prayer break — the time is locked, the place isn't:
// mosques and prayer rooms near the stop before and after it (and where the
// group is), or any place searched for. Back to Safar's pick at any time.
import { MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fmtClock, toMin, type GeoPoint, type ScheduleItem } from '../../domain';
import { PlaceSearch } from '../../components/live/PlaceSearch';
import { api, ApiError } from '../../lib/api';
import { Button, ErrorBanner, Sheet, Spinner } from '../../ui';

interface Place {
  name: string;
  location: GeoPoint;
  placeId?: string;
  near: string;
  walkMin: number;
  via?: string;
}

export function PrayerPlaceSheet({ item, tripId, onClose }: { item: ScheduleItem; tripId: string; onClose: () => void }) {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const p = item.prayer!;
  const q = { tripId };

  useEffect(() => {
    api
      .post<{ places: Place[] }>('prayer/places', { itemId: item.id }, q)
      .then((r) => setPlaces(r.places))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load prayer places.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const choose = async (key: string, place: { name: string; location: GeoPoint; placeId?: string } | null) => {
    setBusy(key);
    setError('');
    try {
      await api.post('prayer/place', { itemId: item.id, place }, q);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
      setBusy(null);
    }
  };

  return (
    <Sheet open onClose={onClose} title={`Where to pray ${p.prayer}`}>
      <div className="space-y-4">
        <p className="text-sm text-[#6D7A77]">
          🔒 The time stays {fmtClock(toMin(item.start))}. Now: <b className="text-[#161C23]">{p.facility?.name ?? 'any clean, quiet spot'}</b>. Pick another place — the travel before and after is worked out again.
        </p>
        {!places && !error && <Spinner label="Finding mosques and prayer rooms…" />}
        {places && (
          <ul className="space-y-2">
            {places.length === 0 && <li className="text-xs text-[#6D7A77]">No mosque or prayer room found nearby — search below, or any clean, quiet spot works.</li>}
            {places.map((pl, k) => (
              <li key={`${pl.name}${k}`}>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void choose(`p${k}`, { name: pl.name, location: pl.location, ...(pl.placeId ? { placeId: pl.placeId } : {}) })}
                  className="w-full text-left rounded-xl border border-[#E7DFD5] bg-white px-3 py-2.5 hover:border-[#CA8A04]/60 disabled:opacity-60"
                >
                  <span className="block font-semibold text-sm text-[#161C23]">{busy === `p${k}` ? '…' : `🕌 ${pl.name}`}</span>
                  <span className="block text-xs text-[#6D7A77]">
                    {pl.walkMin} min {pl.walkMin <= 18 ? 'walk' : 'away'} · {pl.near}
                    {pl.via ? ` · via ${pl.via}` : ''}
                    {p.facility?.name === pl.name ? ' · current' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {searching ? (
          <PlaceSearch
            scope="any"
            near={p.facility?.location}
            placeholder="Search a mosque or prayer room…"
            autoFocus
            onPick={(d) => void choose('search', { name: d.name, location: d.location, ...(d.placeId ? { placeId: d.placeId } : {}) })}
          />
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setSearching(true)}>
            <MapPin className="w-4 h-4" /> Search another place
          </Button>
        )}
        {p.chosen && (
          <button type="button" disabled={!!busy} className="text-xs font-semibold text-[#00685F] underline underline-offset-2" onClick={() => void choose('auto', null)}>
            Let Safar pick again (near the stops around it)
          </button>
        )}
        <ErrorBanner>{error}</ErrorBanner>
      </div>
    </Sheet>
  );
}
