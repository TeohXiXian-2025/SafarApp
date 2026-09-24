import { collection, query, where } from 'firebase/firestore';
import { CalendarDays, Crown, MapPin, Plus, Users } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '../auth/auth';
import { AppHeader } from '../components/live/AppHeader';
import { paths, Trip } from '../domain';
import { db } from '../firebase/config';
import { useQuery } from '../lib/firestore';
import { daysUntil, formatDateRange } from '../lib/format';
import { Badge, Button, Card, ErrorBanner, Spinner } from '../ui';

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

  return (
    <div className="min-h-dvh bg-[#FAF8F5]">
      <AppHeader />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold text-[#161C23]">My trips</h1>
          <Link to="/trips/new">
            <Button>
              <Plus className="w-4 h-4" /> New trip
            </Button>
          </Link>
        </div>

        {trips.error && <ErrorBanner>Could not load your trips: {trips.error.message}</ErrorBanner>}

        {trips.loading ? (
          <Spinner label="Loading trips…" />
        ) : sorted.length === 0 ? (
          <Card className="p-8 text-center space-y-3">
            <p className="text-lg font-bold text-[#161C23]">No trips yet</p>
            <p className="text-sm text-[#6D7A77]">
              Create a trip and invite your group, or open an invite link a friend sent you.
            </p>
            <Link to="/trips/new" className="inline-block">
              <Button>
                <Plus className="w-4 h-4" /> Plan your first trip
              </Button>
            </Link>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {sorted.map((t) => (
              <li key={t.id}>
                <TripCard trip={t} isAdmin={t.adminId === uid} />
              </li>
            ))}
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
    <Link to={`/t/${trip.id}`} className="block">
      <Card className="p-4 space-y-3 hover:border-[#00685F]/40 transition-colors h-full">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-bold text-[#161C23] leading-snug">{trip.name}</h2>
          {isAdmin && (
            <Badge tone="amber">
              <Crown className="w-3 h-3" /> Admin
            </Badge>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-sm text-[#6D7A77]">
          <MapPin className="w-4 h-4 shrink-0 text-[#00685F]" />
          <span className="truncate">{trip.destinations.map((d) => d.name).join(' → ')}</span>
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#6D7A77]">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4" /> {formatDateRange(trip.startDate, trip.endDate)}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="w-4 h-4" /> {trip.memberIds.length}
          </span>
        </div>
        <Badge tone={ended ? 'muted' : 'brand'}>{when}</Badge>
      </Card>
    </Link>
  );
}
