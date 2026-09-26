// "No lunch planned" → pick where to eat: the group's own food ideas nearby
// first, then halal restaurants around where you'll be at that time (verified
// by Safar travellers, Google-listed halal, …). One tap puts it on the day.
import { Phone, Star, Utensils } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FoodVerdict, GeoPoint, MealKey } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { Badge, ErrorBanner, Sheet, Spinner } from '../../ui';

interface Options {
  ideas: { ideaId: string; name: string; walkMin: number; typeLabel: string }[];
  places: { placeId: string; name: string; location: GeoPoint; typeLabel?: string; rating?: number; ratingCount?: number; phone?: string; walkMin: number; verdict: FoodVerdict }[];
}

export function MealSheet({
  day,
  meal,
  near,
  tripId,
  onClose,
  onPickIdea,
}: {
  day: string;
  meal: MealKey;
  near: GeoPoint;
  tripId: string;
  onClose: () => void;
  onPickIdea: (ideaId: string) => Promise<void>;
}) {
  const [opts, setOpts] = useState<Options | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const q = { tripId };

  useEffect(() => {
    api
      .post<Options>('schedule/meal-options', { day, meal, near }, q)
      .then(setOpts)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not find places to eat.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, meal, near.lat, near.lng]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await fn();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add it.');
      setBusy(null);
    }
  };

  const label = meal === 'lunch' ? 'Lunch' : 'Dinner';
  return (
    <Sheet open onClose={onClose} title={`${label} — halal places nearby`}>
      <div className="space-y-4">
        <p className="text-sm text-[#6D7A77]">Around where you'll be at {meal} time. Added in the {meal} window, fitted around the day's stops and prayer times.</p>
        {!opts && !error && <Spinner label="Finding halal places…" />}
        {opts && (
          <>
            {!!opts.ideas.length && (
              <section className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6D7A77]">From your backlog</h3>
                {opts.ideas.map((i) => (
                  <button
                    key={i.ideaId}
                    type="button"
                    disabled={!!busy}
                    onClick={() => void run(i.ideaId, () => onPickIdea(i.ideaId))}
                    className="w-full text-left rounded-xl border border-[#E7DFD5] bg-white px-3 py-2.5 hover:border-[#00685F]/50 disabled:opacity-60"
                  >
                    <span className="block font-semibold text-sm text-[#161C23]">{busy === i.ideaId ? 'Adding…' : i.name}</span>
                    <span className="block text-xs text-[#6D7A77]">
                      {i.typeLabel} · {i.walkMin} min away · the group already accepted it
                    </span>
                  </button>
                ))}
              </section>
            )}
            <section className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6D7A77]">Halal restaurants nearby</h3>
              {opts.places.length ? (
                opts.places.map((p) => (
                  <div key={p.placeId} className="rounded-xl border border-[#E7DFD5] bg-white px-3 py-2.5 space-y-1">
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => void run(p.placeId, () => api.post('schedule/add-meal', { day, meal, place: { name: p.name, location: p.location, placeId: p.placeId }, ...(p.phone ? { phone: p.phone } : {}) }, q))}
                      className="w-full text-left disabled:opacity-60"
                    >
                      <span className="flex items-center gap-2 font-semibold text-sm text-[#161C23]">
                        <Utensils className="w-3.5 h-3.5 text-[#00685F] shrink-0" /> {busy === p.placeId ? 'Adding…' : p.name}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-[#6D7A77]">
                        {p.typeLabel && <span>{p.typeLabel}</span>}
                        {p.rating !== undefined && (
                          <span className="inline-flex items-center gap-0.5">
                            <Star className="w-3 h-3 fill-[#F2B544] text-[#F2B544]" /> {p.rating}
                            {p.ratingCount ? ` (${p.ratingCount.toLocaleString()})` : ''}
                          </span>
                        )}
                        <span>{p.walkMin} min away</span>
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={p.verdict.bucket === 'certified' || p.verdict.bucket === 'halal' ? 'brand' : 'amber'}>{p.verdict.text}</Badge>
                      <span className="text-[11px] text-[#6D7A77]">{p.verdict.basis}</span>
                      {p.phone && (
                        <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[#00685F]">
                          <Phone className="w-3 h-3" /> {p.phone}
                        </a>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#6D7A77]">No halal-listed restaurants found near there. Try the Food tab for everything nearby.</p>
              )}
            </section>
          </>
        )}
        <ErrorBanner>{error}</ErrorBanner>
      </div>
    </Sheet>
  );
}
