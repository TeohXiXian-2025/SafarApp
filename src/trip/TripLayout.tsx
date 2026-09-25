import { CalendarDays, LayoutDashboard, Lightbulb, Settings, Ticket, Users, UtensilsCrossed } from 'lucide-react';
import { useMemo } from 'react';
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router';
import { useAuth } from '../auth/auth';
import { AppHeader } from '../components/live/AppHeader';
import { Member, paths, Trip } from '../domain';
import { useDoc, useQuery } from '../lib/firestore';
import { formatDateRange } from '../lib/format';
import { Button, Card, cx, Spinner } from '../ui';
import { useNeeds } from './ideas/NeedsYou';

export interface TripCtx {
  trip: Trip;
  members: Member[];
  me: Member;
  isAdmin: boolean;
}

export const useTrip = () => useOutletContext<TripCtx>();

const TABS = [
  { to: '', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: 'ideas', label: 'Ideas', icon: Lightbulb },
  { to: 'timeline', label: 'Timeline', icon: CalendarDays },
  { to: 'food', label: 'Food', icon: UtensilsCrossed },
  { to: 'bookings', label: 'Bookings', icon: Ticket },
  { to: 'members', label: 'Group', icon: Users },
  // On phones Settings is reached from the Group page (keeps the bar at 6).
  { to: 'settings', label: 'Settings', icon: Settings, desktopOnly: true },
];

export function TripLayout() {
  const { tripId = '' } = useParams();
  const uid = useAuth((s) => s.user?.uid);
  const trip = useDoc(paths.trip(tripId), Trip);
  const members = useQuery(`members:${tripId}`, () => paths.members(tripId), Member);

  const me = members.data.find((m) => m.uid === uid);
  // A cached member list can be stale (e.g. you just joined). If you're not in
  // it, wait for the server before deciding you have no access.
  const awaitingServer = navigator.onLine && ((!me && members.fromCache) || (!trip.data && trip.fromCache));
  const loading = trip.loading || members.loading || awaitingServer;

  const ctx: TripCtx | null = useMemo(
    () => (trip.data && me ? { trip: trip.data, members: sortMembers(members.data), me, isAdmin: me.role === 'admin' } : null),
    [trip.data, me, members.data],
  );
  // Things waiting on me (votes, middle grounds, decisions) → a badge on the Ideas tab.
  const badge = useNeeds(ctx).needs.length;

  if (!loading && (!trip.data || !me)) {
    // Not found, no permission, or just removed from the trip.
    return (
      <div className="min-h-dvh bg-[#FAF8F5]">
        <AppHeader />
        <main className="max-w-md mx-auto px-4 py-16">
          <Card className="p-6 text-center space-y-3">
            <p className="text-lg font-bold text-[#161C23]">Trip not available</p>
            <p className="text-sm text-[#6D7A77]">It may have been deleted, or you're not a member. Ask the admin for an invite link.</p>
            <Link to="/trips" className="inline-block">
              <Button variant="secondary">Back to my trips</Button>
            </Link>
          </Card>
        </main>
      </div>
    );
  }


  return (
    <div className="min-h-dvh bg-[#FAF8F5]">
      <AppHeader>
        {ctx && (
          <div className="min-w-0">
            <p className="font-bold text-[#161C23] truncate leading-tight">{ctx.trip.name}</p>
            <p className="text-xs text-[#6D7A77] truncate">{formatDateRange(ctx.trip.startDate, ctx.trip.endDate)}</p>
          </div>
        )}
      </AppHeader>

      {/* Desktop / tablet tabs */}
      <nav className="hidden md:block border-b border-[#E7DFD5] bg-[#FAF8F5]">
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {TABS.map((t) => (
            <NavLink
              key={t.label}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2 px-3 py-3 text-sm font-semibold border-b-2 -mb-px',
                  isActive ? 'border-[#00685F] text-[#00685F]' : 'border-transparent text-[#6D7A77] hover:text-[#161C23]',
                )
              }
            >
              <t.icon className="w-4 h-4" /> {t.label}
              {t.to === 'ideas' && badge > 0 && <Badge count={badge} />}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:pb-10">
        {ctx ? <Outlet context={ctx} /> : <Spinner label="Loading trip…" />}
      </main>

      {/* Phone bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#E7DFD5] pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-6">
          {TABS.filter((t) => !t.desktopOnly).map((t) => (
            <NavLink
              key={t.label}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold', isActive ? 'text-[#00685F]' : 'text-[#6D7A77]')
              }
            >
              <span className="relative">
                <t.icon className="w-5 h-5" />
                {t.to === 'ideas' && badge > 0 && <Badge count={badge} floating />}
              </span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Badge({ count, floating }: { count: number; floating?: boolean }) {
  return (
    <span
      aria-label={`${count} waiting for you`}
      className={cx('min-w-4 h-4 px-1 rounded-full bg-[#B3261E] text-white text-[10px] font-bold leading-4 text-center', floating && 'absolute -top-1.5 -right-2.5')}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

/** Admin first, then by join date. */
function sortMembers(ms: Member[]) {
  return [...ms].sort((a, b) => (a.role === b.role ? a.joinedAt - b.joinedAt : a.role === 'admin' ? -1 : 1));
}
