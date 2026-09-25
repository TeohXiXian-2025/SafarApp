// Bookings, in three tabs: Transport (flights, trains, buses, ferries — and
// the journeys still to book), Hotels (stays, hotel lists, hotel bookings)
// and Documents (the private vault).
import { Plus, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Booking, paths, Stay, transportGaps } from '../../domain';
import { useQuery } from '../../lib/firestore';
import { Button, Card, cx, ErrorBanner, Spinner } from '../../ui';
import { useTrip } from '../TripLayout';
import { AddBookingSheet } from './AddBookingSheet';
import { BookingCard, EditBookingSheet } from './BookingCard';
import { formatDay, localParts } from './format';
import { IncidentBanner } from './ResyncSheet';
import { StaysSection } from './StaysSection';
import { VaultSection } from './VaultSection';

const TABS = [
  ['transport', 'Transport'],
  ['stays', 'Hotels'],
  ['documents', 'Documents'],
] as const;
type Tab = (typeof TABS)[number][0];

export function BookingsPage() {
  const { trip, members, me } = useTrip();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const bookings = useQuery(`bookings:${trip.id}`, () => paths.bookings(trip.id), Booking);
  const [params, setParams] = useSearchParams();
  // Old links used ?tab=tickets for the full list.
  const tab: Tab = TABS.find(([t]) => t === params.get('tab'))?.[0] ?? 'transport';

  const byDay = useMemo(() => {
    const sorted = bookings.data.filter((b) => b.kind !== 'hotel').sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
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
          <p className="text-sm text-[#6D7A77]">Transport and hotels become fixed points on the timeline.</p>
        </div>
        {tab !== 'documents' && (
          <Button onClick={() => setAdding(true)} className="shrink-0">
            <Plus className="w-4 h-4" /> Add
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 rounded-xl bg-[#F3EFE9] p-1 text-sm font-semibold" role="tablist">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            type="button"
            onClick={() => setParams(t === 'transport' ? {} : { tab: t }, { replace: true })}
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
        <StaysSection bookings={bookings.data} onUpload={() => setAdding(true)} onEditBooking={setEditing} />
      ) : bookings.loading ? (
        <Spinner />
      ) : (
        <>
          <IncidentBanner bookings={bookings.data} />
          <TransportGaps bookings={bookings.data} />
          {byDay.length === 0 ? (
            <Card className="p-6 text-center space-y-3">
              <p className="font-bold text-[#161C23]">No transport yet</p>
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
                  <BookingCard key={b.id} booking={b} canEdit={b.createdBy === me.uid || me.role === 'admin'} isMine={b.createdBy === me.uid} onEdit={() => setEditing(b)} />
                ))}
              </section>
            ))
          )}
        </>
      )}

      <AddBookingSheet open={adding} onClose={() => setAdding(false)} tripId={trip.id} me={me} members={members} />
      {editing && <EditBookingSheet booking={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Journeys the plan needs that nobody has booked yet (also shown on the Overview). */
export function TransportGaps({ bookings, compact }: { bookings: Booking[]; compact?: boolean }) {
  const { trip } = useTrip();
  const stays = useQuery(`stays:${trip.id}`, () => paths.stays(trip.id), Stay);
  if (stays.loading) return null;
  const gaps = transportGaps({ startDate: trip.startDate, endDate: trip.endDate, destinations: trip.destinations, stays: stays.data, bookings });
  if (!gaps.length) return null;
  return (
    <div className="rounded-xl border border-[#F0D7A7] bg-[#FDF3E1] px-3.5 py-2.5 text-sm text-[#6B3F06] space-y-1">
      <p className="flex items-center gap-2 font-bold">
        <TriangleAlert className="w-4 h-4 shrink-0" /> {gaps.length === 1 ? 'A journey' : `${gaps.length} journeys`} still to book
      </p>
      <ul className="space-y-0.5 pl-6 list-disc">
        {gaps.map((g) => (
          <li key={g.key}>{g.text}</li>
        ))}
      </ul>
      {!compact && <p className="text-xs pl-6">Without them the timeline can't know when you arrive or leave each city — tap Add and upload the ticket.</p>}
    </div>
  );
}
