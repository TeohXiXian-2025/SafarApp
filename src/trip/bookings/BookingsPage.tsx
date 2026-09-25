import { ArrowRight, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Booking, paths, type BookingDraft } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { useQuery } from '../../lib/firestore';
import { fileUrl } from '../../lib/storage';
import { Avatar, Badge, Button, Card, cx, ErrorBanner, Sheet, Spinner } from '../../ui';
import { useTrip } from '../TripLayout';
import { AddBookingSheet } from './AddBookingSheet';
import { BookingEditor, draftProblem, type EditableDraft } from './BookingEditor';
import { bookingTitle, dayDiff, formatDay, KIND, localParts, tzCity } from './format';
import { StaysSection } from './StaysSection';
import { VaultSection } from './VaultSection';

export function BookingsPage() {
  const { trip, members, me } = useTrip();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const bookings = useQuery(`bookings:${trip.id}`, () => paths.bookings(trip.id), Booking);
  const [params, setParams] = useSearchParams();
  const tab = (['stays', 'documents'] as const).find((t) => t === params.get('tab')) ?? 'tickets';

  const byDay = useMemo(() => {
    const sorted = [...bookings.data].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
    const groups = new Map<string, Booking[]>();
    for (const b of sorted) {
      const day = localParts(b.startAt).date;
      groups.set(day, [...(groups.get(day) ?? []), b]);
    }
    return [...groups];
  }, [bookings.data]);

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-[#161C23]">Bookings</h1>
          <p className="text-sm text-[#6D7A77]">Flights, trains and hotels. They become fixed points on the timeline.</p>
        </div>
        {tab !== 'documents' && (
          <Button onClick={() => setAdding(true)} className="shrink-0">
            <Plus className="w-4 h-4" /> Add
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 rounded-xl bg-[#F3EFE9] p-1 text-sm font-semibold" role="tablist">
        {(
          [
            ['tickets', 'All bookings'],
            ['stays', 'Hotels'],
            ['documents', 'Documents'],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            type="button"
            onClick={() => setParams(t === 'tickets' ? {} : { tab: t }, { replace: true })}
            className={cx('min-h-9 rounded-lg', tab === t ? 'bg-white text-[#00685F] shadow-xs' : 'text-[#6D7A77]')}
          >
            {label}
          </button>
        ))}
      </div>

      {bookings.error && <ErrorBanner>Could not load bookings: {bookings.error.message}</ErrorBanner>}

      {tab === 'documents' ? (
        <VaultSection />
      ) : tab === 'stays' ? (
        <StaysSection bookings={bookings.data} onUpload={() => setAdding(true)} />
      ) : bookings.loading ? (
        <Spinner />
      ) : byDay.length === 0 ? (
        <Card className="p-6 text-center space-y-3">
          <p className="font-bold text-[#161C23]">No bookings yet</p>
          <p className="text-sm text-[#6D7A77]">Upload an e-ticket or screenshot and AI fills in the details — or type them in.</p>
          <Button onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" /> Add your first booking
          </Button>
        </Card>
      ) : (
        byDay.map(([day, list]) => (
          <section key={day} className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#6D7A77]">{formatDay(day)}</h2>
            {list.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                canEdit={b.createdBy === me.uid || me.role === 'admin'}
                isMine={b.createdBy === me.uid}
                onEdit={() => setEditing(b)}
              />
            ))}
          </section>
        ))
      )}

      <AddBookingSheet open={adding} onClose={() => setAdding(false)} tripId={trip.id} me={me} members={members} />
      {editing && <EditBookingSheet booking={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BookingCard({ booking: b, canEdit, isMine, onEdit }: { booking: Booking; canEdit: boolean; isMine: boolean; onEdit: () => void }) {
  const { trip, members } = useTrip();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const k = KIND[b.kind];
  const Icon = k.icon;
  const start = localParts(b.startAt);
  const end = localParts(b.endAt);
  const plusDays = dayDiff(start.date, end.date);
  const outside = end.date < trip.startDate || start.date > trip.endDate;
  const travellers = members.filter((m) => b.travellerUids.includes(m.uid));

  const remove = async () => {
    if (!confirm(`Delete this ${k.label.toLowerCase()} booking?`)) return;
    setBusy(true);
    try {
      await api.post('bookings/delete', { id: b.id }, { tripId: trip.id });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete.');
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-[#161C23]">{bookingTitle(b)}</p>
            {b.pnr && <Badge tone="muted">Ref {b.pnr}</Badge>}
            {outside && <Badge tone="amber">Outside trip dates</Badge>}
          </div>
          {b.kind === 'hotel' ? (
            <p className="text-sm text-[#6D7A77] truncate">{b.to.address ?? b.to.name}</p>
          ) : (
            <p className="text-sm text-[#6D7A77] flex items-center gap-1.5 min-w-0">
              <span className="truncate">{b.from?.name}</span> <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{b.to.name}</span>
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#FAF8F5] p-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#6D7A77]">{b.kind === 'hotel' ? 'Check-in' : 'Depart'}</p>
          <p className="text-lg font-extrabold text-[#161C23]">{start.time}</p>
          <p className="text-xs text-[#6D7A77]">
            {formatDay(start.date)} · {tzCity((b.from ?? b.to).timezone)} time
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#6D7A77]">{b.kind === 'hotel' ? 'Check-out' : 'Arrive'}</p>
          <p className="text-lg font-extrabold text-[#161C23]">
            {end.time}
            {plusDays > 0 && b.kind !== 'hotel' && <sup className="text-xs text-[#96590B] ml-0.5">+{plusDays}</sup>}
          </p>
          <p className="text-xs text-[#6D7A77]">
            {formatDay(end.date)} · {tzCity(b.to.timezone)} time
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex -space-x-1.5">
            {travellers.slice(0, 5).map((m) => (
              <span key={m.uid} className="ring-2 ring-white rounded-full" title={m.displayName}>
                <Avatar name={m.displayName} photoURL={m.photoURL} size={24} />
              </span>
            ))}
          </div>
          <span className="text-xs text-[#6D7A77] truncate">{travellers.map((m) => m.displayName).join(', ')}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          {isMine && b.fileRef && (
            <IconBtn label="View original ticket" onClick={() => void fileUrl(b.fileRef!).then((u) => window.open(u, '_blank', 'noopener'))}>
              <FileText className="w-4 h-4" />
            </IconBtn>
          )}
          {canEdit && (
            <>
              <IconBtn label="Edit booking" onClick={onEdit}>
                <Pencil className="w-4 h-4" />
              </IconBtn>
              <IconBtn label="Delete booking" onClick={remove} disabled={busy} danger>
                <Trash2 className="w-4 h-4" />
              </IconBtn>
            </>
          )}
        </div>
      </div>
      <ErrorBanner>{error}</ErrorBanner>
    </Card>
  );
}

function EditBookingSheet({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { trip, members } = useTrip();
  const [draft, setDraft] = useState<EditableDraft>(() => ({
    kind: booking.kind,
    carrier: booking.carrier,
    number: booking.number,
    pnr: booking.pnr,
    from: booking.from,
    to: booking.to,
    startLocal: booking.startAt.slice(0, 16),
    endLocal: booking.endAt.slice(0, 16),
    passengerNames: booking.passengerNames,
    travellerUids: booking.travellerUids,
    notes: booking.notes,
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const problem = draftProblem(draft);
    if (problem) return setError(problem);
    setSaving(true);
    try {
      // Places still carry their stored `timezone`; the server ignores it and recomputes.
      await api.post('bookings/update', { id: booking.id, draft: draft as BookingDraft }, { tripId: trip.id });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Edit booking" wide>
      <div className="space-y-4">
        <BookingEditor value={draft} onChange={(d) => (setDraft(d), setError(''))} members={members} />
        <ErrorBanner>{error}</ErrorBanner>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" loading={saving} onClick={save}>
            Save changes
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-9 h-9 rounded-lg inline-flex items-center justify-center border border-[#E7DFD5] disabled:opacity-50 ${
        danger ? 'text-[#B3261E] hover:bg-[#FDECEA]' : 'text-[#6D7A77] hover:bg-[#F3EFE9]'
      }`}
    >
      {children}
    </button>
  );
}
