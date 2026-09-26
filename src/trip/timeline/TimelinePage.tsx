// Day-by-day timeline: bookings are fixed anchors, approved ideas are dragged
// in from the backlog (or added with a tap on phones), reordered, re-timed —
// or planned for the whole trip by AI Arrange (admin, preview → apply → undo).
// Prayer breaks are placed automatically for members who asked for them;
// split pairs show both groups side by side. Travel time comes from the
// Routes API (server-side). All times are local to where the group is that day.
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, ArrowDown, ArrowUp, Car, Footprints, GitFork, GripVertical, Lock, Map as MapIcon, MapPin, Pencil, Phone, Plus, Sparkles, TrainFront, Undo2, Utensils, X } from 'lucide-react';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ArrangeJob,
  Booking,
  byTimeAndPriority,
  citiesByDay,
  cityLabel,
  hasCityDates,
  cityOf,
  hasMeal,
  MEAL_WINDOW,
  outForMeal,
  Stay,
  transportGaps,
  withCityBase,
  type MealKey,
  dayFrames,
  daySuggestions,
  daySummary,
  isOutdoor,
  weatherRisk,
  type WeatherRisk,
  leaveBeforeMin,
  mergePrefs,
  nearestDestination,
  PRAYER_LABEL,
  prayerBreaks,
  prays,
  journeySpans,
  rebaseFrame,
  Split,
  type Member,
  dayWarnings,
  findSlot,
  toClock,
  openingRanges,
  estimateTravelMin,
  metersBetween,
  sameJourney,
  fmtClock,
  Idea,
  paths,
  planningDate,
  ScheduleItem,
  toMin,
  tripDays,
  type DayWarning,
  type JourneyPrayer,
  journeyPrayers,
  type GeoPoint,
  type TransitLeg,
} from '../../domain';
import { db } from '../../firebase/config';
import { api } from '../../lib/api';
import { useQuery } from '../../lib/firestore';
import { Badge, Button, Card, cx, ErrorBanner, Spinner } from '../../ui';
import { bookingTitle, clockName, formatDay, KIND, tzCity } from '../bookings/format';
import { placePhotoUrl } from '../ideas/halalLabel';
import { useTrip } from '../TripLayout';
import { PRAYER_GROUP, PRAYER_PICK_COLORS, REST_GROUP, TRACK_COLOR, trackKeyOf } from '../trackColors';
import { DayMap, type MapLink, type MapStop } from './DayMap';
import { ArrangeSheet } from './ArrangeSheet';
import { AddStopSheet, CANDIDATE, EditStopSheet, type Checker } from './StopSheets';
import { FixDaySheet } from './FixDaySheet';
import { useForecast } from './useForecast';
import { PrayerPickSheet } from './PrayerPickSheet';
import { JourneyPrayerList } from '../JourneyPrayerList';
import { MealSheet } from './MealSheet';

interface Row {
  item: ScheduleItem;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  idea?: Idea;
  /** Where you arrive / leave from (for travel estimates and the map). */
  in?: GeoPoint;
  out?: GeoPoint;
  /** An automatic prayer break. */
  prayer?: boolean;
  /** Timezone the row's clock times are in (bookings: the station / airport's own). */
  zone?: string;
  /** How to name that clock ("Osaka"). */
  zoneName?: string;
  /** An extra line that must not be cut off (e.g. when to be at the airport). */
  note?: string;
  /** Where to pray around this journey (departure rows, when someone prays). */
  journey?: JourneyPrayer[];
  /** The other groups of a split (B, C, free time), running alongside this main-group row. */
  sides?: Row[];
  /** A lunch / dinner stop at a restaurant. */
  meal?: MealKey;
  phone?: string;
}

/** A split group other than the main one. */
const isSide = (track: string) => track !== 'all' && !track.endsWith(':A');

/**
 * Conflicts on a day. Travel comes from the Routes API leg when it's been
 * measured, otherwise a straight-line estimate — so a stop is checked the
 * moment it's placed.
 */
function warningsFor(day: string, rows: Row[]): DayWarning[] {
  const all = rows.flatMap((r) => [r, ...(r.sides ?? [])]);
  const chain = rows.filter((r) => !r.prayer).sort((a, b) => a.item.start.localeCompare(b.item.start));
  const travel = (r: Row) => {
    const i = chain.indexOf(r);
    const prev = i > 0 ? chain[i - 1] : undefined;
    if (sameJourney(prev?.item, r.item)) return undefined;
    if (r.item.transitFromPrev && r.item.transitFromPrev.fromId === prev?.item.id) return r.item.transitFromPrev.minutes;
    return prev?.out && r.in ? estimateTravelMin(prev.out, r.in) : undefined;
  };
  return dayWarnings(
    day,
    all.map((r) => ({
      ...r.item,
      ...(r.prayer ? { kind: 'prayer' as const, label: r.item.prayer ? `${r.item.prayer.prayer} prayer` : undefined } : isSide(r.item.track) ? { kind: 'side' as const } : { transitMin: travel(r) }),
      checkin: r.item.ref.kind === 'booking' && r.item.ref.event === 'checkin',
    })),
    (id) => all.find((r) => r.item.id === id)?.idea?.place.openingHours,
  );
}

/** Checks / suggests a time for one stop (new or moved) against the rest of that day. */
function makeChecker(rowsByDay: Map<string, Row[]>, idea: Idea | undefined, movingIds: string[]): Checker | undefined {
  if (!idea) return undefined;
  const others = (d: string) => (rowsByDay.get(d) ?? []).filter((r) => !movingIds.includes(r.item.id));
  const keyOf = (w: DayWarning) => `${w.itemId}:${w.kind}`;
  return {
    check: (d, start, duration) => {
      const base = others(d);
      const before = new Set(warningsFor(d, base).map(keyOf));
      const candidate: Row = {
        item: {
          id: CANDIDATE, day: d, start: toClock(start), end: toClock(start + duration), ref: { kind: 'idea', ideaId: idea.id },
          track: 'all', memberUids: [], locked: false, orderIndex: 999, updatedBy: 'me', updatedAt: 0,
        },
        title: idea.place.name, icon: null, idea, in: idea.place.location, out: idea.place.location,
      };
      // Only what this placement adds: its own problems + the ones it causes for the next stop.
      return warningsFor(d, [...base, candidate]).filter((w) => w.itemId === CANDIDATE || !before.has(keyOf(w)));
    },
    suggest: (d, duration) =>
      findSlot({
        day: d,
        // Prayer breaks count as taken: prayer times are locked like bookings.
        items: others(d).map((r) => ({ start: toMin(r.item.start), end: Math.max(toMin(r.item.end), toMin(r.item.start)), ...(r.prayer ? {} : { loc: r.out ?? r.in }) })),
        duration,
        hours: idea.place.openingHours,
        loc: idea.place.location,
        after: 8 * 60,
      }),
  };
}

const prayerWalkOf = (idea?: Idea) => (idea?.halal?.prayer ? (idea.halal.prayer.access === 'onsite' ? 0 : idea.halal.prayer.places[0]?.walkMin) : undefined);

const EVENT_LABEL = { span: '', depart: 'Departs', arrive: 'Arrives', checkin: 'Check-in', checkout: 'Check-out' } as const;
const KIND_PIN = { flight: '✈', train: '🚆', bus: '🚌', ferry: '⛴', hotel: '🛏' } as const;
/** An airport / station counts as part of the trip within this distance of a destination. */
const IN_TRIP_M = 100_000;

/**
 * Where a booking shows on the day's map: only its end inside the trip — not
 * the home airport. Going there → where you land; going home → where you leave
 * from; between trip cities → both. Hotels → the hotel.
 */
function tripEnd(b: Booking | undefined, event: 'span' | 'depart' | 'arrive' | 'checkin' | 'checkout', destinations: { location: GeoPoint }[]): GeoPoint | null {
  if (!b) return null;
  if (b.kind === 'hotel' || !b.from) return b.to.location;
  const gap = (p: GeoPoint) => Math.min(...destinations.map((d) => metersBetween(d.location, p)));
  const [from, to] = [gap(b.from.location), gap(b.to.location)];
  const fromIn = from <= IN_TRIP_M || from < to;
  const toIn = to <= IN_TRIP_M || to < from;
  if (event === 'depart') return fromIn ? b.from.location : null;
  if (event === 'arrive') return toIn ? b.to.location : null;
  return toIn ? b.to.location : fromIn ? b.from.location : null;
}

type Dest = { name: string; timezone: string; location: GeoPoint };

function toRow(item: ScheduleItem, ideas: Map<string, Idea>, bookings: Map<string, Booking>, destinations: Dest[]): Row | null {
  const r = item.ref;
  if (r.kind === 'idea') {
    const idea = ideas.get(r.ideaId);
    if (!idea) return null; // idea was deleted
    return { item, idea, title: idea.place.name, subtitle: idea.place.typeLabel, icon: <MapPin className="w-4 h-4" />, in: idea.place.location, out: idea.place.location };
  }
  if (r.kind === 'booking') {
    const b = bookings.get(r.bookingId);
    if (!b) return null;
    const Icon = KIND[b.kind].icon;
    const from = b.from?.location ?? b.to.location;
    const route = b.from ? `${b.from.name} → ${b.to.name}` : b.to.name;
    const where = { span: [from, b.to.location], depart: [from, from], arrive: [b.to.location, b.to.location] } as Record<string, GeoPoint[]>;
    const [inAt, outAt] = where[r.event] ?? [b.to.location, b.to.location];
    const zone = r.event === 'depart' ? (b.from?.timezone ?? b.to.timezone) : b.to.timezone;
    const zoneAt = r.event === 'depart' ? (b.from?.location ?? b.to.location) : b.to.location;
    // When to be at the airport / station, on that place's clock.
    const leave = (r.event === 'depart' || r.event === 'span') && b.kind !== 'hotel'
      ? `Be at ${b.from?.name ?? 'the station'} by ${fmtClock(toMin(item.start) - leaveBeforeMin(b.kind))} (${clockName(b.from?.timezone ?? zone, b.from?.location, destinations)} time)`
      : '';
    return {
      item,
      title: [EVENT_LABEL[r.event], bookingTitle(b)].filter(Boolean).join(' · '),
      subtitle: b.kind === 'hotel' ? b.to.address ?? b.to.name : route,
      ...(leave ? { note: leave } : {}),
      icon: <Icon className="w-4 h-4" />,
      in: inAt,
      out: outAt,
      zone,
      zoneName: clockName(zone, zoneAt, destinations),
    };
  }
  if (r.meal) {
    return { item, title: r.title, subtitle: r.place?.address ?? 'Halal restaurant', icon: <Utensils className="w-4 h-4" />, in: r.place?.location, out: r.place?.location, meal: r.meal, ...(r.phone ? { phone: r.phone } : {}) };
  }
  return { item, title: r.title, icon: <MapPin className="w-4 h-4" />, in: r.place?.location, out: r.place?.location, prayer: !!item.prayer };
}

/** Rows that are a meal: a food idea or a lunch / dinner stop. */
const isFood = (r: Row) => !!r.meal || r.idea?.place.category === 'food';

export function TimelinePage() {
  const { trip, members, me, isAdmin } = useTrip();
  const [params, setParams] = useSearchParams();
  const days = useMemo(() => tripDays(trip.startDate, trip.endDate), [trip.startDate, trip.endDate]);
  const day = days.includes(params.get('day') ?? '') ? params.get('day')! : planningDate(trip.startDate, trip.endDate, trip.destinations[0].timezone);
  const setDay = (d: string) => setParams({ day: d }, { replace: true });

  const schedule = useQuery(`schedule:${trip.id}`, () => paths.schedule(trip.id), ScheduleItem);
  const ideas = useQuery(`ideas:${trip.id}`, () => paths.ideas(trip.id), Idea);
  const bookings = useQuery(`bookings:${trip.id}`, () => paths.bookings(trip.id), Booking);
  const splits = useQuery(`splits:${trip.id}`, () => paths.splits(trip.id), Split);
  const jobs = useQuery(`jobs:${trip.id}`, () => query(collection(db, paths.jobs(trip.id)), orderBy('at', 'desc'), limit(5)), ArrangeJob);
  const stays = useQuery(`stays:${trip.id}`, () => paths.stays(trip.id), Stay);
  const people = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members]);

  const loading = schedule.loading || ideas.loading || bookings.loading;
  const ideaMap = useMemo(() => new Map(ideas.data.map((i) => [i.id, i])), [ideas.data]);
  const prayingUids = useMemo(() => new Set(members.filter(prays).map((m) => m.uid)), [members]);
  const bookingMap = useMemo(() => new Map(bookings.data.map((b) => [b.id, b])), [bookings.data]);
  const rowsByDay = useMemo(() => {
    const out = new Map<string, Row[]>();
    // Same minute: journeys, then prayer, then the hotel, then everything else.
    for (const it of [...schedule.data].sort(byTimeAndPriority)) {
      const row = toRow(it, ideaMap, bookingMap, trip.destinations);
      if (!row) continue;
      // Prayer guidance for journeys of anyone who prays (on the departure row).
      if (it.ref.kind === 'booking' && (it.ref.event === 'depart' || it.ref.event === 'span')) {
        const b = bookingMap.get(it.ref.bookingId);
        if (b && b.travellerUids.some((u) => prayingUids.has(u))) row.journey = journeyPrayers(b);
      }
      out.set(it.day, [...(out.get(it.day) ?? []), row]);
    }
    // The other groups of a split ride along with its main-group row.
    for (const [d, list] of out) {
      const main = list.filter((r) => !isSide(r.item.track));
      for (const b of list.filter((r) => isSide(r.item.track))) {
        const a = main.find((m) => m.item.track === `${b.item.track.split(':')[0]}:A`);
        if (a) (a.sides ??= []).push(b);
        else main.push(b);
      }
      main.forEach((r) => r.sides?.sort((x, y) => x.item.track.localeCompare(y.item.track)));
      out.set(d, main);
    }
    return out;
  }, [schedule.data, ideaMap, bookingMap, prayingUids, trip.destinations]);
  // Which city the group is in each day (the cities' dates → stays → hotel bookings).
  const dayCities = useMemo(
    () => citiesByDay({ ...trip, stays: stays.data, hotels: bookings.data.filter((b) => b.kind === 'hotel') }),
    [trip, stays.data, bookings.data],
  );
  // Journeys the plan needs but nobody booked (e.g. Tokyo → Osaka), shown on the day they happen.
  const gapsToday = useMemo(
    () => transportGaps({ startDate: trip.startDate, endDate: trip.endDate, destinations: trip.destinations, stays: stays.data, bookings: bookings.data }).filter((g) => (g.date || trip.startDate) === day),
    [trip, stays.data, bookings.data, day],
  );
  const approved = useMemo(() => splits.data.filter((s) => s.status === 'approved'), [splits.data]);
  // A split's alternatives are added together with its main idea (one grouped backlog card).
  const altIds = useMemo(() => new Set(approved.flatMap((s) => s.tracks.filter((t) => t.key !== 'A' && t.ideaId).map((t) => t.ideaId!))), [approved]);
  const backlog = useMemo(() => ideas.data.filter((i) => i.status === 'backlog' && !altIds.has(i.id)).sort((a, b) => a.createdAt - b.createdAt), [ideas.data, altIds]);
  const pairName = (ideaId: string) => {
    const s = approved.find((x) => x.tracks.some((t) => t.key === 'A' && t.ideaId === ideaId));
    if (!s) return undefined;
    const others = s.tracks.filter((t) => t.key !== 'A').map((t) => (t.key === 'F' ? 'free time' : (ideaMap.get(t.ideaId ?? '')?.place.name ?? t.label)));
    return `${s.tracks.length} groups: ${others.join(' · ')}`;
  };

  // Order shown while a reorder is on its way to the server.
  const [pending, setPending] = useState<{ day: string; order: string[] } | null>(null);
  useEffect(() => setPending(null), [schedule.data]);
  const rows = useMemo(() => {
    const base = rowsByDay.get(day) ?? [];
    if (pending?.day !== day) return base;
    // Keep bookings where they are; fill the movable slots in the new order.
    const byId = new Map(base.map((r) => [r.item.id, r]));
    const queue = pending.order.flatMap((id) => byId.get(id) ?? []);
    return base.map((r) => (r.item.locked ? r : queue.shift() ?? r));
  }, [rowsByDay, day, pending]);

  const dayList = useMemo(() => warningsFor(day, rows), [rows, day]);
  const warnings = useMemo(() => {
    const byItem = new Map<string, DayWarning[]>();
    for (const w of dayList) byItem.set(w.itemId, [...(byItem.get(w.itemId) ?? []), w]);
    return byItem;
  }, [dayList]);
  // A dot on each day chip: red if something doesn't work, amber if something's tight.
  const dayStatus = useMemo(
    () =>
      new Map(
        days.map((d) => {
          const w = warningsFor(d, rowsByDay.get(d) ?? []);
          return [d, w.some((x) => x.severity === 'block') ? 'block' : w.length ? 'risk' : null] as const;
        }),
      ),
    [days, rowsByDay],
  );
  const blocks = dayList.filter((w) => w.severity === 'block').length;
  const risks = dayList.length - blocks;
  const [fixing, setFixing] = useState(false);

  // Prayer times and the day's local timezone (from where the group is that day;
  // with no hotel or arrival, from where the day's stops are).
  const firstStop = rows.find((r) => !r.prayer && !r.item.locked)?.in;
  const frame = useMemo(
    () =>
      rebaseFrame(
        withCityBase(dayFrames([day], bookings.data, trip.destinations, { pace: mergePrefs(members).pace ?? 'moderate', praying: members.some(prays) }), dayCities, trip.destinations)[0],
        firstStop,
        trip.destinations,
      ),
    [day, bookings.data, trip.destinations, members, firstStop, dayCities],
  );
  const dayDest = nearestDestination(trip.destinations, frame.baseKnown ? frame.base : (firstStop ?? frame.base));
  const tz = dayDest.timezone;
  // Prayer breaks saved before prayer times were locked (or with stale times) → re-place them once.
  const expected = useMemo(
    () =>
      prayerBreaks(
        frame.prayers,
        rows.filter((r) => !r.prayer && !isSide(r.item.track)).map((r) => ({ id: r.item.id, start: toMin(r.item.start), end: Math.max(toMin(r.item.end), toMin(r.item.start)), loc: r.out, prayerWalkMin: prayerWalkOf(r.idea) })),
        frame.base,
        journeySpans(
          rows.flatMap((r) => {
            const ref = r.item.ref;
            if (ref.kind !== 'booking' || ref.event === 'checkin' || ref.event === 'checkout') return [];
            const b = bookingMap.get(ref.bookingId);
            return b ? [{ start: toMin(r.item.start), end: toMin(r.item.end), event: ref.event, bookingId: b.id, flight: b.kind === 'flight' }] : [];
          }),
        ),
        frame.inTrip,
      ).prayers.map((p) => `${PRAYER_LABEL[p.key]}@${toClock(p.start)}`).sort().join(),
    [frame, rows, bookingMap],
  );
  const actual = rows.filter((r) => r.prayer && r.item.prayer).map((r) => `${r.item.prayer!.prayer}@${r.item.start}`).sort().join();
  const refreshed = useRef(new Set<string>());
  useEffect(() => {
    if (loading || expected === actual || !navigator.onLine || refreshed.current.has(day)) return;
    refreshed.current.add(day);
    void api.post('schedule/refresh', { day }, { tripId: trip.id }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expected, actual, day]);

  // Live weather: only for today and tomorrow (further out the forecast isn't worth acting on).
  const todayThere = new Intl.DateTimeFormat('en-CA', { timeZone: trip.destinations[0].timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const tomorrowThere = new Date(Date.parse(`${todayThere}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const weatherDay = day === todayThere || day === tomorrowThere;
  const forecast = useForecast(weatherDay ? day : '', firstStop ?? frame.base);
  // Indoor ideas the admin could bring back from the backups for a rainy day.
  const backups = useMemo(() => (isAdmin ? ideas.data.filter((i) => i.status === 'backup' && !isOutdoor(i.place)) : []), [ideas.data, isAdmin]);
  const outlook = forecast ? daySummary(forecast, day) : null;
  const weather = useMemo(() => {
    const out = new Map<string, { risk: WeatherRisk; swap?: Idea }>();
    if (!forecast) return out;
    for (const r of rows) {
      if (!weatherDay || !r.idea || r.prayer || !isOutdoor(r.idea.place)) continue;
      const risk = weatherRisk(forecast, day, toMin(r.item.start), toMin(r.item.end));
      if (!risk) continue;
      // Plan B: an indoor backlog place nearby that's open that day.
      const swap = [...backlog, ...backups]
        .filter((i) => !isOutdoor(i.place) && metersBetween(i.place.location, r.idea!.place.location) < 3000 && openingRanges(i.place.openingHours, day)?.length !== 0)
        .sort((a, b) => metersBetween(a.place.location, r.idea!.place.location) - metersBetween(b.place.location, r.idea!.place.location))[0];
      out.set(r.item.id, { risk, ...(swap ? { swap } : {}) });
    }
    return out;
  }, [forecast, rows, day, backlog, backups, weatherDay]);
  const [planB, setPlanB] = useState<{ day: string; text: string } | null>(null);
  const [askingPlanB, setAskingPlanB] = useState(false);

  // 🍽 Lunch / dinner: a day out with no food stop at meal time gets a nudge (with halal places nearby).
  const mainStops = rows.filter((r) => !r.item.locked && !r.prayer && !isSide(r.item.track));
  const missingMeals = useMemo(() => {
    const timed = mainStops.map((r) => ({ start: toMin(r.item.start), end: toMin(r.item.end), food: isFood(r) }));
    const [inFrom, inTo] = frame.inTrip ?? [0, 24 * 60];
    return (['lunch', 'dinner'] as MealKey[]).filter((m) => {
      const [a, b] = MEAL_WINDOW[m];
      return inFrom < b && inTo > a && outForMeal(timed, m) && !hasMeal(timed, m);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, frame.inTrip]);
  const [mealFor, setMealFor] = useState<MealKey | null>(null);
  /** Where the group is around a meal: the stop before the meal window starts (else the first stop). */
  const nearMeal = (m: MealKey) => {
    const [a] = MEAL_WINDOW[m];
    const before = [...mainStops].reverse().find((r) => toMin(r.item.start) <= a + 30 && r.out);
    return before?.out ?? mainStops.find((r) => r.in)?.in ?? frame.base;
  };

  // 🟡 Works, but could be better: a shorter visiting order, meals at meal times.
  const suggestions = useMemo(
    () =>
      daySuggestions(
        frame,
        rows
          .filter((r) => !r.item.locked && !r.prayer && !isSide(r.item.track) && r.in)
          .map((r) => ({ id: r.item.id, start: toMin(r.item.start), end: toMin(r.item.end), loc: r.in!, name: r.title, food: r.idea?.place.category === 'food' })),
      ),
    [frame, rows],
  );

  const [preview, setPreview] = useState<ArrangeJob | null>(null);
  const [arranging, setArranging] = useState(false);
  const lastJob = jobs.data[0];
  const canUndo = isAdmin && lastJob?.status === 'applied';

  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  // Tapping a stop focuses it on the map (on phones the map view opens).
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setSelected(null), [day]);
  const select = (id: string) => {
    setSelected(id);
    if (window.matchMedia('(max-width: 767px)').matches) setShowMap(true);
  };
  const [adding, setAdding] = useState<Idea | null>(null);
  const [picking, setPicking] = useState<ScheduleItem | null>(null);
  const [dragging, setDragging] = useState<{ title: string } | null>(null);
  const [showMap, setShowMap] = useState(false);

  const call = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      setPending(null);
    }
  };
  const addIdea = (ideaId: string, toDay: string, start?: string) => api.post('schedule/add', { ideaId, day: toDay, start }, { tripId: trip.id });

  // Mouse: drag after moving 5 px. Touch: press and hold (~¼ s) on a card, so a normal swipe still scrolls.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const movable = rows.filter((r) => !r.item.locked && !r.prayer).map((r) => r.item.id);
  /**
   * A day chip under the pointer wins (move to that day); otherwise a stop
   * being reordered goes to the nearest stop — never the whole list, which
   * used to swallow the drop; a backlog idea lands on the day shown.
   */
  const collision: CollisionDetection = (args) => {
    const under = pointerWithin(args);
    const chip = under.find((c) => String(c.id).startsWith('chip:'));
    if (chip) return [chip];
    if (String(args.active.id).startsWith('backlog:')) return under.length ? under : closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id === 'day-list') });
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => movable.includes(String(c.id))) });
  };
  /** Earlier / later by one place (the same as dragging it). */
  const nudge = (id: string, by: -1 | 1) => {
    const from = movable.indexOf(id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= movable.length) return;
    const order = arrayMove(movable, from, to);
    setPending({ day, order });
    void call(() => api.post('schedule/reorder', { day, order }, { tripId: trip.id }));
  };
  // "Back to backlog" with a short undo.
  const [removed, setRemoved] = useState<{ ideaId?: string; title: string; day: string; start: string; duration: number } | null>(null);
  const toBacklog = (r: Row) =>
    void call(async () => {
      await api.post('schedule/remove', { id: r.item.id }, { tripId: trip.id });
      setRemoved({ ...(r.item.ref.kind === 'idea' ? { ideaId: r.item.ref.ideaId } : {}), title: r.title, day: r.item.day, start: r.item.start, duration: toMin(r.item.end) - toMin(r.item.start) });
    });
  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => setRemoved(null), 8000);
    return () => clearTimeout(t);
  }, [removed]);
  const arrange = async () => {
    setArranging(true);
    await call(async () => setPreview(await api.post<ArrangeJob>('schedule/arrange', {}, { tripId: trip.id })));
    setArranging(false);
  };

  const onDragStart = (e: DragStartEvent) => setDragging({ title: String(e.active.data.current?.title ?? '') });
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over) return;
    const id = String(active.id);
    const target = String(over.id);
    if (id.startsWith('backlog:')) {
      const toDay = target.startsWith('chip:') ? target.slice(5) : day;
      void call(async () => {
        await addIdea(id.slice(8), toDay);
        if (toDay !== day) setDay(toDay);
      });
      return;
    }
    if (target.startsWith('chip:')) {
      const toDay = target.slice(5);
      if (toDay !== day)
        void call(async () => {
          await api.post('schedule/update', { id, day: toDay }, { tripId: trip.id });
          setDay(toDay);
        });
      return;
    }
    const from = movable.indexOf(id);
    const to = movable.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    const order = arrayMove(movable, from, to);
    setPending({ day, order });
    void call(() => api.post('schedule/reorder', { day, order }, { tripId: trip.id }));
  };

  /**
   * Where a new stop goes by default: the first day in its city (the day on
   * screen first) with a time that clashes with nothing; failing that, the
   * emptiest day in that city after its last stop.
   */
  const defaultSlot = (idea: Idea, duration: number): { day: string; start: string; fits: boolean } => {
    const city = trip.destinations.length > 1 ? cityOf(trip.destinations, idea.place.location) : null;
    const inCity = city === null ? days : days.filter((d) => dayCities.get(d)?.includes(city));
    const unknown = days.filter((d) => !dayCities.get(d)?.length);
    const pool = inCity.length ? inCity : unknown.length ? unknown : days;
    const ordered = [...pool].sort((a, b) => Number(b === day) - Number(a === day) || a.localeCompare(b));
    const checker = makeChecker(rowsByDay, idea, []);
    for (const d of ordered) {
      const s = checker?.suggest(d, duration);
      if (s !== null && s !== undefined) return { day: d, start: toClock(s), fits: true };
    }
    const emptiest = [...ordered].sort((a, b) => (rowsByDay.get(a)?.filter((r) => !r.prayer && !r.item.locked).length ?? 0) - (rowsByDay.get(b)?.filter((r) => !r.prayer && !r.item.locked).length ?? 0))[0] ?? day;
    const last = Math.max(9 * 60 - 15, ...(rowsByDay.get(emptiest) ?? []).filter((r) => !r.prayer).map((r) => toMin(r.item.end)));
    return { day: emptiest, start: toClock(Math.min(22 * 60, Math.ceil((last + 15) / 5) * 5)), fits: false };
  };

  const mapStops: MapStop[] = [];
  const mapLinks: MapLink[] = [];
  const legend = new Map<string, string>();
  let stopNo = 0;
  rows.forEach((r) => {
    const at = r.in ?? r.out;
    if (!at) return;
    if (r.prayer) {
      // Prayer places are numbered in the day's order too, and marked as a mosque.
      stopNo++;
      const groups = prayerGroups(r.item, members, me.uid);
      mapStops.push({ id: r.item.id, kind: 'prayer', label: String(stopNo), badge: '🕌', title: `${stopNo}. ${r.item.prayer?.facility?.name ?? r.title} (${r.item.prayer?.prayer} prayer)`, location: at, color: PRAYER_GROUP.main, ...(groups.picks.length ? { meet: `Meet ${fmtClock(toMin(r.item.end))}` } : {}) });
      legend.set(PRAYER_GROUP.main, '🕌 Praying');
      groups.picks.forEach((g, k) => {
        if (!g.place) return;
        mapStops.push({ id: `${r.item.id}:pick${k}`, kind: 'side', label: `${stopNo}${String.fromCharCode(97 + k)}`, title: `While others pray: ${g.title} (${g.names.join(', ')})`, location: g.place.location, color: g.color });
        mapLinks.push({ from: at, to: g.place.location, color: g.color });
        legend.set(g.color, `☕ ${g.title}`);
      });
      if (!groups.picks.length && r.item.prayer?.fillerPlace) {
        const pl = r.item.prayer.fillerPlace;
        mapStops.push({ id: `${r.item.id}:filler`, kind: 'side', label: '☕', title: `Suggested while others pray: ${pl.name}`, location: pl.location, color: REST_GROUP.main });
        mapLinks.push({ from: at, to: pl.location, color: REST_GROUP.main });
      }
      return;
    }
    if (r.item.locked) {
      // Only the trip end of a journey: the airport you land at going there, the one you leave from going home.
      const pin = r.item.ref.kind === 'booking' ? tripEnd(bookingMap.get(r.item.ref.bookingId), r.item.ref.event, trip.destinations) : at;
      if (pin) mapStops.push({ id: r.item.id, kind: 'booking', label: KIND_PIN[r.item.ref.kind === 'booking' ? (bookingMap.get(r.item.ref.bookingId)?.kind ?? 'hotel') : 'hotel'], title: r.title, location: pin, color: '#6D7A77' });
      return;
    }
    stopNo++;
    const split = !!r.sides?.length;
    mapStops.push({ id: r.item.id, kind: 'stop', label: String(stopNo), ...(r.meal ? { badge: '🍽' } : {}), title: `${stopNo}. ${r.title}`, location: at, color: TRACK_COLOR.A.main, ...(split ? { meet: `Meet ${fmtClock(toMin(r.item.end))}` } : {}) });
    legend.set(TRACK_COLOR.A.main, split ? 'Main group' : 'The group');
    for (const s of r.sides ?? []) {
      const k = trackKeyOf(s.item.track);
      if (!k || k === 'F' || !s.in) continue;
      mapStops.push({ id: s.item.id, kind: 'side', label: `${stopNo}${k.toLowerCase()}`, title: s.title, location: s.in, color: TRACK_COLOR[k].main });
      mapLinks.push({ from: at, to: s.in, color: TRACK_COLOR[k].main });
      legend.set(TRACK_COLOR[k].main, `${TRACK_COLOR[k].label}: ${s.title}`);
    }
  });

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-[#161C23]">Timeline</h1>
            <p className="text-sm text-[#6D7A77]">Drag approved ideas onto a day. Bookings stay fixed.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            {isAdmin && (
              <Button onClick={arrange} loading={arranging} className="shrink-0">
                <Sparkles className="w-4 h-4" /> <span className="hidden sm:inline">AI </span>Arrange
              </Button>
            )}
            <Button variant="secondary" className="md:hidden shrink-0" onClick={() => setShowMap((v) => !v)} aria-pressed={showMap}>
              <MapIcon className="w-4 h-4" /> {showMap ? 'List' : 'Map'}
            </Button>
          </div>
        </div>
        {canUndo && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#E7DFD5] bg-white px-4 py-2.5 text-sm">
            <span className="text-[#6D7A77]">
              AI Arrange was applied{lastJob.appliedAt ? ` ${new Date(lastJob.appliedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}.
            </span>
            <Button variant="ghost" className="shrink-0" onClick={() => call(() => api.post('schedule/undo', { jobId: lastJob.id }, { tripId: trip.id }))}>
              <Undo2 className="w-4 h-4" /> Undo
            </Button>
          </div>
        )}

        <div className="-mx-4 px-4 overflow-x-auto">
          <div className="flex gap-2 w-max pb-1">
            {days.map((d, i) => (
              <DayChip
                key={d}
                day={d}
                index={i}
                selected={d === day}
                status={dayStatus.get(d) ?? null}
                count={rowsByDay.get(d)?.filter((r) => !r.prayer).length ?? 0}
                city={trip.destinations.length > 1 ? cityLabel(trip.destinations, dayCities.get(d) ?? []) : ''}
                onClick={() => setDay(d)}
              />
            ))}
          </div>
        </div>

        {error && <ErrorBanner>{error}</ErrorBanner>}
        {removed && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#E7DFD5] bg-white px-4 py-2 text-sm">
            <span className="text-[#161C23] min-w-0 truncate">
              <b>{removed.title}</b> went back to the backlog.
            </span>
            {removed.ideaId && (
              <Button
                variant="ghost"
                className="shrink-0 !min-h-8"
                onClick={() => {
                  const r = removed;
                  setRemoved(null);
                  void call(() => api.post('schedule/add', { ideaId: r.ideaId, day: r.day, start: r.start, durationMin: r.duration }, { tripId: trip.id }));
                }}
              >
                <Undo2 className="w-4 h-4" /> Undo
              </Button>
            )}
          </div>
        )}

        {gapsToday.map((g) => (
          <div key={g.key} className="flex items-start gap-3 rounded-2xl border border-[#F0D7A7] bg-[#FDF3E1] px-4 py-3 text-sm text-[#6B3F06]">
            <TrainFront className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="flex-1">
              <b>{g.kind === 'between' ? `${g.from} → ${g.to}: no transport booked.` : g.kind === 'there' ? `Getting to ${g.to}: no transport booked.` : `Going home from ${g.from}: no transport booked.`}</b>{' '}
              Add the train, bus or flight so this day can be planned around it.
            </p>
            <Link to="../bookings?tab=transport" relative="path" className="shrink-0 font-bold text-[#00685F]">
              Add
            </Link>
          </div>
        ))}

        {missingMeals.map((m) => (
          <div key={m} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#F2D8B0] bg-[#FFF8EC] px-4 py-3 text-sm">
            <Utensils className="w-5 h-5 shrink-0 text-[#8A5A00]" />
            <p className="flex-1 min-w-[12rem] text-[#161C23]">
              🟡 <b>No {m} planned</b> ({m === 'lunch' ? '11:30 AM–2 PM' : '6–8:30 PM'}) while you're out.
            </p>
            <Button variant="secondary" className="shrink-0 !min-h-8 !px-3 text-xs" onClick={() => setMealFor(m)}>
              Find halal {m} nearby
            </Button>
          </div>
        ))}

        {isAdmin && trip.destinations.length > 1 && !hasCityDates(trip.destinations) && (
          <p className="rounded-xl bg-[#F3F8FD] border border-[#C9DDF2] px-3 py-2 text-xs text-[#1D4E89]">
            📍 Tell Safar when you're in each city (Settings → “When are you in each city?”) — hotels, transport alerts, AI Arrange and the backlog then follow it.{' '}
            <Link to="../settings" relative="path" className="font-bold underline">
              Add dates
            </Link>
          </p>
        )}

        <div className="text-xs text-[#6D7A77] space-y-1">
          <p>
            {trip.destinations.length > 1 && !!dayCities.get(day)?.length && <b className="text-[#161C23]">📍 {cityLabel(trip.destinations, dayCities.get(day)!)} · </b>}
            Times are local to {dayDest.name} ({tz}).
            {rows.some((r) => r.zone && r.zone !== tz) && ' Flight and train times are on their own airport / station clock — marked under the time.'}
          </p>
          {outlook && <p>Weather: {outlook}</p>}
          {frame.prayers && (
            <p>
              🔒 Prayer times ({dayDest.name}): {(['dhuhr', 'asr', 'maghrib', 'isha'] as const).map((k) => `${PRAYER_LABEL[k]} ${fmtClock(frame.prayers!.times[k])}`).join(' · ')} — fixed like bookings; stops are planned around them.
            </p>
          )}
        </div>
        {(blocks > 0 || risks > 0) && (
          <div className={cx('flex items-center gap-3 rounded-2xl border px-4 py-3', blocks ? 'border-[#F2B8B5] bg-[#FDECEA]' : 'border-[#F2D8B0] bg-[#FFF8EC]')}>
            <AlertTriangle className={cx('w-5 h-5 shrink-0', blocks ? 'text-[#B3261E]' : 'text-[#8A5A00]')} />
            <p className="flex-1 text-sm text-[#161C23]">
              {blocks ? `🔴 ${blocks} thing${blocks > 1 ? 's' : ''} won't work — fix now` : ''}
              {blocks && risks ? ' · ' : ''}
              {risks ? `🟡 ${risks} tight` : ''} on this day — see the stops below.
            </p>
            <Button variant={blocks ? 'primary' : 'secondary'} className="shrink-0 min-h-9" onClick={() => setFixing(true)}>
              Fix this day
            </Button>
          </div>
        )}

        {weather.size > 0 && (
          <div className="rounded-2xl border border-[#C9DDF2] bg-[#F3F8FD] px-4 py-3 space-y-2 text-sm">
            <p className="font-bold text-[#1D4E89]">
              🌦 {day === todayThere ? 'Today' : 'Tomorrow'}: weather may spoil {weather.size} outdoor stop{weather.size > 1 ? 's' : ''} — fix {weather.size > 1 ? 'them' : 'it'} yourself or let AI suggest
            </p>
            {[...weather].map(([id, w]) => {
              const r = rows.find((x) => x.item.id === id)!;
              const dur = toMin(r.item.end) - toMin(r.item.start);
              // A drier time today that still fits the plan.
              const checker = makeChecker(rowsByDay, r.idea, [r.item.id]);
              const drier = forecast
                ? Array.from({ length: 53 }, (_, k) => 8 * 60 + k * 15)
                    .filter((s) => s + dur <= 22 * 60 && s !== toMin(r.item.start) && !weatherRisk(forecast, day, s, s + dur) && !checker?.check(day, s, dur).some((x) => x.severity === 'block'))
                    .sort((a, b) => Math.abs(a - toMin(r.item.start)) - Math.abs(b - toMin(r.item.start)))[0]
                : undefined;
              return (
                <div key={id} className="space-y-1">
                  <p className="text-[#161C23]">
                    <b>{r.title}</b> ({fmtClock(toMin(r.item.start))}): {w.risk.text}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {drier !== undefined && (
                      <Button variant="secondary" className="!min-h-8 !px-3 text-xs" onClick={() => void call(() => api.post('schedule/update', { id, start: toClock(drier) }, { tripId: trip.id }))}>
                        Move to {fmtClock(drier)} (drier)
                      </Button>
                    )}
                    {w.swap && (
                      <Button variant="secondary" className="!min-h-8 !px-3 text-xs" onClick={() => void call(() => api.post('schedule/swap', { id, ideaId: w.swap!.id }, { tripId: trip.id }))}>
                        Swap for {w.swap.place.name}{w.swap.status === 'backup' ? ' (backup)' : ''} — indoor
                      </Button>
                    )}
                    <Button variant="ghost" className="!min-h-8 !px-3 text-xs" onClick={() => setEditing(r)}>
                      Move to another day
                    </Button>
                  </div>
                </div>
              );
            })}
            {planB?.day === day ? (
              <p className="text-sm text-[#161C23] flex gap-1.5">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-[#1D4E89]" /> {planB.text}
              </p>
            ) : (
              <Button
                variant="secondary"
                className="!min-h-8 !px-3 text-xs"
                loading={askingPlanB}
                onClick={() => {
                  setAskingPlanB(true);
                  void call(async () => {
                    const r = await api.post<{ text: string }>(
                      'schedule/weather-plan',
                      {
                        day,
                        risks: [...weather].map(([id, w]) => ({ itemId: id, text: w.risk.text })),
                      },
                      { tripId: trip.id },
                    );
                    setPlanB({ day, text: r.text });
                  }).finally(() => setAskingPlanB(false));
                }}
              >
                <Sparkles className="w-3.5 h-3.5" /> Ask AI (swap, reschedule or a place nearby)
              </Button>
            )}
          </div>
        )}

        {!!suggestions.length && (
          <div className="rounded-2xl border border-[#F2D8B0] bg-[#FFF8EC] px-4 py-3 space-y-2">
            <p className="text-sm font-bold text-[#8A5A00]">🟡 Works, but could be better</p>
            {suggestions.map((sg) => (
              <div key={sg.text} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#161C23]">
                <p className="flex-1 min-w-[12rem]">{sg.text}</p>
                {sg.order && (
                  <Button
                    variant="secondary"
                    className="!min-h-8 !px-3 text-xs shrink-0"
                    onClick={() => {
                      setPending({ day, order: sg.order! });
                      void call(() => api.post('schedule/reorder', { day, order: sg.order }, { tripId: trip.id }));
                    }}
                  >
                    Use this order
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_320px] items-start">
          <div className={cx('space-y-2', showMap && 'hidden md:block')}>
            {loading ? (
              <Spinner label="Loading timeline…" />
            ) : (
              <DayList empty={!rows.length}>
                <SortableContext items={movable} strategy={verticalListSortingStrategy}>
                  {rows.map((r, i) => {
                    // Travel legs skip prayer breaks: you go from the last stop to the next one.
                    const prev = rows.slice(0, i).reverse().find((x) => !x.prayer);
                    return (
                      <div key={r.item.id}>
                        {r.prayer ? (
                          <PrayerRow
                            row={r}
                            people={people}
                            members={members}
                            me={me.uid}
                            canPick={!me.prefs?.prayerReminders}
                            onPick={() => setPicking(r.item)}
                            selected={selected === r.item.id}
                            onSelect={() => select(r.item.id)}
                            before={rows.slice(0, i).reverse().find((x) => !x.prayer)?.title}
                            after={rows.slice(i + 1).find((x) => !x.prayer)?.title}
                          />
                        ) : (
                          <>
                            {prev && (sameJourney(prev.item, r.item) ? <OnBoardRow booking={r.item.ref.kind === 'booking' ? bookingMap.get(r.item.ref.bookingId) : undefined} /> : <TravelRow leg={r.item.transitFromPrev} a={prev.out} b={r.in} />)}
                            <StopRow
                              row={r}
                              index={movable.indexOf(r.item.id)}
                              count={movable.length}
                              days={days}
                              day={day}
                              onNudge={(by) => nudge(r.item.id, by)}
                              onMoveDay={(d) =>
                                void call(async () => {
                                  await api.post('schedule/update', { id: r.item.id, day: d }, { tripId: trip.id });
                                  setDay(d);
                                })
                              }
                              onBacklog={() => toBacklog(r)}
                              dayZone={tz}
                              weather={weather.get(r.item.id)?.risk}
                              warnings={[...(warnings.get(r.item.id) ?? []), ...(r.sides ?? []).flatMap((s) => warnings.get(s.item.id) ?? [])]}
                              people={people}
                              me={me.uid}
                              selected={selected === r.item.id || !!r.sides?.some((s) => s.item.id === selected)}
                              onSelect={() => select(r.item.id)}
                              onEdit={() => setEditing(r)}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                </SortableContext>
              </DayList>
            )}
          </div>

          <div className="space-y-4 md:sticky md:top-4">
            <div className={cx('space-y-1.5', !showMap && 'hidden md:block')}>
              <Card className="overflow-hidden h-72 md:h-80">
                <DayMap stops={mapStops} links={mapLinks} selectedId={selected} onSelect={setSelected} />
              </Card>
              {legend.size > 1 && (
                <ul className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-[#3E4947]">
                  {[...legend].map(([color, label]) => (
                    <li key={color} className="inline-flex items-center gap-1 min-w-0 max-w-full">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                      <span className="truncate">{label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Backlog
              ideas={backlog}
              pairName={pairName}
              onAdd={setAdding}
              day={day}
              destinations={trip.destinations}
              dayCity={dayCities.get(day)?.length ? trip.destinations[dayCities.get(day)!.at(-1)!].name : nearestDestination(trip.destinations, firstStop ?? frame.base).name}
            />
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && <div className="px-4 py-3 rounded-2xl bg-white shadow-xl border border-[#00685F]/40 font-semibold text-sm text-[#161C23] max-w-xs truncate">{dragging.title}</div>}
      </DragOverlay>

      <EditStopSheet
        item={editing?.item ?? null}
        idea={editing?.idea}
        title={editing?.sides?.length ? `Split: ${[editing.title, ...editing.sides.map((s) => s.title)].join(' / ')}` : (editing?.title ?? '')}
        fixedLength={!!editing?.sides?.length}
        days={days}
        checker={editing ? makeChecker(rowsByDay, editing.idea, [editing.item.id, ...(editing.sides ?? []).map((s) => s.item.id)]) : undefined}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          await api.post('schedule/update', { id: editing!.item.id, ...patch }, { tripId: trip.id });
          if (patch.day !== day) setDay(patch.day);
        }}
        onRemove={() => api.post('schedule/remove', { id: editing!.item.id }, { tripId: trip.id })}
      />
      {picking && (
        <PrayerPickSheet
          item={schedule.data.find((i) => i.id === picking.id) ?? picking}
          tripId={trip.id}
          myPick={(schedule.data.find((i) => i.id === picking.id) ?? picking).prayer?.fillerPicks?.[me.uid]?.title}
          onClose={() => setPicking(null)}
        />
      )}
      {fixing && <FixDaySheet day={day} tripId={trip.id} rows={rows} onClose={() => setFixing(false)} />}
      {preview && (
        <ArrangeSheet
          job={preview}
          days={days}
          ideas={ideaMap}
          current={schedule.data}
          onApply={() => api.post('schedule/apply', { jobId: preview.id }, { tripId: trip.id })}
          onClose={() => {
            if (jobs.data.find((j) => j.id === preview.id)?.status === 'preview') void api.post('schedule/discard', { jobId: preview.id }, { tripId: trip.id }).catch(() => {});
            setPreview(null);
          }}
        />
      )}
      <AddStopSheet
        idea={adding}
        days={days}
        defaultDay={day}
        pickDefault={adding ? (duration) => defaultSlot(adding, duration) : undefined}
        checker={adding ? makeChecker(rowsByDay, adding, []) : undefined}
        onClose={() => setAdding(null)}
        onAdd={async (toDay, start, durationMin) => {
          await api.post('schedule/add', { ideaId: adding!.id, day: toDay, start, durationMin }, { tripId: trip.id });
          if (toDay !== day) setDay(toDay);
        }}
      />
      {mealFor && (
        <MealSheet
          day={day}
          meal={mealFor}
          near={nearMeal(mealFor)}
          tripId={trip.id}
          onClose={() => setMealFor(null)}
          onPickIdea={async (ideaId) => {
            const idea = ideaMap.get(ideaId);
            const [a, b] = MEAL_WINDOW[mealFor];
            const dur = idea?.estDurationMin ?? 60;
            const s = idea ? findSlot({ day, items: (rowsByDay.get(day) ?? []).map((r) => ({ start: toMin(r.item.start), end: Math.max(toMin(r.item.end), toMin(r.item.start)), ...(r.prayer ? {} : { loc: r.out ?? r.in }) })), duration: dur, hours: idea.place.openingHours, loc: idea.place.location, after: a }) : null;
            await api.post('schedule/add', { ideaId, day, ...(s !== null && s + dur <= b + 30 ? { start: toClock(s) } : { start: toClock(a) }) }, { tripId: trip.id });
          }}
        />
      )}
    </DndContext>
  );
}

function DayChip({ day, index, selected, status, count, city, onClick }: { day: string; index: number; selected: boolean; status: 'block' | 'risk' | null; count: number; city: string; onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `chip:${day}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'px-3 py-2 rounded-2xl border text-left min-w-[5.5rem] transition-colors',
        selected ? 'bg-[#00685F] border-[#00685F] text-white' : 'bg-white border-[#E7DFD5] text-[#161C23]',
        isOver && !selected && 'border-[#00685F] ring-2 ring-[#00685F]/30',
      )}
    >
      <span className={cx('flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider', selected ? 'text-white/80' : 'text-[#6D7A77]')}>
        Day {index + 1}
        {status && <span aria-label={status === 'block' ? 'Has problems' : 'Something is tight'} className={cx('w-2 h-2 rounded-full', status === 'block' ? 'bg-[#E5484D]' : 'bg-[#F2B544]')} />}
      </span>
      <span className="block text-sm font-semibold whitespace-nowrap">{formatDay(day)}</span>
      {city && <span className={cx('block text-[11px] font-semibold whitespace-nowrap max-w-[9rem] truncate', selected ? 'text-white' : 'text-[#00685F]')}>{city}</span>}
      <span className={cx('block text-[11px]', selected ? 'text-white/80' : 'text-[#6D7A77]')}>{count ? `${count} stop${count > 1 ? 's' : ''}` : 'Free'}</span>
    </button>
  );
}

function DayList({ empty, children }: { empty: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'day-list' });
  return (
    <div ref={setNodeRef} className={cx('rounded-3xl transition-colors min-h-40', isOver && 'bg-[#00685F]/5 outline-2 outline-dashed outline-[#00685F]/40')}>
      {empty ? (
        <Card className="p-6 text-center space-y-1">
          <p className="font-semibold text-[#161C23]">Nothing planned yet</p>
          <p className="text-sm text-[#6D7A77]">Drag an idea from the backlog here, or tap “Add” on one.</p>
        </Card>
      ) : (
        children
      )}
    </div>
  );
}

function StopRow({
  row,
  index,
  count,
  days,
  day,
  onNudge,
  onMoveDay,
  onBacklog,
  dayZone,
  weather,
  warnings,
  people,
  me,
  selected,
  onSelect,
  onEdit,
}: {
  row: Row;
  /** Position among the day's movable stops (-1 = locked). */
  index: number;
  count: number;
  days: string[];
  day: string;
  onNudge: (by: -1 | 1) => void;
  onMoveDay: (day: string) => void;
  onBacklog: () => void;
  dayZone: string;
  weather?: WeatherRisk;
  warnings: DayWarning[];
  people: Map<string, Member>;
  me: string;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const { item } = row;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: item.locked, data: { title: row.title } });
  const moment = item.start === item.end;
  const movable = !item.locked;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx(isDragging && 'opacity-40 z-10 relative', movable && 'touch-manipulation select-none')}
      // The whole card drags (mouse: move a few px; phone: press and hold) — not just the small handle.
      {...(movable ? { ...attributes, ...listeners, 'aria-roledescription': 'Draggable stop — hold and drag, or use the arrows' } : {})}
    >
      <Card className={cx('flex items-stretch', item.locked && 'bg-[#F3EFE9]', selected && 'ring-2 ring-[#00685F]/50', movable && 'cursor-grab active:cursor-grabbing')}>
        <div className="w-[4.75rem] shrink-0 py-3 pl-3 text-xs font-bold text-[#161C23] tabular-nums">
          <p>{fmtClock(toMin(item.start))}</p>
          {!moment && <p className="text-[#6D7A77] font-semibold">{fmtClock(toMin(item.end))}</p>}
          {row.zone && (row.zone !== dayZone || item.ref.kind === 'booking') && (
            <p className={cx('mt-0.5 text-[10px] leading-tight font-semibold', row.zone !== dayZone ? 'text-[#8A5A00]' : 'text-[#9AA5A3]')}>{row.zoneName ?? tzCity(row.zone)} time</p>
          )}
          {movable && <GripVertical className="mt-1 w-4 h-4 text-[#C9C2B8]" aria-hidden />}
        </div>
        <div className="flex-1 min-w-0 py-3 pr-2">
          <button type="button" onClick={onSelect} onKeyDown={(e) => e.stopPropagation()} aria-pressed={selected} className="block w-full text-left">
            <p className="flex items-center gap-1.5 font-semibold text-[#161C23]">
              <span className="text-[#00685F] shrink-0">{row.icon}</span>
              <span className="truncate">{row.title}</span>
            </p>
            {row.subtitle && !row.sides?.length && <p className="text-xs text-[#6D7A77] truncate">{row.subtitle}</p>}
          </button>
          {row.phone && (
            <a href={`tel:${row.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#00685F]" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
              <Phone className="w-3 h-3" /> {row.phone}
            </a>
          )}
          {row.note && <p className="text-xs font-semibold text-[#8A5A00]">🕑 {row.note}</p>}
          {!!row.journey?.length && <JourneyPrayerList list={row.journey} />}
          {weather && <p className="mt-1 text-xs text-[#1D4E89]">🌦 {weather.text}</p>}
          {!!row.sides?.length && <SplitGroups a={row} sides={row.sides} people={people} me={me} />}
          {warnings.map((w) => (
            <p key={`${w.itemId}-${w.kind}`} className={cx('mt-1 flex items-start gap-1 text-xs', w.severity === 'block' ? 'text-[#B3261E] font-semibold' : 'text-[#8A5A00]')}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {w.text}
            </p>
          ))}
          {/* Tapped: tap-friendly moves (earlier / later / another day) — the same as dragging. */}
          {movable && selected && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <button type="button" disabled={index <= 0} onClick={() => onNudge(-1)} className="inline-flex items-center gap-1 rounded-full border border-[#E7DFD5] bg-white px-2.5 min-h-8 text-xs font-semibold text-[#161C23] disabled:opacity-40">
                <ArrowUp className="w-3.5 h-3.5" /> Earlier
              </button>
              <button type="button" disabled={index < 0 || index >= count - 1} onClick={() => onNudge(1)} className="inline-flex items-center gap-1 rounded-full border border-[#E7DFD5] bg-white px-2.5 min-h-8 text-xs font-semibold text-[#161C23] disabled:opacity-40">
                <ArrowDown className="w-3.5 h-3.5" /> Later
              </button>
              <select
                aria-label={`Move ${row.title} to another day`}
                value=""
                onChange={(e) => e.target.value && onMoveDay(e.target.value)}
                className="rounded-full border border-[#E7DFD5] bg-white px-2.5 min-h-8 text-xs font-semibold text-[#161C23]"
              >
                <option value="">Move to day…</option>
                {days.map((d, k) =>
                  d === day ? null : (
                    <option key={d} value={d}>
                      Day {k + 1} · {formatDay(d)}
                    </option>
                  ),
                )}
              </select>
            </div>
          )}
        </div>
        {movable && (
          <div className="flex flex-col shrink-0 border-l border-[#F0EBE4]" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <button type="button" onClick={onEdit} aria-label={`Change ${row.title}`} title="Change day / time" className="flex-1 w-11 min-h-11 flex items-center justify-center text-[#6D7A77] hover:text-[#00685F]">
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onBacklog}
              aria-label={`Take ${row.title} off the timeline (back to the backlog)`}
              title="Back to the backlog"
              className="flex-1 w-11 min-h-11 flex items-center justify-center text-[#B3261E] hover:bg-[#FDECEA] border-t border-[#F0EBE4]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {item.locked && (
          <span className="w-11 shrink-0 flex items-center justify-center text-[#9AA5A3]" title="Booking — fixed time">
            <Lock className="w-4 h-4" />
          </span>
        )}
      </Card>
    </div>
  );
}

const MODE = {
  walk: { icon: Footprints, label: 'walk' },
  transit: { icon: TrainFront, label: 'by public transport' },
  drive: { icon: Car, label: 'by car' },
} as const;

/** Between a journey's departure and arrival: you're on it. */
function OnBoardRow({ booking }: { booking?: Booking }) {
  const min = booking ? Math.round((Date.parse(booking.endAt) - Date.parse(booking.startAt)) / 60_000) : 0;
  const Icon = booking ? KIND[booking.kind].icon : TrainFront;
  return (
    <p className="flex items-center gap-2 pl-8 py-1.5 text-xs text-[#6D7A77]">
      <span className="h-4 border-l-2 border-dotted border-[#D5CEC4]" />
      <Icon className="w-3.5 h-3.5" /> {booking?.kind === 'flight' ? 'In the air' : 'On board'}
      {min > 0 && ` · ${Math.floor(min / 60)} h ${min % 60} min`}
    </p>
  );
}

function TravelRow({ leg, a, b }: { leg?: TransitLeg; a?: GeoPoint; b?: GeoPoint }) {
  if (!leg && !(a && b)) return <div className="h-2" />;
  const Icon = leg ? MODE[leg.mode].icon : TrainFront;
  const text = leg
    ? leg.minutes === 0
      ? 'Same place'
      : `${leg.minutes} min ${MODE[leg.mode].label}${leg.meters ? ` · ${leg.meters < 1000 ? `${leg.meters} m` : `${(leg.meters / 1000).toFixed(1)} km`}` : ''}`
    : `About ${estimateTravelMin(a!, b!)} min (working out the route…)`;
  return (
    <p className="flex items-center gap-2 pl-8 py-1.5 text-xs text-[#6D7A77]">
      <span className="h-4 border-l-2 border-dotted border-[#D5CEC4]" />
      <Icon className="w-3.5 h-3.5" /> {text}
    </p>
  );
}

type OpenFilter = 'all' | 'open' | 'food' | 'sights';
const OPEN_FILTERS: [OpenFilter, string][] = [
  ['all', 'All'],
  ['open', 'Open this day'],
  ['food', 'Food'],
  ['sights', 'Places to see'],
];

/** "9:00 AM–5:00 PM" / "Closed" / null (unknown) for one date. */
function hoursOn(idea: Idea, day: string): { text: string; closed: boolean } | null {
  const r = openingRanges(idea.place.openingHours, day);
  if (r === null) return idea.place.openingHours ? { text: 'Open 24 hours', closed: false } : null;
  if (!r.length) return { text: 'Closed', closed: true };
  return { text: r.map(([o, c]) => `${fmtClock(o)}–${fmtClock(c % (24 * 60))}`).join(', '), closed: false };
}

/**
 * Backlog grouped by city (the trip destination each place is nearest to),
 * with each place's opening hours on the selected day; filter by city, "open
 * this day" and type. The day's own city comes first.
 */
function Backlog({
  ideas,
  pairName,
  onAdd,
  day,
  destinations,
  dayCity,
}: {
  ideas: Idea[];
  pairName: (ideaId: string) => string | undefined;
  onAdd: (idea: Idea) => void;
  day: string;
  destinations: { name: string; location: GeoPoint }[];
  dayCity: string;
}) {
  const [city, setCity] = useState<string>('all');
  const [filter, setFilter] = useState<OpenFilter>('all');
  const cityOf = (i: Idea) => nearestDestination(destinations, i.place.location).name;
  const cities = [...new Set(ideas.map(cityOf))].sort((a, b) => Number(b === dayCity) - Number(a === dayCity) || destinations.findIndex((d) => d.name === a) - destinations.findIndex((d) => d.name === b));
  const shown = ideas.filter((i) => {
    if (city !== 'all' && cityOf(i) !== city) return false;
    if (filter === 'open') return !hoursOn(i, day)?.closed;
    if (filter === 'food') return i.place.category === 'food';
    if (filter === 'sights') return i.place.category !== 'food';
    return true;
  });
  const groups = cities.map((c) => [c, shown.filter((i) => cityOf(i) === c)] as const).filter(([, l]) => l.length);
  const chip = (on: boolean) => cx('shrink-0 px-2.5 min-h-7 rounded-full text-xs font-semibold border', on ? 'bg-[#161C23] border-[#161C23] text-white' : 'bg-white border-[#E7DFD5] text-[#161C23]');

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-[#161C23]">Backlog</h2>
        <Badge tone="muted">{ideas.length}</Badge>
      </div>
      {ideas.length === 0 ? (
        <p className="text-sm text-[#6D7A77]">
          Ideas everyone approves land here. <Link to="../ideas" relative="path" className="font-semibold text-[#00685F]">Go to the Idea Board</Link>
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            {cities.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
                <button type="button" className={chip(city === 'all')} onClick={() => setCity('all')}>
                  All cities
                </button>
                {cities.map((c) => (
                  <button key={c} type="button" className={chip(city === c)} onClick={() => setCity(c)}>
                    {c}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
              {OPEN_FILTERS.map(([k, label]) => (
                <button key={k} type="button" className={chip(filter === k)} onClick={() => setFilter(k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {!groups.length && <p className="text-sm text-[#6D7A77]">Nothing matches these filters.</p>}
          {groups.map(([c, list]) => (
            <section key={c} className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#6D7A77]">
                <MapPin className="w-3 h-3" /> {c} · {list.length}
                {c === dayCity && <span className="normal-case tracking-normal font-semibold text-[#00685F]">· where you are this day</span>}
              </h3>
              <ul className="space-y-2">
                {list.map((i) => (
                  <BacklogItem key={i.id} idea={i} pair={pairName(i.id)} hours={hoursOn(i, day)} onAdd={() => onAdd(i)} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </Card>
  );
}

function BacklogItem({ idea, pair, hours, onAdd }: { idea: Idea; pair?: string; hours: { text: string; closed: boolean } | null; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `backlog:${idea.id}`, data: { title: idea.place.name } });
  const photo = idea.place.photoUrl ?? (idea.place.photoName ? placePhotoUrl(idea.place.photoName, 160) : null);
  return (
    <li ref={setNodeRef} className={cx('flex items-center gap-1 rounded-2xl border border-[#E7DFD5] bg-white p-2', isDragging && 'opacity-40')}>
      {/* Drag handle on larger screens; phones use "Add" so the list still scrolls. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag ${idea.place.name} onto a day`}
        className="hidden md:flex w-6 shrink-0 items-center justify-center text-[#9AA5A3] touch-none cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <button type="button" onClick={onAdd} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        {photo ? <img src={photo} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" loading="lazy" /> : <span className="w-10 h-10 rounded-xl bg-[#F3EFE9] shrink-0" />}
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[#161C23] truncate">{idea.place.name}</span>
          <span className="block text-xs text-[#6D7A77] truncate">
            {pair ? (
              <span className="inline-flex items-center gap-1 text-[#1D4E89]">
                <GitFork className="w-3 h-3" /> Split with {pair}
              </span>
            ) : (
              <>
                {idea.place.typeLabel ?? idea.place.category} · {idea.estDurationMin} min
              </>
            )}
          </span>
          {hours && (
            <span className={cx('block text-[11px] truncate', hours.closed ? 'text-[#B3261E] font-semibold' : 'text-[#3E4947]')}>
              {hours.closed ? 'Closed this day' : `🕒 ${hours.text}`}
            </span>
          )}
        </span>
      </button>
      <Button variant="ghost" className="shrink-0 px-2.5" onClick={onAdd} aria-label={`Add ${idea.place.name} to a day`}>
        <Plus className="w-4 h-4" /> Add
      </Button>
    </li>
  );
}

function SplitGroups({ a, sides, people, me }: { a: Row; sides: Row[]; people: Map<string, Member>; me: string }) {
  const group = (r: Row) => {
    const k = trackKeyOf(r.item.track) ?? 'A';
    const c = TRACK_COLOR[k];
    const mine = r.item.memberUids.includes(me);
    return (
      <div key={r.item.id} className={cx('rounded-lg px-2 py-1.5 min-w-0 border-l-4', mine && 'ring-1 ring-black/10')} style={{ background: c.soft, borderColor: c.main }}>
        <p className="text-[11px] font-bold" style={{ color: c.main }}>
          {k === 'A' ? 'Main group' : k === 'F' ? 'Free time' : c.label} · {fmtClock(toMin(r.item.start))}–{fmtClock(toMin(r.item.end))}
          {mine && ' · you'}
        </p>
        <p className="text-xs font-semibold text-[#161C23] truncate">{k === 'F' ? 'Explore nearby' : r.title}</p>
        <p className="text-[11px] text-[#6D7A77] truncate">{r.item.memberUids.map((u) => people.get(u)?.displayName ?? '?').join(', ')}</p>
      </div>
    );
  };
  return (
    <div className="mt-1.5 space-y-1">
      <p className="text-[11px] font-semibold text-[#161C23] flex items-center gap-1">
        <GitFork className="w-3 h-3" /> Split into {sides.length + 1} groups — 🚩 everyone meets back here at {fmtClock(toMin(a.item.end))}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {group(a)}
        {sides.map(group)}
      </div>
    </div>
  );
}

/** A prayer break's groups: who prays, what each of the others picked (each its own colour), who rests. */
function prayerGroups(item: ScheduleItem, members: Member[], me: string) {
  const p = item.prayer!;
  const name = (u: string) => (u === me ? 'you' : (members.find((m) => m.uid === u)?.displayName ?? '?'));
  const picks = p.fillerPicks ?? {};
  const byTitle = new Map<string, { title: string; place?: { name: string; location: GeoPoint }; uids: string[] }>();
  for (const [uid, pk] of Object.entries(picks)) {
    if (pk.kind === 'rest') continue;
    const g = byTitle.get(pk.title) ?? { title: pk.title, ...(pk.place ? { place: pk.place } : {}), uids: [] };
    g.uids.push(uid);
    byTitle.set(pk.title, g);
  }
  const groups = [...byTitle.values()].map((g, k) => ({ ...g, names: g.uids.map(name), color: PRAYER_PICK_COLORS[k % PRAYER_PICK_COLORS.length] }));
  // Praying: those who said they pray, plus anyone who hasn't said and didn't pick something else.
  const praying = members.filter((m) => !picks[m.uid] && (m.prefs ? m.prefs.prayerReminders : true)).map((m) => m.uid);
  // Resting / free time: said they don't pray and picked nothing — or picked "rest".
  const resting = members.filter((m) => (picks[m.uid]?.kind === 'rest') || (!picks[m.uid] && m.prefs && !m.prefs.prayerReminders)).map((m) => m.uid);
  const unsure = members.filter((m) => !m.prefs && !picks[m.uid]).map((m) => m.uid);
  return { picks: groups, praying, resting, unsure, name };
}

/**
 * A prayer break: its time is fixed like a booking (🔒, can't be dragged).
 * The group splits like any split — the people praying (at the mosque, where
 * everyone meets back), each activity the others picked in its own colour,
 * and whoever didn't pick resting nearby. Anyone who hasn't said whether they
 * pray (no preferences yet) can choose too.
 */
function PrayerRow({
  row,
  people,
  members,
  me,
  canPick,
  selected,
  onSelect,
  onPick,
  before,
  after,
}: {
  row: Row;
  people: Map<string, Member>;
  members: Member[];
  me: string;
  canPick: boolean;
  selected: boolean;
  onSelect: () => void;
  onPick: () => void;
  before?: string;
  after?: string;
}) {
  const p = row.item.prayer!;
  const f = p.facility;
  const g = prayerGroups(row.item, members, me);
  const myPick = p.fillerPicks?.[me];
  const iPray = g.praying.includes(me);
  const route = before && after && before !== after ? `on the way from ${before} to ${after}` : before ? `near ${before}` : after ? `before ${after}` : '';
  const meet = fmtClock(toMin(row.item.end));
  const where = f?.name ?? 'the prayer spot';
  const box = (key: string, color: { main: string; soft: string }, label: string, names: string[], sub?: string) => (
    <div key={key} className="rounded-lg px-2 py-1.5 min-w-0 border-l-4" style={{ background: color.soft, borderColor: color.main }}>
      <p className="text-[11px] font-bold truncate" style={{ color: color.main }}>
        {label}
      </p>
      {sub && <p className="text-xs font-semibold text-[#161C23] truncate">{sub}</p>}
      <p className="text-[11px] text-[#6D7A77] truncate">{names.join(', ') || '—'}</p>
    </div>
  );
  const split = g.picks.length > 0 || g.resting.length > 0;
  return (
    <Card className={cx('flex items-stretch my-1 border-[#EAD9A8] bg-[#FDF6E3]', selected && 'ring-2 ring-[#CA8A04]/50')}>
      <div className="w-[4.75rem] shrink-0 py-3 pl-3 text-xs font-bold tabular-nums" style={{ color: PRAYER_GROUP.main }}>
        <p>{fmtClock(toMin(row.item.start))}</p>
        <p className="font-semibold opacity-70">{meet}</p>
        <p className="mt-0.5 text-[10px] leading-tight font-semibold opacity-70">Fixed time</p>
      </div>
      <div className="flex-1 min-w-0 py-3 pr-2">
        <button type="button" onClick={onSelect} aria-pressed={selected} className="block w-full text-left">
          <p className="font-semibold truncate text-[#7A5500]">🕌 {p.prayer} prayer{split ? ' — the group splits' : ''}</p>
          <p className="text-xs text-[#6B5A2E]">
            {f ? `${f.name} · ${f.walkMin ? `${f.walkMin} min walk` : 'on site'}` : 'No mosque found nearby — any clean, quiet spot works'}
            {f && route && <span className="text-[#6D7A77]"> · {route}</span>}
          </p>
        </button>
        {split ? (
          <div className="mt-1.5 space-y-1">
            <p className="text-[11px] font-semibold text-[#161C23]">🚩 Everyone meets back at {where} at {meet}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {box('pray', PRAYER_GROUP, '🕌 Praying', g.praying.map(g.name), where)}
              {g.picks.map((x) => box(x.title, { main: x.color, soft: '#F5F7FB' }, '☕ Meanwhile', x.names, x.title))}
              {g.resting.length > 0 && box('rest', REST_GROUP, REST_GROUP.label, g.resting.map(g.name), 'Nearby')}
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-xs text-[#6B5A2E] truncate">{g.praying.map(g.name).join(', ')}</p>
        )}
        {!g.picks.length && p.fillerPlace && g.resting.length > 0 && (
          <p className="mt-0.5 text-xs text-[#1D4E89] truncate">☕ Idea for the others: {p.fillerPlace.name} nearby</p>
        )}
        {g.unsure.length > 0 && !split && <p className="mt-0.5 text-[11px] text-[#6D7A77]">Not set yet whether {g.unsure.map(g.name).join(', ')} pray{g.unsure.length === 1 && g.unsure[0] !== me ? 's' : ''} — they can pick something else.</p>}
        {canPick && (
          <button type="button" onClick={onPick} className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#1D4E89] px-2.5 py-1 text-xs font-semibold text-white">
            ☕ {myPick ? `You: ${myPick.title} — change` : iPray ? 'Not praying? Choose what to do' : 'Choose what to do meanwhile'}
          </button>
        )}
      </div>
      <span className="w-11 shrink-0 flex items-center justify-center" style={{ color: PRAYER_GROUP.main }} title="Prayer time — fixed like a booking; the place follows your plan">
        <Lock className="w-4 h-4" />
      </span>
    </Card>
  );
}
