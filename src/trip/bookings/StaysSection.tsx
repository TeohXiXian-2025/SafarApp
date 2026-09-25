// Stays: one per city block of nights. For each: find hotels near where you'll
// be (live Google Hotels prices), vote, the admin picks, you book on the site
// and tap "I booked it" — it becomes the hotel booking on the timeline.
import { BedDouble, Check, ExternalLink, Loader2, Pencil, Plus, RefreshCw, Star, ThumbsDown, ThumbsUp, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Booking, formatMoney, groupHotelBudget, HotelOption, paths, Stay, toMinor, tripNights, uncoveredNights } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { useQuery } from '../../lib/firestore';
import { Badge, Button, Card, cx, ErrorBanner, Field, Input, Select, Sheet, Spinner } from '../../ui';
import { useTrip } from '../TripLayout';
import { formatDay } from './format';

const SHOW_FIRST = 5;
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const agoText = (at: number) => {
  const min = Math.round((Date.now() - at) / 60_000);
  return min < 60 ? `${Math.max(1, min)} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`;
};

export function StaysSection({ bookings, onUpload }: { bookings: Booking[]; onUpload: () => void }) {
  const { trip, members, isAdmin } = useTrip();
  const stays = useQuery(`stays:${trip.id}`, () => paths.stays(trip.id), Stay);
  const [editing, setEditing] = useState<Stay | 'new' | null>(null);
  const [error, setError] = useState('');
  const [replanning, setReplanning] = useState(false);
  const planned = useRef(false);
  const [planning, setPlanning] = useState(false);

  // First visit: Safar proposes the stays from the timeline and bookings.
  useEffect(() => {
    if (stays.loading || stays.fromCache || stays.data.length || planned.current) return;
    planned.current = true;
    setPlanning(true);
    api
      .post('stays/plan', {}, { tripId: trip.id })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not plan stays.'))
      .finally(() => setPlanning(false));
  }, [stays.loading, stays.fromCache, stays.data.length, trip.id]);

  const hotels = bookings.filter((b) => b.kind === 'hotel');
  const nights = tripNights(trip.startDate, trip.endDate);
  const missing = uncoveredNights(nights, hotels);
  const budgetText = (major: number) => formatMoney(toMinor(major, trip.currency), trip.currency).replace(/\.00$/, '');
  const budget = groupHotelBudget(members.map((m) => m.prefs));
  const sorted = [...stays.data].sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  const replan = async () => {
    if (!confirm('Re-plan stays from the current timeline? Stays with a picked hotel are kept.')) return;
    setReplanning(true);
    try {
      await api.post('stays/plan', { replan: true }, { tripId: trip.id });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not re-plan.');
    } finally {
      setReplanning(false);
    }
  };

  return (
    <div className="space-y-4">
      {missing.length > 0 && (
        <div className="flex gap-2.5 rounded-xl border border-[#F0D7A7] bg-[#FDF3E1] px-3.5 py-2.5 text-sm text-[#6B3F06]">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            <strong>No place to sleep</strong> on {missing.map(formatDay).join(', ')}. Pick a hotel below, or add one you booked yourself.
          </p>
        </div>
      )}

      <p className="text-sm text-[#6D7A77]">
        {budget ? (
          <>
            Group budget <strong className="text-[#161C23]">{budgetText(budget.min)}–{budgetText(budget.max)}</strong> per room per night
            {!budget.overlap && ' (budgets don’t overlap, so this is the middle)'}.{' '}
          </>
        ) : (
          'Nobody has set a hotel budget yet. '
        )}
        <Link to="../preferences" className="font-semibold text-[#00685F] underline">
          Your preferences
        </Link>{' '}
        shape the ranking.
      </p>

      <ErrorBanner>{error}</ErrorBanner>
      {!nights.length ? (
        <Card className="p-6 text-center text-sm text-[#6D7A77]">A day trip — no nights, so no hotel needed.</Card>
      ) : stays.loading || planning ? (
        <Spinner label="Planning where you'll stay…" />
      ) : (
        sorted.map((s) => <StayCard key={s.id} stay={s} booked={hotels.filter((h) => h.startLocal.slice(0, 10) < s.checkOut && h.endLocal.slice(0, 10) > s.checkIn)} onEdit={() => setEditing(s)} onUpload={onUpload} />)
      )}

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditing('new')}>
            <Plus className="w-4 h-4" /> Add a stay
          </Button>
          <Button variant="secondary" loading={replanning} onClick={() => void replan()}>
            <RefreshCw className="w-4 h-4" /> Re-plan from timeline
          </Button>
        </div>
      )}
      {editing && <StayEditor stay={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StayCard({ stay, booked, onEdit, onUpload }: { stay: Stay; booked: Booking[]; onEdit: () => void; onUpload: () => void }) {
  const { trip, isAdmin } = useTrip();
  const options = useQuery(`hotels:${trip.id}:${stay.id}`, () => paths.hotels(trip.id, stay.id), HotelOption);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [all, setAll] = useState(false);
  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const list = useMemo(() => [...options.data].sort((a, b) => a.rank - b.rank), [options.data]);
  const chosen = list.find((h) => h.key === stay.chosenKey);
  const shown = all ? list : list.slice(0, SHOW_FIRST);
  if (chosen && !shown.includes(chosen)) shown.unshift(chosen);

  const search = async (refresh = false) => {
    setBusy(true);
    setError('');
    try {
      await api.post('stays/search', { id: stay.id, refresh }, { tripId: trip.id });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not search.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center shrink-0">
          <BedDouble className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-[#161C23]">{stay.city}</p>
            {booked.length ? <Badge>Booked ✓</Badge> : chosen ? <Badge tone="amber">Picked — not booked yet</Badge> : null}
          </div>
          <p className="text-sm text-[#6D7A77]">
            {formatDay(stay.checkIn)} → {formatDay(stay.checkOut)} · {nights} night{nights === 1 ? '' : 's'} · {stay.perRoom} per room
            {stay.nearName && ` · near ${stay.nearName}`}
          </p>
        </div>
        {isAdmin && (
          <button type="button" aria-label="Edit stay" onClick={onEdit} className="w-9 h-9 rounded-lg inline-flex items-center justify-center border border-[#E7DFD5] text-[#6D7A77] hover:bg-[#F3EFE9]">
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>

      {booked.map((b) => (
        <p key={b.id} className="rounded-xl bg-[#00685F]/5 px-3 py-2 text-sm text-[#161C23]">
          <Check className="inline w-4 h-4 text-[#00685F] mr-1" />
          <strong>{b.to.name}</strong> — check-in {formatDay(b.startLocal.slice(0, 10))} {b.startLocal.slice(11)}, out {formatDay(b.endLocal.slice(0, 10))} {b.endLocal.slice(11)}
        </p>
      ))}

      {!stay.search ? (
        !booked.length && (
          <Button className="w-full" loading={busy} onClick={() => void search()}>
            Find hotels near your plans
          </Button>
        )
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 text-xs text-[#6D7A77]">
            <span>
              {stay.search.source === 'google' ? 'Live prices from Google Hotels' : 'Sample prices — the monthly live-search limit is used up'} · {agoText(stay.search.at)}
            </span>
            <button type="button" onClick={() => void search(true)} disabled={busy} className="inline-flex items-center gap-1 font-semibold text-[#00685F] disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
            </button>
          </div>
          {options.loading ? (
            <Spinner />
          ) : list.length === 0 ? (
            <p className="text-sm text-[#6D7A77]">No hotels found near your plans for these dates.</p>
          ) : (
            <ul className="space-y-3">
              {shown.map((h) => (
                <HotelCard key={h.key} stay={stay} hotel={h} chosen={h.key === stay.chosenKey} booked={booked.length > 0} onUpload={onUpload} />
              ))}
            </ul>
          )}
          {list.length > SHOW_FIRST && (
            <button type="button" onClick={() => setAll((v) => !v)} className="text-sm font-semibold text-[#00685F]">
              {all ? 'Show fewer' : `Show ${list.length - SHOW_FIRST} more`}
            </button>
          )}
        </>
      )}
      <ErrorBanner>{error}</ErrorBanner>
    </Card>
  );
}

function HotelCard({ stay, hotel: h, chosen, booked, onUpload }: { stay: Stay; hotel: HotelOption; chosen: boolean; booked: boolean; onUpload: () => void }) {
  const { trip, me, members, isAdmin } = useTrip();
  const [offers, setOffers] = useState<{ open: boolean; loading?: boolean }>({ open: false });
  const [markOpen, setMarkOpen] = useState(false);
  const [error, setError] = useState('');
  const money = (m: number) => formatMoney(m, trip.currency);
  const mine = h.votes[me.uid];
  const ups = Object.entries(h.votes).filter(([, v]) => v === 'up').map(([u]) => u);
  const downs = Object.entries(h.votes).filter(([, v]) => v === 'down').map(([u]) => u);
  const names = (uids: string[]) => uids.map((u) => members.find((m) => m.uid === u)?.displayName ?? 'Someone').join(', ');
  const call = async (path: string, body: object) => {
    setError('');
    try {
      await api.post(path, body, { tripId: trip.id });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    }
  };

  const showOffers = async () => {
    if (offers.open) return setOffers({ open: false });
    setOffers({ open: true, loading: !h.offers });
    await call('stays/offers', { id: stay.id, key: h.key });
    setOffers({ open: true });
  };

  return (
    <li className={cx('rounded-2xl border bg-white overflow-hidden', chosen ? 'border-[#00685F] ring-1 ring-[#00685F]' : 'border-[#E7DFD5]')}>
      <div className="flex gap-3 p-3">
        {h.images[0] ? (
          <img src={h.images[0]} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover shrink-0 bg-[#F3EFE9]" />
        ) : (
          <span className="w-20 h-20 rounded-xl bg-[#F3EFE9] shrink-0 flex items-center justify-center text-[#9AA5A3]">
            <BedDouble className="w-6 h-6" />
          </span>
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-[#161C23] leading-snug">{h.name}</p>
            <span className="shrink-0 rounded-lg bg-[#00685F] px-1.5 py-0.5 text-xs font-extrabold text-white" title="How well it fits the group (0–100)">
              {h.score}
            </span>
          </div>
          <p className="text-xs text-[#6D7A77] flex flex-wrap items-center gap-x-2">
            {h.stars ? <span>{'★'.repeat(Math.round(h.stars))}</span> : null}
            {h.kind === 'rental' && <span>Apartment</span>}
            {h.rating ? (
              <span className="inline-flex items-center gap-0.5">
                <Star className="w-3 h-3 fill-[#B7791F] text-[#B7791F]" /> {h.rating.toFixed(1)}
                {h.reviews ? ` (${h.reviews.toLocaleString()})` : ''}
              </span>
            ) : null}
          </p>
          {h.nightlyMinor !== undefined ? (
            <p className="text-sm">
              <strong className="text-[#161C23]">{money(h.nightlyMinor)}</strong>
              <span className="text-[#6D7A77]"> / room / night{h.totalMinor ? ` · ${money(h.totalMinor)} total` : ''}</span>
              {h.priceSource === 'sample' && <span className="ml-1 text-[11px] font-bold text-[#96590B]">sample price</span>}
            </p>
          ) : (
            <p className="text-sm text-[#6D7A77]">No price for these dates</p>
          )}
        </div>
      </div>

      {h.note && <p className="px-3 pb-2 text-sm text-[#161C23]">✨ {h.note}</p>}
      <div className="px-3 pb-2 flex flex-wrap gap-1.5">
        {h.why.map((w) => (
          <span key={w} className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', /over budget/.test(w) ? 'bg-[#FDECEA] text-[#8C1D18]' : 'bg-[#F3EFE9] text-[#161C23]')}>
            {w}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[#E7DFD5] px-3 py-2">
        <VoteBtn active={mine === 'up'} onClick={() => void call('stays/vote', { id: stay.id, key: h.key, vote: mine === 'up' ? null : 'up' })} label={ups.length ? `${ups.length}` : ''} title={ups.length ? `Yes: ${names(ups)}` : 'I like this one'}>
          <ThumbsUp className="w-4 h-4" />
        </VoteBtn>
        <VoteBtn active={mine === 'down'} onClick={() => void call('stays/vote', { id: stay.id, key: h.key, vote: mine === 'down' ? null : 'down' })} label={downs.length ? `${downs.length}` : ''} title={downs.length ? `No: ${names(downs)}` : 'Not for me'} danger>
          <ThumbsDown className="w-4 h-4" />
        </VoteBtn>
        <span className="flex-1" />
        <button type="button" onClick={() => void showOffers()} className="text-sm font-semibold text-[#00685F]">
          {offers.open ? 'Hide prices' : 'Prices & book'}
        </button>
        {isAdmin && !booked && (
          <Button variant={chosen ? 'secondary' : 'primary'} className="!min-h-9 !px-3" onClick={() => void call('stays/choose', { id: stay.id, key: chosen ? null : h.key })}>
            {chosen ? 'Unpick' : 'Pick this'}
          </Button>
        )}
      </div>

      {offers.open && (
        <div className="border-t border-[#E7DFD5] bg-[#FAF8F5] px-3 py-2.5 space-y-1.5">
          {offers.loading ? (
            <p className="text-sm text-[#6D7A77] flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking booking sites…
            </p>
          ) : (
            <>
              {(h.offers ?? []).map((o) => (
                <a key={o.source} href={o.link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm border border-[#E7DFD5] hover:border-[#00685F]/40">
                  <span className="font-semibold text-[#161C23]">
                    {o.source}
                    {o.official && <span className="ml-1 text-[11px] text-[#00685F]">official site</span>}
                  </span>
                  <span className="flex items-center gap-1.5 text-[#161C23]">
                    {o.nightlyMinor !== undefined && `${money(o.nightlyMinor)}/night`}
                    <ExternalLink className="w-3.5 h-3.5 text-[#6D7A77]" />
                  </span>
                </a>
              ))}
              {h.link && (
                <a href={h.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-[#00685F]">
                  {h.offers?.length ? 'More on Google' : 'See the hotel and where to book'} <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <p className="text-xs text-[#6D7A77]">You book and pay on their site. Then come back and tap “I booked it”.</p>
            </>
          )}
        </div>
      )}

      {chosen && !booked && (
        <div className="border-t border-[#E7DFD5] bg-[#00685F]/5 px-3 py-2.5 flex flex-wrap items-center gap-2">
          <p className="flex-1 min-w-[10rem] text-sm text-[#161C23]">
            <strong>Picked.</strong> Booked it? Add it so check-in and check-out go on the timeline.
          </p>
          <Button className="!min-h-9" onClick={() => setMarkOpen(true)}>
            I booked it
          </Button>
        </div>
      )}
      <div className="px-3">
        <ErrorBanner>{error}</ErrorBanner>
      </div>
      {markOpen && <MarkBookedSheet stay={stay} hotel={h} onClose={() => setMarkOpen(false)} onUpload={() => (setMarkOpen(false), onUpload())} />}
    </li>
  );
}

function VoteBtn({ active, onClick, label, title, danger, children }: { active: boolean; onClick: () => void; label: string; title: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={cx(
        'h-9 min-w-9 px-2 rounded-lg inline-flex items-center justify-center gap-1 text-sm font-bold border',
        active ? (danger ? 'bg-[#B3261E] border-[#B3261E] text-white' : 'bg-[#00685F] border-[#00685F] text-white') : 'border-[#E7DFD5] text-[#6D7A77] hover:bg-[#F3EFE9]',
      )}
    >
      {children}
      {label}
    </button>
  );
}

function MarkBookedSheet({ stay, hotel, onClose, onUpload }: { stay: Stay; hotel: HotelOption; onClose: () => void; onUpload: () => void }) {
  const { trip, members } = useTrip();
  const [pnr, setPnr] = useState('');
  const [who, setWho] = useState<string[]>(members.map((m) => m.uid));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!who.length) return setError('Pick who is staying.');
    setSaving(true);
    try {
      await api.post('stays/booked', { id: stay.id, key: hotel.key, ...(pnr.trim() ? { pnr: pnr.trim() } : {}), travellerUids: who }, { tripId: trip.id });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="I booked it">
      <div className="space-y-4">
        <p className="text-sm text-[#161C23]">
          <strong>{hotel.name}</strong>, {formatDay(stay.checkIn)} → {formatDay(stay.checkOut)}. It goes on the timeline as check-in and check-out, and AI Arrange starts each day from here.
        </p>
        <Button variant="secondary" className="w-full" onClick={onUpload}>
          Upload the confirmation instead (AI reads the exact times)
        </Button>
        <Field label="Booking reference (optional)">
          <Input value={pnr} maxLength={20} onChange={(e) => setPnr(e.target.value)} placeholder="e.g. 1234567890" />
        </Field>
        <Field label="Who's staying" group>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <label key={m.uid} className="inline-flex items-center gap-2 rounded-full border border-[#E7DFD5] bg-white px-3 py-1.5 text-sm">
                <input type="checkbox" className="accent-[#00685F]" checked={who.includes(m.uid)} onChange={() => setWho((l) => (l.includes(m.uid) ? l.filter((u) => u !== m.uid) : [...l, m.uid]))} />
                {m.displayName}
              </label>
            ))}
          </div>
        </Field>
        <ErrorBanner>{error}</ErrorBanner>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" loading={saving} onClick={() => void save()}>
            Add to bookings
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function StayEditor({ stay, onClose }: { stay?: Stay; onClose: () => void }) {
  const { trip } = useTrip();
  const [destIdx, setDestIdx] = useState(stay?.destIdx ?? 0);
  const [checkIn, setCheckIn] = useState(stay?.checkIn ?? trip.startDate);
  const [checkOut, setCheckOut] = useState(stay?.checkOut ?? trip.endDate);
  const [perRoom, setPerRoom] = useState(stay?.perRoom ?? 2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (stay) {
        const r = await api.post<{ research: boolean }>('stays/update', { id: stay.id, checkIn, checkOut, perRoom }, { tripId: trip.id });
        if (r.research) await api.post('stays/search', { id: stay.id }, { tripId: trip.id }).catch(() => {});
      } else await api.post('stays/add', { destIdx, checkIn, checkOut }, { tripId: trip.id });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!stay || !confirm(`Remove the ${stay.city} stay and its hotel list? Bookings you already made stay.`)) return;
    setSaving(true);
    await api.post('stays/delete', { id: stay.id }, { tripId: trip.id }).catch(() => {});
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={stay ? `Edit ${stay.city} stay` : 'Add a stay'}>
      <div className="space-y-4">
        {!stay && (
          <Field label="City">
            <Select value={destIdx} onChange={(e) => setDestIdx(Number(e.target.value))}>
              {trip.destinations.map((d, i) => (
                <option key={i} value={i}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check-in">
            <Input type="date" value={checkIn} min={trip.startDate} max={trip.endDate} onChange={(e) => e.target.value && setCheckIn(e.target.value)} />
          </Field>
          <Field label="Check-out">
            <Input type="date" value={checkOut} min={checkIn} max={trip.endDate} onChange={(e) => e.target.value && setCheckOut(e.target.value)} />
          </Field>
        </div>
        {stay && (
          <Field label="People per room" hint="Prices are per room. Changing this searches again.">
            <Select value={perRoom} onChange={(e) => setPerRoom(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </Select>
          </Field>
        )}
        <ErrorBanner>{error}</ErrorBanner>
        <div className="flex gap-3">
          {stay ? (
            <Button variant="secondary" onClick={() => void remove()} aria-label="Remove stay">
              <Trash2 className="w-4 h-4" />
            </Button>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button className="flex-1" loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
