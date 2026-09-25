// What a member who doesn't pray does during a prayer break: an idea the group
// already accepted (or a backup they liked) — the ones praying members marked
// "good while we pray" first — a quick place right by the prayer space, any
// other place nearby, or just resting. No vote: it's their own 30 minutes and
// everyone meets back at the prayer place.
import { Coffee, MapPin, Sparkles, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fmtClock, toMin, type GeoPoint, type ScheduleItem } from '../../domain';
import { PlaceSearch } from '../../components/live/PlaceSearch';
import { api, ApiError } from '../../lib/api';
import { Badge, Button, ErrorBanner, Sheet, Spinner } from '../../ui';

interface Options {
  ideas: { ideaId: string; name: string; typeLabel: string; walkMin: number; status: string; marked: number; liked: boolean; short: boolean }[];
  nearby: { placeId: string; name: string; location: GeoPoint; typeLabel?: string; rating?: number; walkMin: number }[];
}

export function PrayerPickSheet({ item, tripId, myPick, onClose }: { item: ScheduleItem; tripId: string; myPick?: string; onClose: () => void }) {
  const [opts, setOpts] = useState<Options | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const q = { tripId };
  const p = item.prayer!;
  const where = p.facility?.name ?? 'the prayer place';
  const meet = fmtClock(toMin(item.end));

  useEffect(() => {
    api
      .post<Options>('prayer/options', { itemId: item.id }, q)
      .then(setOpts)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load options.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const pick = async (key: string, body: unknown) => {
    setBusy(key);
    setError('');
    try {
      await api.post('prayer/pick', { itemId: item.id, pick: body }, q);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
      setBusy(null);
    }
  };

  const row = (key: string, title: string, sub: string, onClick: () => void, extra?: React.ReactNode) => (
    <button
      key={key}
      type="button"
      disabled={!!busy}
      onClick={onClick}
      className="w-full text-left rounded-xl border border-[#E7DFD5] bg-white px-3 py-2.5 hover:border-[#1D4E89]/50 disabled:opacity-60"
    >
      <span className="flex items-center gap-2 font-semibold text-[#161C23] text-sm">
        {busy === key ? '…' : title} {extra}
      </span>
      <span className="block text-xs text-[#6D7A77]">{sub}</span>
    </button>
  );

  return (
    <Sheet open onClose={onClose} title={`While the others pray ${p.prayer}`}>
      <div className="space-y-4">
        <p className="text-sm text-[#6D7A77]">
          {fmtClock(toMin(item.start))}–{meet} · everyone meets back at <b className="text-[#161C23]">{where}</b> at {meet}. No vote needed — it's your own break.
        </p>
        {!opts && !error && <Spinner label="Finding things nearby…" />}
        {opts && (
          <>
            <section className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6D7A77]">From your ideas</h3>
              {opts.ideas.length ? (
                opts.ideas.map((i) =>
                  row(
                    `i${i.ideaId}`,
                    i.name,
                    `${i.typeLabel} · ${i.walkMin} min walk${i.short ? '' : ' · just a quick look'}${i.status === 'backup' ? ' · a backup you liked' : ''}`,
                    () => void pick(`i${i.ideaId}`, { kind: 'idea', ideaId: i.ideaId }),
                    <>
                      {i.marked > 0 && <Badge>☕ good while we pray</Badge>}
                      {i.liked && <Star className="w-3.5 h-3.5 fill-[#F2B544] text-[#F2B544]" />}
                    </>,
                  ),
                )
              ) : (
                <p className="text-xs text-[#6D7A77]">None of your accepted ideas is within a few minutes of {where}.</p>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6D7A77]">Quick options right there</h3>
              {opts.nearby.length ? (
                opts.nearby.slice(0, 6).map((n) =>
                  row(
                    `n${n.placeId}`,
                    n.name,
                    `${n.typeLabel ?? 'Nearby'} · ${n.walkMin} min walk${n.rating ? ` · ★ ${n.rating}` : ''}`,
                    () => void pick(`n${n.placeId}`, { kind: 'place', place: { name: n.name, location: n.location, placeId: n.placeId } }),
                    <Coffee className="w-3.5 h-3.5 text-[#1D4E89]" />,
                  ),
                )
              ) : (
                <p className="text-xs text-[#6D7A77]">No cafés or shops found right next to it.</p>
              )}
            </section>
          </>
        )}
        <section className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6D7A77]">Something else</h3>
          {searching ? (
            <PlaceSearch
              scope="any"
              near={p.facility?.location}
              placeholder="Search a place nearby…"
              autoFocus
              onPick={(d) => void pick('search', { kind: 'place', place: { name: d.name, location: d.location, ...(d.placeId ? { placeId: d.placeId } : {}) } })}
            />
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => setSearching(true)}>
              <MapPin className="w-4 h-4" /> Search a place nearby
            </Button>
          )}
          {row('rest', 'Rest / wait nearby', 'Take a break and meet the group when they’re done.', () => void pick('rest', { kind: 'rest' }), <Sparkles className="w-3.5 h-3.5 text-[#6D7A77]" />)}
          {myPick && (
            <button type="button" className="text-xs font-semibold text-[#B3261E] underline underline-offset-2" onClick={() => void pick('clear', null)}>
              Clear my choice ({myPick})
            </button>
          )}
        </section>
        <ErrorBanner>{error}</ErrorBanner>
      </div>
    </Sheet>
  );
}
