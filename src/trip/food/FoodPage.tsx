// Food tab — Halal Radar near you. Search around your location, a stop on the
// timeline, or a trip city; results are grouped Halal / Pork-free / Not
// checked with where each verdict comes from. "Check" runs the full Halal
// Radar on a place; "Add" puts it on the Idea Board; people can report the
// queue (gone after an hour).
import { Clock, ExternalLink, LocateFixed, MapPin, Phone, Plus, ShieldCheck, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { FOOD_TABS, fmtClock, Idea, paths, planningDate, ScheduleItem, toMin, type FoodVerdict, type GeoPoint } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { useQuery } from '../../lib/firestore';
import { Badge, Button, Card, Chip, cx, ErrorBanner, Select, Spinner } from '../../ui';
import { formatDay } from '../bookings/format';
import { useTrip } from '../TripLayout';

interface FoodItem {
  placeId: string;
  placeKey: string;
  name: string;
  location: GeoPoint;
  typeLabel?: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: number;
  openNow?: boolean;
  phone?: string;
  distanceM: number;
  walkMin: number;
  verdict: FoodVerdict;
  pork?: boolean;
  alcohol?: boolean;
  wait?: { minutes: number; agoMin: number };
  ideaId?: string;
  checked: boolean;
}

const TONE: Record<FoodVerdict['bucket'], string> = {
  certified: 'bg-[#E3F4EC] text-[#0B6B45] border-[#B7E1CB]',
  halal: 'bg-[#EAF4F3] text-[#00685F] border-[#C4E0DD]',
  pork_free: 'bg-[#FDF3E1] text-[#96590B] border-[#F0C987]',
  not_halal: 'bg-[#FDECEA] text-[#B3261E] border-[#F2B8B5]',
  unknown: 'bg-[#F3EFE9] text-[#6D7A77] border-[#E7DFD5]',
};

type Source = { key: string; label: string; at: GeoPoint | null };

export function FoodPage() {
  const { trip } = useTrip();
  const q = { tripId: trip.id };
  const today = planningDate(trip.startDate, trip.endDate, trip.destinations[0].timezone);
  const schedule = useQuery(`schedule:${trip.id}`, () => paths.schedule(trip.id), ScheduleItem);
  const ideas = useQuery(`ideas:${trip.id}`, () => paths.ideas(trip.id), Idea);
  const ideaMap = useMemo(() => new Map(ideas.data.map((i) => [i.id, i])), [ideas.data]);
  // A link can ask for a specific spot, e.g. Emergency Resync: /food?lat=…&lng=…&near=KLIA
  const [params] = useSearchParams();
  const linked = useMemo(() => {
    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));
    return Number.isFinite(lat) && Number.isFinite(lng) && params.get('lat') && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { key: 'link', label: `Near ${(params.get('near') ?? 'the linked place').slice(0, 80)}`, at: { lat, lng } }
      : null;
  }, [params]);

  // Where to search: me, today's stops, or a trip city.
  const sources: Source[] = useMemo(() => {
    const stops = schedule.data
      .filter((s) => s.day === today && s.ref.kind === 'idea' && !s.track.match(/:(B|C|F)$/))
      .sort((a, b) => a.start.localeCompare(b.start))
      .flatMap((s) => {
        const idea = s.ref.kind === 'idea' ? ideaMap.get(s.ref.ideaId) : undefined;
        return idea ? [{ key: `stop:${s.id}`, label: `${fmtClock(toMin(s.start))} · near ${idea.place.name}`, at: idea.place.location }] : [];
      });
    return [
      ...(linked ? [linked] : []),
      { key: 'me', label: 'Near me (GPS)', at: null },
      ...stops,
      ...trip.destinations.map((d, i) => ({ key: `dest:${i}`, label: `In ${d.name}`, at: d.location })),
    ];
  }, [schedule.data, ideaMap, today, trip.destinations, linked]);

  const [sourceKey, setSourceKey] = useState(linked ? 'link' : 'dest:0');
  const [center, setCenter] = useState<GeoPoint | null>(linked?.at ?? trip.destinations[0].location);
  const [items, setItems] = useState<FoodItem[] | null>(null);
  const [tab, setTab] = useState<(typeof FOOD_TABS)[number]['key']>('halal');
  const [openOnly, setOpenOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async (at: GeoPoint) => {
    setLoading(true);
    setError('');
    try {
      setItems((await api.post<{ items: FoodItem[] }>('food/nearby', at, q)).items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not search right now.');
    } finally {
      setLoading(false);
    }
  };
  const choose = (key: string) => {
    setSourceKey(key);
    const s = sources.find((x) => x.key === key);
    if (s?.at) {
      setCenter(s.at);
      return;
    }
    if (!navigator.geolocation) return setError('Location is not available on this device.');
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {
        setLoading(false);
        setError('Allow location access to search near you — or pick a stop or city.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };
  useEffect(() => {
    if (center) void search(center);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lat, center?.lng]);

  const update = (placeId: string, patch: Partial<FoodItem>) => setItems((xs) => xs?.map((x) => (x.placeId === placeId ? { ...x, ...patch } : x)) ?? null);
  const active = FOOD_TABS.find((t) => t.key === tab)!;
  const shown = (items ?? []).filter((i) => active.buckets.includes(i.verdict.bucket) && (!openOnly || i.openNow !== false));
  // Certified first within the Halal tab, then nearest.
  shown.sort((a, b) => Number(b.verdict.bucket === 'certified') - Number(a.verdict.bucket === 'certified') || a.distanceM - b.distanceM);
  const notHalal = (items ?? []).filter((i) => i.verdict.bucket === 'not_halal').length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-extrabold text-[#161C23]">Food</h1>
        <p className="text-sm text-[#6D7A77]">Halal Radar near you — every label says where it comes from.</p>
      </div>

      <div className="flex gap-2">
        <Select value={sourceKey} onChange={(e) => choose(e.target.value)} aria-label="Search near">
          {sources.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
        <Button variant="secondary" className="shrink-0" onClick={() => choose('me')} aria-label="Use my location">
          <LocateFixed className="w-4 h-4" />
        </Button>
      </div>
      {sources.length > 1 + trip.destinations.length && <p className="text-xs text-[#6D7A77] -mt-2">Stops from {formatDay(today)}'s timeline are in the list.</p>}

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
        {FOOD_TABS.map((t) => (
          <Chip key={t.key} selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label} {items ? `(${items.filter((i) => t.buckets.includes(i.verdict.bucket)).length})` : ''}
          </Chip>
        ))}
        <Chip selected={openOnly} onClick={() => setOpenOnly((v) => !v)}>
          Open now
        </Chip>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {loading && <Spinner label="Searching nearby…" />}
      {!loading && items && !shown.length && (
        <Card className="p-5 text-sm text-[#6D7A77]">
          {tab === 'halal' ? 'No halal-listed places within ~1 km. Try “Not checked” and tap Check, or search near another stop.' : 'Nothing here.'}
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((i) => (
          <FoodCard key={i.placeId} item={i} tripId={trip.id} onUpdate={(p) => update(i.placeId, p)} />
        ))}
      </div>
      {!!notHalal && <p className="text-xs text-[#6D7A77]">{notHalal} nearby place{notHalal > 1 ? 's' : ''} reported as not halal / serving pork are hidden.</p>}
      <p className="text-[11px] text-[#9AA5A3] text-center">Places © Google · OpenStreetMap. Halal information is guidance — always confirm with the restaurant.</p>
    </div>
  );
}

function FoodCard({ item: i, tripId, onUpdate }: { item: FoodItem; tripId: string; onUpdate: (p: Partial<FoodItem>) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const q = { tripId };
  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };
  const price = i.priceLevel ? '$'.repeat(i.priceLevel) : null;
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${i.location.lat},${i.location.lng}&destination_place_id=${i.placeId}&travelmode=walking`;

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[#161C23] leading-snug">{i.name}</p>
          <p className="text-xs text-[#6D7A77] flex flex-wrap gap-x-2">
            {i.typeLabel && <span>{i.typeLabel}</span>}
            {i.rating !== undefined && (
              <span className="inline-flex items-center gap-0.5">
                <Star className="w-3 h-3 fill-[#F2B544] text-[#F2B544]" /> {i.rating}
                {i.ratingCount ? ` (${i.ratingCount.toLocaleString()})` : ''}
              </span>
            )}
            {price && <span>{price}</span>}
            <span>
              {i.walkMin} min walk · {i.distanceM < 1000 ? `${i.distanceM} m` : `${(i.distanceM / 1000).toFixed(1)} km`}
            </span>
          </p>
        </div>
        {i.openNow !== undefined && <Badge tone={i.openNow ? 'brand' : 'muted'}>{i.openNow ? 'Open' : 'Closed'}</Badge>}
      </div>

      <div className={cx('rounded-xl border px-3 py-2', TONE[i.verdict.bucket])}>
        <p className="text-sm font-bold flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4" /> {i.verdict.text}
        </p>
        <p className="text-[11px] opacity-80">{i.verdict.basis}</p>
        {(i.pork !== undefined || i.alcohol !== undefined) && (
          <p className="text-[11px] font-semibold mt-0.5">
            {i.pork !== undefined && (i.pork ? '🐖 Serves pork ' : '🐖 No pork reported ')}
            {i.alcohol !== undefined && (i.alcohol ? '· 🍺 Serves alcohol' : '· 🍺 No alcohol')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-[#6D7A77]">
        <Clock className="w-3.5 h-3.5" />
        {i.wait ? (
          <span>
            Queue {i.wait.minutes ? `~${i.wait.minutes} min` : 'none'} · reported {i.wait.agoMin} min ago
          </span>
        ) : (
          <span>No queue report</span>
        )}
        <span className="ml-auto flex gap-1">
          {[0, 15, 30].map((m) => (
            <button
              key={m}
              type="button"
              className="rounded-full border border-[#E7DFD5] px-2 py-0.5 hover:border-[#00685F]"
              disabled={!!busy}
              onClick={() => act(`w${m}`, async () => {
                await api.post('food/wait', { placeId: i.placeId, minutes: m }, q);
                onUpdate({ wait: { minutes: m, agoMin: 0 } });
              })}
            >
              {m === 0 ? 'No wait' : m === 30 ? '30+' : `~${m}`}
            </button>
          ))}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {!i.checked && (
          <Button
            variant="secondary"
            className="min-h-9"
            loading={busy === 'check'}
            onClick={() => act('check', async () => {
              const r = await api.post<{ verdict: FoodVerdict; halal: { flags: { servesPork?: boolean; servesAlcohol?: boolean } } }>('food/check', { placeId: i.placeId }, q);
              onUpdate({ verdict: r.verdict, checked: true, pork: r.halal.flags.servesPork, alcohol: r.halal.flags.servesAlcohol });
            })}
          >
            <ShieldCheck className="w-4 h-4" /> Check halal
          </Button>
        )}
        {i.ideaId ? (
          <Badge tone="muted">On the Idea Board</Badge>
        ) : (
          <Button
            variant="ghost"
            className="min-h-9"
            loading={busy === 'add'}
            onClick={() => act('add', async () => {
              const r = await api.post<{ id: string }>('ideas/add', { placeId: i.placeId, source: { type: 'radar' } }, q);
              onUpdate({ ideaId: r.id });
            })}
          >
            <Plus className="w-4 h-4" /> Idea Board
          </Button>
        )}
        {i.phone && (
          <a href={`tel:${i.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 min-h-9 px-2.5 text-sm font-bold text-[#00685F]">
            <Phone className="w-4 h-4" /> Call
          </a>
        )}
        <a href={maps} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 min-h-9 px-2.5 text-sm font-bold text-[#00685F]">
          <MapPin className="w-4 h-4" /> Directions <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <ErrorBanner>{error}</ErrorBanner>
    </Card>
  );
}
