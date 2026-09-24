// Worldwide destination search using Google Places Autocomplete (New) via
// the Maps JS API. Returns a DestinationInput (name, placeId, location, country).
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DestinationInput } from '../../domain';
import { Input } from '../../ui';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

interface Props {
  onPick: (d: DestinationInput) => void;
  placeholder?: string;
}

export function PlaceSearch(props: Props) {
  if (!MAPS_KEY) return <p className="text-sm text-[#B3261E]">Google Maps key missing (VITE_GOOGLE_MAPS_API_KEY).</p>;
  return (
    <APIProvider apiKey={MAPS_KEY}>
      <PlaceSearchInner {...props} />
    </APIProvider>
  );
}

function PlaceSearchInner({ onPick, placeholder = 'Search a city or country…' }: Props) {
  const places = useMapsLibrary('places');
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  // Debounced autocomplete. A session token groups keystrokes + the final
  // details fetch into one billable session.
  useEffect(() => {
    if (!places || text.trim().length < 2) return setSuggestions([]);
    session.current ??= new places.AutocompleteSessionToken();
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text,
          sessionToken: session.current!,
          includedPrimaryTypes: ['(regions)'],
        });
        if (!cancelled) {
          setSuggestions(res.suggestions.filter((s) => s.placePrediction));
          setError('');
        }
      } catch {
        if (!cancelled) setError('Place search is unavailable right now.');
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [places, text]);

  const pick = async (s: google.maps.places.AutocompleteSuggestion) => {
    const place = s.placePrediction!.toPlace();
    await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents'] });
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
        placeholder={places ? placeholder : 'Loading place search…'}
        disabled={!places}
        className="pl-10"
        aria-label="Search destinations"
      />
      {error && <p className="mt-1 text-xs text-[#B3261E]">{error}</p>}
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
