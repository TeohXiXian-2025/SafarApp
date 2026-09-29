import { ChevronRight, Lock, Settings, SlidersHorizontal, Ticket, Users, Wallet, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { formatDateRange } from '../lib/format';
import { cx } from '../ui';
import { useTrip } from './TripLayout';

/**
 * Phone "Trip" tab: the trip kit in one list (laptops have these in the sidebar).
 * Pure navigation — no reads of its own.
 */
export function TripHubPage() {
  const { trip, members, me } = useTrip();
  const rows: { to: string; label: string; text: string; icon: LucideIcon; tone: string }[] = [
    { to: '../bookings', label: 'Bookings', text: 'Flights, trains, hotels · delay help', icon: Ticket, tone: 'bg-[#EEF3F8] text-[#1D4E89]' },
    { to: '../money', label: 'Money', text: 'Expenses, receipts, settle up', icon: Wallet, tone: 'bg-[#FDF1E1] text-[#8A4B06]' },
    { to: '../members', label: 'People', text: `${members.length} ${members.length === 1 ? 'person' : 'people'} · invites`, icon: Users, tone: 'bg-[#E8F2F0] text-[#00685F]' },
    { to: '../preferences', label: 'My needs', text: me.prefs ? 'Halal, prayer, budget, pace — set' : 'Not set yet — the plan balances everyone', icon: SlidersHorizontal, tone: 'bg-[#E8F2F0] text-[#00685F]' },
    { to: '../bookings?tab=documents', label: 'Documents', text: 'Private — only you can open yours', icon: Lock, tone: 'bg-night text-gold-soft' },
  ];
  return (
    <div className="space-y-5 -mx-4 md:mx-0">
      <section className="relative mx-4 md:mx-0 overflow-hidden rounded-3xl bg-night text-white p-5">
        <div className="absolute inset-0 star-lattice opacity-70" aria-hidden />
        <p className="relative text-[11px] font-bold uppercase tracking-[.08em] text-gold-soft">Your trip</p>
        <h1 className="relative font-display text-[28px] font-semibold leading-tight mt-1">{trip.name}</h1>
        <p className="relative text-sm text-white/75 tabular-nums">
          {formatDateRange(trip.startDate, trip.endDate)} · {trip.destinations.map((d) => d.name).join(', ')}
        </p>
      </section>
      <div>
        <p className="px-4 md:px-0 pb-2 text-[11px] font-bold uppercase tracking-[.08em] text-[#6D7A77]">Trip kit</p>
        <HubList rows={rows} />
      </div>
      <div>
        <p className="px-4 md:px-0 pb-2 text-[11px] font-bold uppercase tracking-[.08em] text-[#6D7A77]">Trip</p>
        <HubList rows={[{ to: '../settings', label: 'Trip settings', text: 'Dates, cities, alerts', icon: Settings, tone: 'bg-[#F4F1EC] text-[#45524F]' }]} />
      </div>
    </div>
  );
}

function HubList({ rows }: { rows: { to: string; label: string; text: string; icon: LucideIcon; tone: string }[] }) {
  return (
    <div className="bg-white border-y md:border md:rounded-2xl border-[#E7DFD5] overflow-hidden">
      {rows.map((r, i) => (
        <Link
          key={r.label}
          to={r.to}
          relative="path"
          className={cx('flex items-center gap-3.5 min-h-[68px] px-4 hover:bg-[#FAF8F5] anim-rise', i > 0 && 'border-t border-[#F1EDE7]')}
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <span className={cx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', r.tone)}>
            <r.icon className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-bold text-[#161C23]">{r.label}</span>
            <span className="block text-xs text-[#6D7A77] truncate">{r.text}</span>
          </span>
          <ChevronRight className="w-4 h-4 text-[#9AA5A3]" />
        </Link>
      ))}
    </div>
  );
}
