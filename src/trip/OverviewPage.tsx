import { collection, limit, orderBy, query } from 'firebase/firestore';
import { ArrowRight, CalendarDays, Check, ChevronRight, Moon, SlidersHorizontal, Ticket, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ActivityEvent, Booking, paths } from '../domain';
import { fmtClock, PRAYER_LABEL, prayerTimesOn, type PrayerKey } from '../domain/prayer';
import { db } from '../firebase/config';
import { useQuery } from '../lib/firestore';
import { daysUntil, formatDateRange, localTimeIn, timeAgo, tripLengthDays } from '../lib/format';
import { Avatar, Button, cx } from '../ui';
import { useTrip } from './TripLayout';
import { NeedsYouStrip, useNeeds } from './ideas/NeedsYou';
import { NotificationsCard } from '../components/live/NotificationsCard';
import { TransportGaps } from './bookings/BookingsPage';
import { QiblaCard } from './qibla/Qibla';

const ORDER: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

/** YYYY-MM-DD and minutes-since-midnight in a timezone. */
function nowIn(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${v('year')}-${v('month')}-${v('day')}`, min: Number(v('hour')) * 60 + Number(v('minute')) };
}

export function OverviewPage() {
  const ctx = useTrip();
  const { trip, members, me, isAdmin } = ctx;
  const { needs } = useNeeds(ctx);
  const bookings = useQuery(`bookings:${trip.id}`, () => paths.bookings(trip.id), Booking);
  const activity = useQuery(
    `activity:${trip.id}`,
    () => query(collection(db, paths.activity(trip.id)), orderBy('at', 'desc'), limit(30)),
    ActivityEvent,
  );
  const byUid = new Map(members.map((m) => [m.uid, m]));
  const until = daysUntil(trip.startDate);
  const totalDays = tripLengthDays(trip);
  const onTrip = until <= 0 && daysUntil(trip.endDate) >= 0;
  const dayNo = onTrip ? 1 - until : 0;

  // Where the group is today (the destination whose dates cover today), else the first city.
  const here = useMemo(() => {
    const t = nowIn(trip.destinations[0].timezone).date;
    return trip.destinations.find((d) => d.arriveDate && d.leaveDate && t >= d.arriveDate && t <= d.leaveDate) ?? trip.destinations[0];
  }, [trip.destinations]);

  // Next prayer where the group is — computed on the device from the date and the city.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const next = useMemo(() => {
    if (!onTrip) return null;
    const { date, min } = nowIn(here.timezone);
    const p = prayerTimesOn(date, here.location, here.timezone, here.countryCode);
    const idx = ORDER.findIndex((k) => p.times[k] > min);
    if (idx === -1) {
      // After Isha: tomorrow's Fajr.
      const d = new Date(`${date}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      const fajr = prayerTimesOn(d.toISOString().slice(0, 10), here.location, here.timezone, here.countryCode).times.fajr;
      const left = 24 * 60 - min + fajr;
      return { name: PRAYER_LABEL.fajr, at: fajr, left, share: Math.min(1, Math.max(0, 1 - left / Math.max(1, 24 * 60 - p.times.isha + fajr))) };
    }
    const k = ORDER[idx];
    const prev = idx > 0 ? p.times[ORDER[idx - 1]] : p.times.isha - 24 * 60;
    const left = p.times[k] - min;
    return { name: PRAYER_LABEL[k], at: p.times[k], left, share: Math.min(1, Math.max(0, 1 - left / Math.max(1, p.times[k] - prev))) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onTrip, here, tick]);

  const myBooking = bookings.data.some((b) => b.travellerUids.includes(me.uid));
  const ready = [
    { done: members.length > 1, text: members.length > 1 ? `${members.length} people joined` : 'Invite your group', to: 'members', cta: 'Invite' },
    { done: !!me.prefs, text: 'Set your needs', sub: 'halal, prayer, budget, pace', to: 'preferences', cta: 'Set' },
    { done: myBooking, text: 'Add your flight or train', sub: 'upload the e-ticket', to: 'bookings', cta: 'Upload' },
  ];
  const doneCount = ready.filter((r) => r.done).length;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
      <div className="space-y-5 min-w-0">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-night text-white anim-rise">
          <div className="absolute inset-0 star-lattice opacity-60 [mask-image:linear-gradient(100deg,transparent_30%,#000)]" aria-hidden />
          <div className="relative p-5 md:p-7 flex items-center gap-5">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[.1em] text-gold-soft">
                {onTrip ? `Today · day ${dayNo} of ${totalDays}` : until > 0 ? `Starts in ${until} day${until === 1 ? '' : 's'}` : 'Trip finished'}
              </p>
              <h1 className="font-display text-[30px] md:text-[42px] leading-[1.05] font-semibold mt-1.5 break-words">{trip.name}</h1>
              <p className="text-sm text-white/75 mt-1 tabular-nums">
                {formatDateRange(trip.startDate, trip.endDate)} · {totalDays} days · {trip.currency}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-4 text-[13px] font-semibold">
                {trip.destinations.map((d, i) => (
                  <span key={`${d.placeId ?? d.name}-${i}`} className="inline-flex items-center gap-1.5">
                    {i > 0 && <ArrowRight className="w-3.5 h-3.5 text-white/50" />}
                    <span className="px-2.5 py-1 rounded-full bg-white/[.12]" title={`${localTimeIn(d.timezone)} local`}>
                      {d.name}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            {!onTrip && until > 0 && <Ring value={Math.max(0.04, 1 - Math.min(until, 60) / 60)} big={String(until)} small={until === 1 ? 'day to go' : 'days to go'} />}
          </div>
        </section>

        {/* During the trip: next prayer */}
        {next && (
          <section className="relative overflow-hidden rounded-3xl bg-night-2 text-white p-5 md:p-6 flex items-center gap-5 anim-rise" style={{ animationDelay: '60ms' }}>
            <div className="absolute inset-0 star-lattice opacity-40" aria-hidden />
            <Ring value={next.share} big={next.left >= 60 ? `${Math.floor(next.left / 60)}:${String(next.left % 60).padStart(2, '0')}` : `${next.left}m`} small={`to ${next.name}`} />
            <div className="relative flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[.1em] text-gold-soft">Next prayer · {here.name}</p>
              <p className="font-display text-3xl md:text-4xl font-semibold tabular-nums">
                {next.name} {fmtClock(next.at)}
              </p>
              <p className="text-sm text-white/70 mt-1">Prayer places for today are on the plan.</p>
            </div>
            <Link to="timeline" className="relative hidden sm:inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-gold text-night text-sm font-bold hover:bg-gold-soft">
              <CalendarDays className="w-4 h-4" /> Today's plan
            </Link>
          </section>
        )}

        <NeedsYouStrip needs={needs} tripId={trip.id} />

        {/* Before the trip: get ready */}
        {!onTrip && (
          <section className="bg-white border border-[#E7DFD5] rounded-2xl overflow-hidden anim-rise" style={{ animationDelay: '120ms' }}>
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="font-bold text-[#161C23]">Get ready</h2>
              <span className="text-[13px] font-semibold text-[#6D7A77] tabular-nums">
                {doneCount} of {ready.length} done
              </span>
            </div>
            <div className="mx-5 mb-3 h-1.5 rounded-full bg-[#F1EDE7] overflow-hidden">
              <div className="h-full rounded-full bg-[#00685F] anim-grow" style={{ width: `${(doneCount / ready.length) * 100}%` }} />
            </div>
            <ul>
              {ready.map((r) => (
                <li key={r.text} className="flex items-center gap-3 min-h-14 px-5 border-t border-[#F1EDE7] text-sm">
                  <span className={cx('w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-[1.5px]', r.done ? 'bg-[#00685F] border-[#00685F] text-white' : 'border-[#C9C1B6]')}>
                    {r.done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                  </span>
                  <span className={cx('flex-1 min-w-0', r.done && 'text-[#6D7A77] line-through')}>
                    {r.text}
                    {r.sub && !r.done && <span className="text-[#6D7A77] no-underline"> · {r.sub}</span>}
                  </span>
                  {!r.done && (
                    <Link to={r.to} className="shrink-0 inline-flex items-center min-h-9 px-3 rounded-xl border border-[#DDD5CA] bg-white text-xs font-bold text-[#161C23] hover:bg-[#F3EFE9]">
                      {r.cta}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!bookings.loading && (
          <Link to="bookings?tab=transport" className="block">
            <TransportGaps bookings={bookings.data} compact />
          </Link>
        )}
        <NotificationsCard compact />

        {!me.prefs && onTrip && (
          <Link to="preferences" className="flex items-center gap-3 p-4 rounded-2xl border border-[#00685F]/30 bg-[#00685F]/5 hover:border-[#00685F]/60">
            <span className="w-10 h-10 rounded-xl bg-[#00685F] text-white flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-5 h-5" />
            </span>
            <span className="flex-1">
              <span className="block font-bold text-[#161C23]">Set your travel needs</span>
              <span className="block text-sm text-[#6D7A77]">Budget, halal needs, prayer breaks and pace — the plan balances everyone's.</span>
            </span>
            <ChevronRight className="w-4 h-4 text-[#9AA5A3]" />
          </Link>
        )}
      </div>

      <div className="space-y-5 min-w-0">
        <QiblaCard fallback={{ name: here.name, lat: here.location.lat, lng: here.location.lng }} className="anim-rise" />

        <section className="bg-white border border-[#E7DFD5] rounded-2xl p-5 space-y-3 anim-rise" style={{ animationDelay: '80ms' }}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-[#161C23]">Your group · {members.length}</h2>
            {isAdmin && (
              <Link to="members">
                <Button variant="ghost" className="!min-h-9 !px-2.5">
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
              <span className="w-9 h-9 rounded-full bg-[#F3EFE9] ring-2 ring-white text-xs font-bold text-[#6D7A77] flex items-center justify-center">+{members.length - 8}</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat n={members.filter((m) => m.prefs?.prayerReminders).length} label="pray 5 times" icon={<Moon className="w-3.5 h-3.5" />} />
            <Stat n={members.filter((m) => !m.prefs).length} label="haven't set needs" />
          </div>
        </section>

        {!myBooking && onTrip && (
          <Link to="bookings" className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-[#E7DFD5] hover:border-[#00685F]/50">
            <span className="w-10 h-10 rounded-xl bg-[#EEF3F8] text-[#1D4E89] flex items-center justify-center shrink-0">
              <Ticket className="w-5 h-5" />
            </span>
            <span className="flex-1 text-sm">
              <b className="block text-[#161C23]">Add your flight or train</b>
              <span className="text-[#6D7A77]">Upload the e-ticket — it lands on the plan.</span>
            </span>
          </Link>
        )}

        <section className="bg-white border border-[#E7DFD5] rounded-2xl p-5 space-y-3 anim-rise" style={{ animationDelay: '140ms' }}>
          <h2 className="font-bold text-[#161C23]">Activity</h2>
          {activity.data.length === 0 ? (
            <p className="text-sm text-[#6D7A77]">{activity.loading ? 'Loading…' : 'Nothing yet.'}</p>
          ) : (
            <ul className="space-y-3">
              {activity.data.slice(0, 8).map((a) => {
                const actor = byUid.get(a.actorUid);
                return (
                  <li key={a.id} className="flex items-start gap-2.5 text-sm">
                    <Avatar name={actor?.displayName ?? 'Safar'} photoURL={actor?.photoURL} size={26} />
                    <div className="min-w-0">
                      <p className="text-[#161C23]">{a.text}</p>
                      <p className="text-xs text-[#9AA5A3]">{timeAgo(a.at)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ n, label, icon }: { n: number; label: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[#F4F1EC] px-3 py-2.5">
      <p className="font-display text-2xl font-semibold tabular-nums text-[#161C23]">{n}</p>
      <p className="flex items-center gap-1 text-xs text-[#6D7A77]">
        {icon}
        {label}
      </p>
    </div>
  );
}

/** Gold progress ring (countdown to the trip / to the next prayer). */
function Ring({ value, big, small }: { value: number; big: string; small: string }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" className="relative shrink-0" role="img" aria-label={`${big} ${small}`}>
      <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="7" />
      <circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke="#E2C27E"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        transform="rotate(-90 48 48)"
        style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)' }}
      />
      <text x="48" y="50" textAnchor="middle" fontSize="22" fontWeight="600" fill="#fff" fontFamily="Fraunces, Georgia, serif">
        {big}
      </text>
      <text x="48" y="66" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.75)">
        {small}
      </text>
    </svg>
  );
}
