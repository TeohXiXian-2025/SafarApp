import { collection, limit, orderBy, query } from 'firebase/firestore';
import { Clock, MapPin, SlidersHorizontal, Ticket, UserPlus } from 'lucide-react';
import { Link } from 'react-router';
import { ActivityEvent, Booking, paths } from '../domain';
import { db } from '../firebase/config';
import { useQuery } from '../lib/firestore';
import { daysUntil, localTimeIn, timeAgo, tripLengthDays } from '../lib/format';
import { Avatar, Badge, Button, Card } from '../ui';
import { useTrip } from './TripLayout';

export function OverviewPage() {
  const { trip, members, me, isAdmin } = useTrip();
  const bookings = useQuery(`bookings:${trip.id}`, () => paths.bookings(trip.id), Booking);
  const activity = useQuery(
    `activity:${trip.id}`,
    () => query(collection(db, paths.activity(trip.id)), orderBy('at', 'desc'), limit(30)),
    ActivityEvent,
  );
  const byUid = new Map(members.map((m) => [m.uid, m]));
  const until = daysUntil(trip.startDate);

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {!me.prefs && (
          <Nudge to="preferences" icon={<SlidersHorizontal className="w-5 h-5" />} title="Set your travel preferences" text="Budget, halal needs, prayer breaks and pace — the plan balances everyone's." />
        )}
        {!bookings.loading && !bookings.data.some((b) => b.travellerUids.includes(me.uid)) && (
          <Nudge to="bookings" icon={<Ticket className="w-5 h-5" />} title="Add your flight or train" text="Upload your e-ticket and AI puts it on the group timeline." />
        )}
        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{tripLengthDays(trip)} days</Badge>
            <Badge tone="muted">{trip.currency}</Badge>
            {until > 0 && <Badge tone="amber">Starts in {until} day{until === 1 ? '' : 's'}</Badge>}
          </div>
          <ol className="space-y-3">
            {trip.destinations.map((d, i) => (
              <li key={`${d.placeId ?? d.name}-${i}`} className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-[#00685F]/10 text-[#00685F] text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-[#161C23]">{d.name}</p>
                  <p className="text-xs text-[#6D7A77] flex flex-wrap items-center gap-x-3">
                    {d.address && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {d.address}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {localTimeIn(d.timezone)} local ({d.timezone})
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-[#161C23]">Group · {members.length}</h2>
            {isAdmin && (
              <Link to="members">
                <Button variant="ghost" className="min-h-9 px-2.5">
                  <UserPlus className="w-4 h-4" /> Invite
                </Button>
              </Link>
            )}
          </div>
          <div className="flex -space-x-2">
            {members.slice(0, 8).map((m) => (
              <span key={m.uid} className="ring-2 ring-white rounded-full" title={m.displayName}>
                <Avatar name={m.displayName} photoURL={m.photoURL} size={36} />
              </span>
            ))}
            {members.length > 8 && (
              <span className="w-9 h-9 rounded-full bg-[#F3EFE9] ring-2 ring-white text-xs font-bold text-[#6D7A77] flex items-center justify-center">
                +{members.length - 8}
              </span>
            )}
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="font-bold text-[#161C23]">Activity</h2>
          {activity.data.length === 0 ? (
            <p className="text-sm text-[#6D7A77]">{activity.loading ? 'Loading…' : 'Nothing yet.'}</p>
          ) : (
            <ul className="space-y-3">
              {activity.data.map((a) => {
                const actor = byUid.get(a.actorUid);
                return (
                  <li key={a.id} className="flex items-start gap-2.5 text-sm">
                    <Avatar name={actor?.displayName ?? 'Safar'} photoURL={actor?.photoURL} size={24} />
                    <div className="min-w-0">
                      <p className="text-[#161C23]">{a.text}</p>
                      <p className="text-xs text-[#9AA5A3]">{timeAgo(a.at)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Nudge({ to, icon, title, text }: { to: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className="block">
      <Card className="p-4 flex items-center gap-3 border-[#00685F]/30 bg-[#00685F]/5 hover:border-[#00685F]/60 transition-colors">
        <span className="w-10 h-10 rounded-xl bg-[#00685F] text-white flex items-center justify-center shrink-0">{icon}</span>
        <span>
          <span className="block font-bold text-[#161C23]">{title}</span>
          <span className="block text-sm text-[#6D7A77]">{text}</span>
        </span>
      </Card>
    </Link>
  );
}
