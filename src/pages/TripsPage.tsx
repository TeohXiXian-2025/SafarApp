import { collection, query, where } from 'firebase/firestore';
import { CalendarDays, Crown, MapPin, Plus, Users } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '../auth/auth';
import { AppHeader } from '../components/live/AppHeader';
import { paths, Trip } from '../domain';
import { db } from '../firebase/config';
import { useQuery } from '../lib/firestore';
import { daysUntil, formatDateRange } from '../lib/format';
import { InstallBanner } from '../pwa/InstallBanner';
import { Button, Card, cx, ErrorBanner, Spinner } from '../ui';

export function TripsPage() {
  const uid = useAuth((s) => s.user?.uid);
  const trips = useQuery(
    uid ? `my-trips:${uid}` : null,
    () => query(collection(db, paths.trips()), where('memberIds', 'array-contains', uid)),
    Trip,
  );

  // Upcoming first (soonest start), finished trips last.
  const sorted = [...trips.data].sort((a, b) => {
    const aDone = daysUntil(a.endDate) < 0;
    const bDone = daysUntil(b.endDate) < 0;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return aDone ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate);
  });

  const name = useAuth((st) => st.user?.displayName?.split(' ')[0]);
  return (
    <div className="min-h-dvh bg-[#FAF8F5]">
      <AppHeader />
      <section className="relative overflow-hidden bg-night text-white">
        <div className="absolute inset-0 star-lattice opacity-60 [mask-image:linear-gradient(100deg,transparent_25%,#000)]" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[.1em] text-gold-soft">{name ? `Assalamualaikum, ${name}` : 'Welcome back'}</p>
            <h1 className="font-display text-4xl md:text-5xl font-semibold mt-1">Your trips</h1>
          </div>
          <Link to="/trips/new">
            <Button variant="gold" className="!min-h-12 !px-5">
              <Plus className="w-4 h-4" /> New trip
            </Button>
          </Link>
        </div>
      </section>
      <main className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-5 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <InstallBanner />

        {trips.error && <ErrorBanner>Could not load your trips: {trips.error.message}</ErrorBanner>}

        {trips.loading ? (
          <Spinner label="Loading trips…" />
        ) : sorted.length === 0 ? (
          <Card className="p-8 md:p-12 text-center space-y-3">
            <p className="font-display text-3xl font-semibold text-[#161C23]">Plan your first trip</p>
            <p className="text-sm text-[#6D7A77] max-w-md mx-auto">Create a trip and invite your group, or open an invite link a friend sent you.</p>
            <Link to="/trips/new" className="inline-block">
              <Button>
                <Plus className="w-4 h-4" /> Plan your first trip
              </Button>
            </Link>
          </Card>
        ) : (
          <ul className="grid gap-4 md:gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((t, i) => (
              <li key={t.id} className="anim-rise" style={{ animationDelay: `${i * 60}ms` }}>
                <TripCard trip={t} isAdmin={t.adminId === uid} />
              </li>
            ))}
            <li>
              <Link to="/trips/new" className="h-full min-h-[220px] rounded-3xl border-2 border-dashed border-[#C9C1B6] flex flex-col items-center justify-center gap-2 text-center p-6 hover:border-[#00685F]/50 hover:bg-white">
                <span className="w-14 h-14 rounded-2xl bg-night text-gold-soft flex items-center justify-center">
                  <Plus className="w-6 h-6" />
                </span>
                <span className="font-display text-xl font-semibold text-[#161C23]">Plan a new trip</span>
                <span className="text-sm text-[#6D7A77]">Where, when and who's coming</span>
              </Link>
            </li>
          </ul>
        )}
      </main>
    </div>
  );
}

function TripCard({ trip, isAdmin }: { trip: Trip; isAdmin: boolean }) {
  const until = daysUntil(trip.startDate);
  const ended = daysUntil(trip.endDate) < 0;
  const when = ended ? 'Finished' : until > 0 ? `In ${until} day${until === 1 ? '' : 's'}` : until === 0 ? 'Starts today' : 'On the trip now';

  return (
    <Link to={`/t/${trip.id}`} className="group block h-full">
      <div className={cx('relative h-full min-h-[220px] rounded-3xl overflow-hidden p-5 flex flex-col text-white transition-transform group-hover:-translate-y-0.5', ended ? 'bg-[#45524F]' : 'bg-night')}>
        <div className="absolute inset-0 star-lattice opacity-50" aria-hidden />
        <span className="absolute -right-4 -top-6 font-display text-[140px] leading-none font-semibold text-white/[.06] select-none" aria-hidden>
          {trip.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="relative flex items-center gap-2">
          <span className={cx('inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-bold', ended ? 'bg-white/15 text-white' : 'bg-gold text-night')}>{when}</span>
          {isAdmin && (
            <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-white/10 text-[11px] font-bold">
              <Crown className="w-3 h-3" /> Admin
            </span>
          )}
        </div>
        <div className="relative mt-auto pt-10">
          <h2 className="font-display text-2xl font-semibold leading-tight">{trip.name}</h2>
          <p className="flex items-center gap-1.5 text-sm text-white/75 mt-1">
            <MapPin className="w-4 h-4 shrink-0 text-gold-soft" />
            <span className="truncate">{trip.destinations.map((d) => d.name).join(' → ')}</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/70 mt-2">
            <span className="flex items-center gap-1.5 tabular-nums">
              <CalendarDays className="w-4 h-4" /> {formatDateRange(trip.startDate, trip.endDate)}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4" /> {trip.memberIds.length}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
