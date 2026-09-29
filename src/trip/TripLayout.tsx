import {
  CalendarDays,
  ChevronLeft,
  ChevronsUpDown,
  House,
  Lightbulb,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Receipt,
  Settings,
  Ticket,
  UserPlus,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router';
import { useAuth } from '../auth/auth';
import { AccountMenu, AppHeader } from '../components/live/AppHeader';
import { InboxBell } from '../components/live/InboxBell';
import { Booking, Idea, Member, paths, ScheduleItem, Split, Stay, Trip } from '../domain';
import { useDoc, useQuery } from '../lib/firestore';
import { formatDateRange } from '../lib/format';
import { prefs } from '../pwa/pwa';
import { Avatar, Button, Card, cx, SafarMark, Sheet, Spinner } from '../ui';
import { AddBookingSheet } from './bookings/AddBookingSheet';
import { ExpenseSheet } from './expenses/ExpenseSheet';
import { AddIdeaSheet } from './ideas/AddIdeaSheet';
import { useNeeds } from './ideas/NeedsYou';
import { DemoLayer } from './demo/DemoLayer';

export interface TripCtx {
  trip: Trip;
  members: Member[];
  me: Member;
  isAdmin: boolean;
}

// Pages get the trip through the router's outlet context. Things the layout
// renders itself (the "+ New" sheets) read the same value from this context.
const TripContext = createContext<TripCtx | null>(null);

export const useTrip = () => {
  const own = useContext(TripContext);
  const outlet = useOutletContext<TripCtx>();
  return own ?? outlet;
};

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

// Paths are unchanged (links saved in Firestore point at them); only labels moved.
const PLAN_NAV: NavItem[] = [
  { to: '', label: 'Home', icon: House, end: true },
  { to: 'timeline', label: 'Plan', icon: CalendarDays },
  { to: 'ideas', label: 'Ideas', icon: Lightbulb },
  { to: 'food', label: 'Food', icon: UtensilsCrossed },
];
const KIT_NAV: NavItem[] = [
  { to: 'bookings', label: 'Bookings', icon: Ticket },
  { to: 'money', label: 'Money', icon: Wallet },
  { to: 'members', label: 'People', icon: Users },
];
// Phone: 4 tabs + "Trip" (a hub for Bookings, Money, People, Settings).
const TRIP_HUB = /\/(more|bookings|money|members|preferences|settings)(\/|$)/;

const NAV_KEY = 'safar:nav-collapsed';

type NewSheet = 'idea' | 'booking' | 'expense' | 'menu' | null;

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function TripLayout() {
  const { tripId = '' } = useParams();
  const uid = useAuth((s) => s.user?.uid);
  const trip = useDoc(paths.trip(tripId), Trip);
  const members = useQuery(`members:${tripId}`, () => paths.members(tripId), Member);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const me = members.data.find((m) => m.uid === uid);
  // A cached member list can be stale (e.g. you just joined). If you're not in
  // it, wait for the server before deciding you have no access.
  const awaitingServer = navigator.onLine && ((!me && members.fromCache) || (!trip.data && trip.fromCache));
  const loading = trip.loading || members.loading || awaitingServer;

  const ctx: TripCtx | null = useMemo(
    () => (trip.data && me ? { trip: trip.data, members: sortMembers(members.data), me, isAdmin: me.role === 'admin' } : null),
    [trip.data, me, members.data],
  );
  // Things waiting on me (votes, middle grounds, decisions) → a badge on Ideas.
  const badge = useNeeds(ctx).needs.length;

  const [collapsed, setCollapsed] = useState(() => prefs.get(NAV_KEY) === '1');
  const toggleNav = () =>
    setCollapsed((c) => {
      prefs.set(NAV_KEY, c ? '0' : '1');
      return !c;
    });
  const [sheet, setSheet] = useState<NewSheet>(null);
  const [newMenu, setNewMenu] = useState(false);

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

  const today = localToday();
  const onTrip = !!ctx && today >= ctx.trip.startDate && today <= ctx.trip.endDate;
  const homeLabel = onTrip ? 'Today' : 'Home';
  const inHub = TRIP_HUB.test(pathname);
  // The phone "+" opens the add menu on Home and Plan (Ideas has its own Add).
  const showFab = /^\/t\/[^/]+\/?(timeline)?\/?$/.test(pathname);

  const pick = (s: Exclude<NewSheet, null>) => {
    setNewMenu(false);
    setSheet(s);
  };

  return (
    <TripContext.Provider value={ctx}>
      <div className="min-h-dvh bg-[#FAF8F5] md:flex">
        {/* Laptop / tablet: night sidebar. Collapses to an icon rail (always a rail on tablets). */}
        <nav
          aria-label="Trip"
          className={cx(
            'hidden md:flex sticky top-0 h-dvh shrink-0 flex-col bg-night text-white py-3.5 transition-[width] duration-200',
            collapsed ? 'w-[68px] px-3 items-center' : 'w-[68px] px-3 items-center lg:w-[236px] lg:items-stretch',
          )}
        >
          <Link to="/trips" className={cx('flex items-center gap-2.5 px-1 pb-3.5', !collapsed && 'lg:px-1')} aria-label="My trips">
            <span className="w-10 h-10 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
              <SafarMark className="w-6 h-6" />
            </span>
            <span className={cx('font-display text-xl font-semibold', collapsed ? 'hidden' : 'hidden lg:inline')}>Safar</span>
          </Link>
          {ctx && (
            <Link
              to="/trips"
              title="Switch trip"
              className={cx('items-center gap-2.5 p-2 rounded-xl bg-white/[.06] hover:bg-white/10 mb-1', collapsed ? 'hidden' : 'hidden lg:flex')}
            >
              <span className="w-10 h-10 rounded-lg bg-gold/20 text-gold-soft font-display text-lg font-semibold flex items-center justify-center shrink-0">
                {ctx.trip.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold truncate">{ctx.trip.name}</span>
                <span className="block text-[11px] text-white/60 truncate">{formatDateRange(ctx.trip.startDate, ctx.trip.endDate)}</span>
              </span>
              <ChevronsUpDown className="w-4 h-4 text-white/50 shrink-0" />
            </Link>
          )}
          <NavGroup label="Plan the trip" items={PLAN_NAV.map((n) => (n.to === '' ? { ...n, label: homeLabel } : n))} badge={badge} collapsed={collapsed} />
          <NavGroup label="Trip kit" items={KIT_NAV} badge={badge} collapsed={collapsed} />
          <span className="flex-1" />
          <SideLink item={{ to: 'settings', label: 'Trip settings', icon: Settings }} collapsed={collapsed} />
          <button
            type="button"
            onClick={toggleNav}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            className="hidden lg:flex mt-1 h-10 rounded-xl items-center gap-3 px-3 text-white/60 hover:text-white hover:bg-white/10"
          >
            {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
            {!collapsed && <span className="text-[13px] font-semibold">Collapse</span>}
          </button>
        </nav>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Top bar. Phone: back · trip · bell · account. Laptop: trip · people · New · bell · account. */}
          <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#E7DFD5] pt-[env(safe-area-inset-top)]">
            <div className="h-14 px-2 md:px-6 flex items-center gap-2 md:gap-3">
              <Link to="/trips" aria-label="All trips" className="md:hidden w-11 h-11 rounded-xl inline-flex items-center justify-center text-[#45524F] hover:bg-black/5">
                <ChevronLeft className="w-5 h-5" />
              </Link>
              {ctx && (
                <div className="min-w-0 flex-1 flex items-baseline gap-3">
                  <p className="font-bold text-[#161C23] truncate leading-tight">{ctx.trip.name}</p>
                  <p className="hidden sm:block text-[13px] text-[#6D7A77] truncate tabular-nums">{formatDateRange(ctx.trip.startDate, ctx.trip.endDate)}</p>
                  {onTrip && <span className="hidden sm:inline-flex h-6 px-2.5 rounded-full bg-gold/15 text-gold-ink text-[11px] font-bold items-center">On the trip</span>}
                </div>
              )}
              {ctx && (
                <Link to="members" className="hidden lg:flex -space-x-2 mr-1" aria-label={`${ctx.members.length} people`}>
                  {ctx.members.slice(0, 5).map((m) => (
                    <span key={m.uid} className="ring-2 ring-white rounded-full" title={m.displayName}>
                      <Avatar name={m.displayName} photoURL={m.photoURL} size={28} />
                    </span>
                  ))}
                  {ctx.members.length > 5 && (
                    <span className="w-7 h-7 rounded-full bg-[#F1EDE7] ring-2 ring-white text-[11px] font-bold text-[#45524F] flex items-center justify-center">+{ctx.members.length - 5}</span>
                  )}
                </Link>
              )}
              {ctx && (
                <div className="relative hidden md:block">
                  <Button className="!min-h-10" onClick={() => setNewMenu((o) => !o)} aria-expanded={newMenu} aria-haspopup="menu">
                    <Plus className="w-4 h-4" /> New
                  </Button>
                  {newMenu && <NewMenu onPick={pick} onInvite={() => (setNewMenu(false), navigate('members'))} onClose={() => setNewMenu(false)} />}
                </div>
              )}
              <InboxBell />
              <span className="hidden md:inline-flex">
                <AccountMenu size={32} />
              </span>
            </div>
          </header>
          {ctx?.trip.demo && <DemoLayer trip={ctx.trip} uid={ctx.me.uid} />}

          <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 md:px-6 lg:px-8 py-5 md:py-6 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:pb-10">
            {ctx && <KeepTripLive tripId={ctx.trip.id} />}
            {ctx ? <Outlet context={ctx} /> : <Spinner label="Loading trip…" />}
          </main>
        </div>

        {/* Phone: 5 tabs. Paths unchanged; "Trip" is the hub for the trip kit. */}
        <nav aria-label="Trip" className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#E7DFD5] pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5">
            {PLAN_NAV.map((t) => (
              <TabLink key={t.label} item={t.to === '' ? { ...t, label: homeLabel } : t} badge={t.to === 'ideas' ? badge : 0} />
            ))}
            <NavLink to="more" className={cx('relative flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-semibold', inHub ? 'text-night font-bold' : 'text-[#6D7A77]')}>
              {inHub && <span className="absolute top-0 left-1/2 -ml-3.5 w-7 h-[3px] rounded-b bg-gold" aria-hidden />}
              <Menu className="w-5 h-5" />
              Trip
            </NavLink>
          </div>
        </nav>

        {ctx && showFab && (
          <button
            type="button"
            onClick={() => setSheet('menu')}
            aria-label="Add to this trip"
            className={cx(
              'md:hidden fixed right-4 z-30 w-14 h-14 rounded-2xl bg-[#00685F] text-white shadow-[0_10px_24px_rgba(0,104,95,.35)] inline-flex items-center justify-center',
              // On Plan the "Unplanned" tray sits above the tab bar — float above it.
              /timeline\/?$/.test(pathname) ? 'bottom-[calc(env(safe-area-inset-bottom)+8.4rem)]' : 'bottom-[calc(env(safe-area-inset-bottom)+5.5rem)]',
            )}
          >
            <Plus className="w-6 h-6" />
          </button>
        )}

        {ctx && (
          <>
            <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title="Add to this trip">
              <div className="space-y-2.5">
                <NewOptions onPick={pick} onInvite={() => (setSheet(null), navigate('members'))} big />
              </div>
            </Sheet>
            <AddIdeaSheet open={sheet === 'idea'} onClose={() => setSheet(null)} />
            <AddBookingSheet open={sheet === 'booking'} onClose={() => setSheet(null)} tripId={ctx.trip.id} me={ctx.me} members={ctx.members} />
            {sheet === 'expense' && <ExpenseSheet onClose={() => setSheet(null)} />}
          </>
        )}
      </div>
    </TripContext.Provider>
  );
}

function NavGroup({ label, items, badge, collapsed }: { label: string; items: NavItem[]; badge: number; collapsed: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 w-full">
      <p className={cx('text-[10px] font-bold uppercase tracking-[.1em] text-white/40 px-3 pt-4 pb-1.5', collapsed ? 'hidden' : 'hidden lg:block')}>{label}</p>
      <span className={cx('h-px bg-white/10 my-2 mx-2', collapsed ? 'block' : 'block lg:hidden')} aria-hidden />
      {items.map((i) => (
        <SideLink key={i.to} item={i} badge={i.to === 'ideas' ? badge : 0} collapsed={collapsed} />
      ))}
    </div>
  );
}

function SideLink({ item, badge = 0, collapsed }: { item: NavItem; badge?: number; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={item.label}
      className={({ isActive }) =>
        cx(
          'relative h-10 rounded-xl flex items-center gap-3 text-[13px] font-semibold transition-colors',
          collapsed ? 'w-11 justify-center' : 'w-11 justify-center lg:w-auto lg:justify-start lg:px-3',
          isActive ? 'bg-white/10 text-white' : 'text-white/65 hover:text-white hover:bg-white/5',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute -left-3 top-2.5 bottom-2.5 w-[3px] rounded-r bg-gold" aria-hidden />}
          <item.icon className="w-[18px] h-[18px] shrink-0" />
          <span className={collapsed ? 'sr-only' : 'sr-only lg:not-sr-only'}>{item.label}</span>
          {badge > 0 && (
            <span
              aria-label={`${badge} waiting for you`}
              className={cx(
                'min-w-4 h-4 px-1 rounded-full bg-[#E0483D] text-white text-[10px] font-bold leading-4 text-center',
                collapsed ? 'absolute top-0.5 right-0.5' : 'absolute top-0.5 right-0.5 lg:static lg:ml-auto',
              )}
            >
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function TabLink({ item, badge }: { item: NavItem; badge: number }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => cx('relative flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] min-w-0', isActive ? 'text-night font-bold' : 'text-[#6D7A77] font-semibold')}
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-0 left-1/2 -ml-3.5 w-7 h-[3px] rounded-b bg-gold" aria-hidden />}
          <span className="relative">
            <item.icon className="w-5 h-5" />
            {badge > 0 && (
              <span aria-label={`${badge} waiting for you`} className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-[#E0483D] text-white text-[10px] font-bold leading-4 text-center">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </span>
          <span className="max-w-full truncate px-0.5">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

const NEW_OPTIONS = [
  { key: 'idea', label: 'Place or link', text: 'Paste TikTok, Instagram, Xiaohongshu — or search', icon: Lightbulb, tone: 'bg-[#E8F2F0] text-[#00685F]' },
  { key: 'booking', label: 'Flight, train or hotel', text: 'Upload the e-ticket or paste the email', icon: Ticket, tone: 'bg-[#EEF3F8] text-[#1D4E89]' },
  { key: 'expense', label: 'Expense or receipt', text: 'Snap a receipt and split it', icon: Receipt, tone: 'bg-[#FDF1E1] text-[#8A4B06]' },
] as const;

function NewOptions({ onPick, onInvite, big }: { onPick: (s: 'idea' | 'booking' | 'expense') => void; onInvite: () => void; big?: boolean }) {
  const row = big ? 'w-full flex items-center gap-3 p-3.5 rounded-2xl border border-[#E7DFD5] bg-white text-left' : 'w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#F4F1EC] text-left';
  return (
    <>
      {NEW_OPTIONS.map((o) => (
        <button key={o.key} type="button" role="menuitem" className={row} onClick={() => onPick(o.key)}>
          <span className={cx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', o.tone)}>
            <o.icon className="w-5 h-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-[#161C23]">{o.label}</span>
            <span className="block text-xs text-[#6D7A77]">{o.text}</span>
          </span>
        </button>
      ))}
      <button type="button" role="menuitem" className={row} onClick={onInvite}>
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[#F4F1EC] text-[#45524F]">
          <UserPlus className="w-5 h-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-[#161C23]">Invite someone</span>
          <span className="block text-xs text-[#6D7A77]">Share the trip link</span>
        </span>
      </button>
    </>
  );
}

function NewMenu({ onPick, onInvite, onClose }: { onPick: (s: 'idea' | 'booking' | 'expense') => void; onInvite: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => ref.current && !ref.current.parentElement?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="menu"
      className="absolute right-0 mt-2 w-[340px] bg-white rounded-2xl border border-[#E7DFD5] shadow-[0_18px_50px_rgba(22,28,35,.18)] p-1.5 z-40 origin-top-right animate-[safar-pop_.18s_cubic-bezier(.2,.8,.2,1)_both]"
    >
      <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-[.08em] text-[#6D7A77]">Add to this trip</p>
      <NewOptions onPick={onPick} onInvite={onInvite} />
    </div>
  );
}

/** Admin first, then by join date. */
function sortMembers(ms: Member[]) {
  return [...ms].sort((a, b) => (a.role === b.role ? a.joinedAt - b.joinedAt : a.role === 'admin' ? -1 : 1));
}

/**
 * Keeps the trip's main lists listening while you're in the trip, so moving
 * between Home, Plan, Ideas, Food and Bookings reuses one live copy instead of
 * reading every document again (the pages share it through `useQuery`'s key).
 * Renders nothing, so a change re-renders only the page that shows it.
 */
function KeepTripLive({ tripId }: { tripId: string }) {
  useQuery(`ideas:${tripId}`, () => paths.ideas(tripId), Idea);
  useQuery(`schedule:${tripId}`, () => paths.schedule(tripId), ScheduleItem);
  useQuery(`bookings:${tripId}`, () => paths.bookings(tripId), Booking);
  useQuery(`stays:${tripId}`, () => paths.stays(tripId), Stay);
  useQuery(`splits:${tripId}`, () => paths.splits(tripId), Split);
  return null;
}
