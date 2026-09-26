// Worldwide destination search using Google Places Autocomplete (New) via
// the Maps JS API. Returns a DestinationInput (name, placeId, location, country).
// When Google's search fails (quota, error, or the Maps script doesn't load),
// it carries on with Photon — free OpenStreetMap search — credited in the list.
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DestinationInput } from '../../domain';
import { Input } from '../../ui';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

interface PhotonHit {
  key: string;
  place: DestinationInput;
}

/** Photon (OpenStreetMap) search — free, no key; cities / countries only for 'regions'. */
async function photonSearch(q: string, scope: 'regions' | 'any', near?: { lat: number; lng: number }): Promise<PhotonHit[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', q.trim());
  url.searchParams.set('limit', '6');
  url.searchParams.set('lang', 'en');
  if (near) {
    url.searchParams.set('lat', String(near.lat));
    url.searchParams.set('lon', String(near.lng));
  }
  if (scope === 'regions') for (const l of ['city', 'state', 'country', 'county', 'district']) url.searchParams.append('layer', l);
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!res?.ok) return [];
  const body = (await res.json().catch(() => null)) as {
    features?: { geometry?: { coordinates?: [number, number] }; properties?: { name?: string; street?: string; city?: string; state?: string; country?: string; countrycode?: string; osm_type?: string; osm_id?: number } }[];
  } | null;
  const TYPE: Record<string, string> = { N: 'node', W: 'way', R: 'relation' };
  return (body?.features ?? []).flatMap((f) => {
    const p = f.properties;
    const c = f.geometry?.coordinates;
    if (!p?.name || !c) return [];
    const address = [p.street, p.city !== p.name ? p.city : undefined, p.state, p.country].filter(Boolean).join(', ');
    const osmId = p.osm_type && p.osm_id ? `${TYPE[p.osm_type] ?? p.osm_type}/${p.osm_id}` : undefined;
    return [
      {
        key: osmId ?? `${c[1]},${c[0]}`,
        place: {
          name: p.name.slice(0, 200),
          ...(address ? { address: address.slice(0, 300) } : {}),
          location: { lat: c[1], lng: c[0] },
          ...(osmId ? { osmId } : {}),
          ...(p.countrycode && p.countrycode.length === 2 ? { countryCode: p.countrycode.toUpperCase() } : {}),
        } as DestinationInput,
      },
    ];
  });
}

interface Props {
  onPick: (d: DestinationInput) => void;
  placeholder?: string;
  /** 'regions' = cities/countries (trip destinations); 'any' = airports, stations, hotels… */
  scope?: 'regions' | 'any';
  autoFocus?: boolean;
  /** Prefer places around here (5 km). */
  near?: { lat: number; lng: number };
}

export function PlaceSearch(props: Props) {
  if (!MAPS_KEY) return <p className="text-sm text-[#B3261E]">Google Maps key missing (VITE_GOOGLE_MAPS_API_KEY).</p>;
  return (
    <APIProvider apiKey={MAPS_KEY}>
      <PlaceSearchInner {...props} />
    </APIProvider>
  );
}

function PlaceSearchInner({ onPick, placeholder = 'Search a city or country…', scope = 'regions', autoFocus, near }: Props) {
  const places = useMapsLibrary('places');
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  // Backup search (OpenStreetMap) when Google's fails or its script never loads.
  const [failed, setFailed] = useState(false);
  const [osm, setOsm] = useState<PhotonHit[]>([]);
  // The box never waits for Google's script: until it has loaded (or when Google's search fails), OpenStreetMap answers.
  const backup = failed || !places;
  useEffect(() => {
    if (!backup || text.trim().length < 2) return setOsm([]);
    let cancelled = false;
    const t = setTimeout(() => {
      void photonSearch(text, scope, near).then((hits) => {
        if (cancelled) return;
        setOsm(hits);
        setError(hits.length ? '' : 'Nothing found — try another spelling.');
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [backup, text, scope, near?.lat, near?.lng]);

  // Debounced autocomplete. A session token groups keystrokes + the final
  // details fetch into one billable session.
  useEffect(() => {
    if (!places || backup || text.trim().length < 2) return setSuggestions([]);
    session.current ??= new places.AutocompleteSessionToken();
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text,
          sessionToken: session.current!,
          ...(scope === 'regions' ? { includedPrimaryTypes: ['(regions)'] } : {}),
          ...(near ? { locationBias: { center: near, radius: 5000 } } : {}),
        });
        if (!cancelled) {
          setSuggestions(res.suggestions.filter((s) => s.placePrediction));
          setError('');
        }
      } catch {
        // Google's search is out: carry on with OpenStreetMap.
        if (!cancelled) setFailed(true);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [places, backup, text, scope, near?.lat, near?.lng]);

  const pickOsm = (h: PhotonHit) => {
    onPick(h.place);
    setText('');
    setOsm([]);
    setOpen(false);
  };

  const pick = async (s: google.maps.places.AutocompleteSuggestion) => {
    const place = s.placePrediction!.toPlace();
    try {
      await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents'] });
    } catch {
      // Google can't give its details right now: find the same place on OpenStreetMap and use that.
      session.current = null;
      const label = [s.placePrediction!.mainText?.text, s.placePrediction!.secondaryText?.text].filter(Boolean).join(', ') || s.placePrediction!.text.text;
      const [hit] = await photonSearch(label, 'any');
      if (!hit) return setError("Couldn't load that place — try typing it again.");
      setFailed(true);
      return pickOsm(hit);
    }
    session.current = null; // session ends with the details fetch
    if (!place.location) return setError('That place has no location — try another.');
    const country = place.addressComponents?.find((c) => c.types.includes('country'))?.shortText ?? undefined;
    onPick({
      placeId: place.id,
      name: place.displayName ?? s.placePrediction!.mainText?.text ?? 'Destination',
      address: place.formattedAddress ?? undefined,
      location: place.location.toJSON(),
      ...(country && country.length === 2 ? { countryCode: country } : {}),
    });
    setText('');
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-[#9AA5A3] pointer-events-none" />
      <Input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="pl-10"
        aria-label="Search destinations"
      />
      {error && <p className="mt-1 text-xs text-[#B3261E]">{error}</p>}
      {open && backup && osm.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-[#E7DFD5] shadow-lg overflow-hidden">
          {osm.map((h) => (
            <li key={h.key}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickOsm(h)}
                className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-[#F3EFE9]"
              >
                <MapPin className="w-4 h-4 mt-0.5 text-[#00685F] shrink-0" />
                <span>
                  <span className="block text-sm font-semibold text-[#161C23]">{h.place.name}</span>
                  {h.place.address && <span className="block text-xs text-[#6D7A77]">{h.place.address}</span>}
                </span>
              </button>
            </li>
          ))}
          <li className="px-3.5 py-1 text-[10px] text-[#6D7A77] bg-[#FAF8F5]">Search by OpenStreetMap (Photon)</li>
        </ul>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-[#E7DFD5] shadow-lg overflow-hidden">
          {suggestions.map((s) => {
            const p = s.placePrediction!;
            return (
              <li key={p.placeId}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void pick(s)}
                  className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-[#F3EFE9]"
                >
                  <MapPin className="w-4 h-4 mt-0.5 text-[#00685F] shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-[#161C23]">{p.mainText?.text ?? p.text.text}</span>
                    {p.secondaryText && <span className="block text-xs text-[#6D7A77]">{p.secondaryText.text}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Shows a chosen place with a "Change" button; switches to search when empty or changing. */
export function PlacePicker({
  value,
  onChange,
  placeholder,
}: {
  value?: DestinationInput;
  onChange: (d: DestinationInput) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(!value);
  if (value && !editing) {
    return (
      <div className="flex items-center gap-2.5 min-h-11 px-3.5 py-2 rounded-xl border border-[#E7DFD5] bg-white">
        <MapPin className="w-4 h-4 text-[#00685F] shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-[#161C23] truncate">{value.name}</span>
          {value.address && <span className="block text-xs text-[#6D7A77] truncate">{value.address}</span>}
        </span>
        <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-[#00685F] px-1">
          Change
        </button>
      </div>
    );
  }
  return (
    <PlaceSearch
      scope="any"
      autoFocus={!!value}
      placeholder={placeholder}
      onPick={(d) => {
        onChange(d);
        setEditing(false);
      }}
    />
  );
}
