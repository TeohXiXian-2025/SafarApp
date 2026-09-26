// Day-by-day timeline: bookings and prayer times are fixed anchors; approved
// ideas come in from the backlog and move with one method on phone and
// laptop — pick a stop up (tap Move, or drag its grip), then choose a gap
// between blocks; every gap shows when it would start, the travel in and out
// and what it pushes (placement.ts, the same maths the server saves with).
// AI Arrange plans the whole trip (shared preview → admin applies → undo).
// Prayer breaks are placed automatically for members who asked for them;
// split pairs show both groups side by side. Travel time comes from the
// Routes API (server-side). All times are local to where the group is that day.
import {
  DndContext,
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
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { AlertTriangle, Car, Loader2, Footprints, GitFork, GripVertical, Lock, Map as MapIcon, MapPin, Move, Pencil, Phone, Plus, Sparkles, TrainFront, Undo2, Utensils, X } from 'lucide-react';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ArrangeJob,
  Booking,
  byTimeAndPriority,
  planChain,
  BUFFER_MIN,
  type ChainRow,
  type Candidate,
  type GapOption,
  firstFit,
  gapOptions,
  journeyZones,
  placeAt,
  praysInside,
  citiesByDay,
  cityLabel,
  durationRange,
  hasCityDates,
  LONG_VISIT_MIN,
  cityOf,
  hasMeal,
  MEAL_WINDOW,
  Stay,
  transportGaps,
  withCityBase,
  type MealKey,
  dayFrames,
  daySuggestions,
  daySummary,
  isOutdoor,
  weatherRisk,
  forecastUrl,
  FORECAST_DAYS,
  type HourlyForecast,
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
  type DayFrame,
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
import { useTrip } from '../TripLayout';
import { PRAYER_GROUP, PRAYER_PICK_COLORS, REST_GROUP, TRACK_COLOR, trackKeyOf } from '../trackColors';
import { DayMap, type MapLink, type MapStop } from './DayMap';
import { ArrangeSheet } from './ArrangeSheet';
import { AddStopSheet, CANDIDATE, EditStopSheet, type Checker } from './StopSheets';
import { FixDaySheet } from './FixDaySheet';
import { useForecast } from './useForecast';
import { PrayerPickSheet } from './PrayerPickSheet';
import { PrayerPlaceSheet } from './PrayerPlaceSheet';
import { JourneyPrayerList } from '../JourneyPrayerList';
import { PlaceThumb } from '../../components/live/PlaceThumb';
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
  /** A prayer time during the visit is prayed there (room on site, a place a few minutes away, or ask staff). */
  prayInside?: boolean;
  /** A prayer room on site / a prayer place a few minutes away is actually known. */
  prayerKnown?: boolean;
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
      ...(r.prayInside ? { prayInside: true } : {}),
      ...(r.prayer ? { kind: 'prayer' as const, label: r.item.prayer ? `${r.item.prayer.prayer} prayer` : undefined } : isSide(r.item.track) ? { kind: 'side' as const } : { transitMin: travel(r) }),
      checkin: r.item.ref.kind === 'booking' && r.item.ref.event === 'checkin',
    })),
    (id) => all.find((r) => r.item.id === id)?.idea?.place.openingHours,
  );
}

type Travel = (a: GeoPoint, b: GeoPoint) => number;

/**
 * A day as the placement engine sees it (placement.ts) — the same chain the
 * server re-times with: blocks (stops move; prayer times and bookings don't),
 * travel (the measured Routes leg where there is one, else an estimate + 20 %)
 * and journeys as zones nothing can go in.
 */
function dayModel(list: Row[], bookings: Map<string, Booking>): { rows: ChainRow[]; travel: Travel; zones: ReturnType<typeof journeyZones> } {
  const main = list.filter((r) => !isSide(r.item.track));
  const rows: ChainRow[] = main.map((r) => ({
    id: r.item.id,
    start: toMin(r.item.start),
    end: Math.max(toMin(r.item.end), toMin(r.item.start)),
    fixed: r.item.locked || !!r.prayer,
    ...(r.prayer ? { prayer: true } : {}),
    ...(r.item.ref.kind === 'booking' && (r.item.ref.event === 'checkin' || r.item.ref.event === 'checkout') ? { soft: true } : {}),
    ...((r.in ?? r.out) ? { loc: (r.in ?? r.out)! } : {}),
    ...(r.prayInside ? { prayInside: true } : {}),
    ...(r.idea?.place.openingHours ? { open: openingRanges(r.idea.place.openingHours, r.item.day) } : {}),
    ...(r.item.pinned || r.meal ? { pinned: true } : {}),
  }));
  // Measured legs by the pair of places (several blocks can share a place — e.g. every prayer at one mosque).
  const at = (p: GeoPoint) => `${p.lat},${p.lng}`;
  const locOf = new Map(rows.flatMap((r) => (r.loc ? [[r.id, r.loc] as const] : [])));
  const legs = new Map(
    main.flatMap((r) => {
      const leg = r.item.transitFromPrev;
      const [a, b] = [leg?.fromId ? locOf.get(leg.fromId) : undefined, locOf.get(r.item.id)];
      return leg && a && b ? [[`${at(a)}>${at(b)}`, leg.minutes] as const] : [];
    }),
  );
  const travel: Travel = (a, b) => {
    if (a.lat === b.lat && a.lng === b.lng) return 0;
    return legs.get(`${at(a)}>${at(b)}`) ?? Math.round(estimateTravelMin(a, b) * 1.2);
  };
  const zones = journeyZones(
    main.flatMap((r) => {
      const ref = r.item.ref;
      if (ref.kind !== 'booking') return [];
      const b = bookings.get(ref.bookingId);
      return b ? [{ start: toMin(r.item.start), end: toMin(r.item.end), event: ref.event, bookingId: b.id, kind: b.kind, label: `your ${b.kind}` }] : [];
    }),
  );
  return { rows, travel, zones };
}

/** A day's rows at the times the tight chain gives them (what the timeline shows, and what the server saves). */
function chained(list: Row[], bookings: Map<string, Booking>): Row[] {
  const m = dayModel(list, bookings);
  const starts = planChain(m.rows, m.travel, undefined, { tight: true }).starts;
  return list.map((r) => {
    const s = starts.get(r.item.id);
    if (s === undefined || s === toMin(r.item.start)) return r;
    const len = toMin(r.item.end) - toMin(r.item.start);
    return { ...r, item: { ...r.item, start: toClock(s), end: toClock(s + len) } };
  });
}

/** A prayer time held inside a stop (A → pray → back to A): its minutes are part of the stop's length. */
function heldPrayerMin(list: Row[], r: Row): number {
  if (!r.prayInside) return 0;
  const [s, e] = [toMin(r.item.start), toMin(r.item.end)];
  const p = list.find((x) => x.prayer && toMin(x.item.start) >= s && toMin(x.item.start) < e);
  return p ? toMin(p.item.end) - toMin(p.item.start) : 0;
}

const candidateOf = (idea: Idea, id: string, duration: number): Candidate => ({
  id,
  duration,
  loc: idea.place.location,
  ...(idea.place.openingHours ? { hours: idea.place.openingHours } : {}),
  ...(praysInside(prayerWalkOf(idea)) ? { prayInside: true } : {}),
});

/** Checks / suggests a time for one stop (new or moved) against the rest of that day — the placement engine. */
function makeChecker(rowsByDay: Map<string, Row[]>, bookings: Map<string, Booking>, idea: Idea | undefined, movingIds: string[]): Checker | undefined {
  if (!idea) return undefined;
  // The day as shown: chained tightly (the check and the suggestion must see the same times).
  const others = (d: string) => chained((rowsByDay.get(d) ?? []).filter((r) => !movingIds.includes(r.item.id)), bookings);
  const keyOf = (w: DayWarning) => `${w.itemId}:${w.kind}`;
  return {
    check: (d, start, duration) => {
      const base = others(d);
      const m = dayModel(base, bookings);
      const place = placeAt(d, m.rows, candidateOf(idea, CANDIDATE, duration), start, m.travel, m.zones);
      const before = new Set(warningsFor(d, base).map(keyOf));
      const candidate: Row = {
        item: {
          id: CANDIDATE, day: d, start: toClock(start), end: toClock(start + duration), ref: { kind: 'idea', ideaId: idea.id },
          track: 'all', memberUids: [], locked: false, orderIndex: 999, updatedBy: 'me', updatedAt: 0,
        },
        title: idea.place.name, icon: null, idea, in: idea.place.location, out: idea.place.location,
        ...(praysInside(prayerWalkOf(idea)) ? { prayInside: true } : {}),
      };
      // Only what this placement adds: its own problems + the ones it causes for the next stop.
      const own = warningsFor(d, [...base, candidate]).filter((w) => w.itemId === CANDIDATE || !before.has(keyOf(w)));
      const journey: DayWarning[] = place.problem === 'journey' ? [{ itemId: CANDIDATE, kind: 'overlap', severity: 'block', text: `${place.why}.` }] : [];
      return [...journey, ...own];
    },
    suggest: (d, duration) => {
      const m = dayModel(others(d), bookings);
      return firstFit(d, m.rows, candidateOf(idea, CANDIDATE, duration), m.travel, m.zones)?.start ?? null;
    },
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
    return { item, idea, title: idea.place.name, subtitle: idea.place.typeLabel, icon: <MapPin className="w-4 h-4" />, in: idea.place.location, out: idea.place.location, ...(praysInside(prayerWalkOf(idea)) ? { prayInside: true } : {}), ...(prayerWalkOf(idea) !== undefined && praysInside(prayerWalkOf(idea)) ? { prayerKnown: true } : {}) };
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

/** The stop being moved (or a backlog idea being placed) until a gap is chosen. */
interface MoveState {
  /** Schedule item id, or "backlog:{ideaId}". */
  id: string;
  ideaId?: string;
  title: string;
  fromDay: string;
  cand: Candidate;
  /** A split pair: its length comes from the split. */
  split: boolean;
  /** Trip destination index of the place (null: single-city trip / unknown). */
  city: number | null;
}

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
        if (b && b.travellerUids.some((u) => prayingUids.has(u)))
          row.journey = journeyPrayers(b, { from: clockName(b.from?.timezone ?? b.to.timezone, b.from?.location, trip.destinations), to: clockName(b.to.timezone, b.to.location, trip.destinations) });
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
    // Keep bookings and prayer times where they are; fill the movable slots in the new order
    // (prayer rows aren't `locked` in the data — they must not take a stop's place).
    const byId = new Map(base.map((r) => [r.item.id, r]));
    const queue = pending.order.flatMap((id) => byId.get(id) ?? []);
    return base.map((r) => (r.item.locked || r.prayer || !pending.order.includes(r.item.id) ? r : (queue.shift() ?? r)));
  }, [rowsByDay, day, pending]);

  // ── The day as one chain: travel between every pair of blocks (stops, prayer places, bookings) ──
  const model = useMemo(() => dayModel(rows, bookingMap), [rows, bookingMap]);
  // Chained tightly, like the server: each stop starts when the one before ends + the trip there.
  const chain = useMemo(() => planChain(model.rows, model.travel, undefined, { tight: true }), [model]);
  // Saved times that don't follow the chain yet (planned before it was tight) → re-time the day once.
  const offChain = rows.filter((r) => !r.item.locked && !r.prayer && !isSide(r.item.track) && chain.starts.has(r.item.id) && chain.starts.get(r.item.id) !== toMin(r.item.start)).map((r) => r.item.id).join();

  // Checked at the times shown (the day chained: stops start when the one before ends + the trip there).
  const timedRows = useMemo(() => chained(rows, bookingMap), [rows, bookingMap]);
  const dayList = useMemo(() => warningsFor(day, timedRows), [timedRows, day]);
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
    // Once per day per expected set (a changed flight or hotel changes what's expected → refresh again).
    const key = `${day}|${expected}|${offChain}`;
    if (loading || (expected === actual && !offChain) || !navigator.onLine || refreshed.current.has(key)) return;
    refreshed.current.add(key);
    void api.post('schedule/refresh', { day }, { tripId: trip.id }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expected, actual, offChain, day]);

  // Live weather for today and tomorrow (further out the forecast isn't worth acting on): the alert shows
  // whichever day you're looking at — the day before and on the day.
  const todayThere = new Intl.DateTimeFormat('en-CA', { timeZone: trip.destinations[0].timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const tomorrowThere = new Date(Date.parse(`${todayThere}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const weatherDay = day === todayThere || day === tomorrowThere;
  /** Where the group is on a day: its first stop, else its city. */
  const whereOn = (d: string): GeoPoint => {
    const stop = (rowsByDay.get(d) ?? []).find((r) => !r.prayer && !r.item.locked && r.in)?.in;
    const c = dayCities.get(d)?.at(-1);
    return stop ?? (c !== undefined ? trip.destinations[c].location : trip.destinations[0].location);
  };
  const fToday = useForecast(days.includes(todayThere) ? todayThere : '', whereOn(todayThere));
  const fTomorrow = useForecast(days.includes(tomorrowThere) ? tomorrowThere : '', whereOn(tomorrowThere));
  const forecastOn = (d: string) => (d === todayThere ? fToday : d === tomorrowThere ? fTomorrow : null);
  const forecast = forecastOn(day);
  // Indoor backups the admin could bring back for a rainy day.
  const backups = useMemo(() => (isAdmin ? ideas.data.filter((i) => i.status === 'backup' && !isOutdoor(i.place)) : []), [ideas.data, isAdmin]);
  const outlook = forecast ? daySummary(forecast, day) : null;
  /** Outdoor stops the weather may spoil on a day. */
  const risksOn = (d: string) => {
    const f = forecastOn(d);
    if (!f) return [];
    return (rowsByDay.get(d) ?? []).flatMap((r) => {
      if (!r.idea || r.prayer || !isOutdoor(r.idea.place)) return [];
      const risk = weatherRisk(f, d, toMin(r.item.start), toMin(r.item.end));
      return risk ? [{ row: r, risk }] : [];
    });
  };
  // The heads-up at the top (any day you're on): today's and tomorrow's affected stops.
  const weatherHeads = [todayThere, tomorrowThere].filter((d) => days.includes(d)).map((d) => ({ day: d, risks: risksOn(d) })).filter((h) => h.risks.length);
  const weather = useMemo(() => {
    const out = new Map<string, { risk: WeatherRisk; swaps: Idea[] }>();
    if (!forecast || !weatherDay) return out;
    const city = (loc: GeoPoint) => (trip.destinations.length > 1 ? cityOf(trip.destinations, loc) : 0);
    for (const { row: r, risk } of risksOn(day)) {
      // Plan B from your own ideas: indoor backlog / backup places in the same city, nearby, open that day.
      const swaps = [...backlog, ...backups]
        .filter((i) => !isOutdoor(i.place) && city(i.place.location) === city(r.idea!.place.location) && metersBetween(i.place.location, r.idea!.place.location) < 5000 && openingRanges(i.place.openingHours, day)?.length !== 0)
        .sort((a, b) => metersBetween(a.place.location, r.idea!.place.location) - metersBetween(b.place.location, r.idea!.place.location))
        .slice(0, 3);
      out.set(r.item.id, { risk, swaps });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecast, rowsByDay, day, backlog, backups, weatherDay]);
  const [planB, setPlanB] = useState<{ day: string; text: string } | null>(null);
  const [askingPlanB, setAskingPlanB] = useState(false);
  // Indoor places found nearby (per stop) and a drier day in the same city (per stop).
  const [indoor, setIndoor] = useState<Record<string, { placeId: string; name: string; location: GeoPoint; typeLabel: string; minutes: number; source?: string }[] | 'loading'>>({});
  const [otherDay, setOtherDay] = useState<Record<string, { day: string; start: number } | 'none' | 'loading'>>({});
  const findIndoor = (id: string) => {
    setIndoor((m) => ({ ...m, [id]: 'loading' }));
    void api
      .post<{ places: { placeId: string; name: string; location: GeoPoint; typeLabel: string; minutes: number; source?: string }[] }>('schedule/indoor-options', { id }, { tripId: trip.id })
      .then((r) => setIndoor((m) => ({ ...m, [id]: r.places })))
      .catch((e) => (setIndoor((m) => ({ ...m, [id]: [] })), setError((e as Error).message)));
  };
  /** Another day in the same city (within the forecast) where it fits and the weather is fine. */
  const findDrierDay = async (r: Row) => {
    const id = r.item.id;
    setOtherDay((m) => ({ ...m, [id]: 'loading' }));
    const idea = r.idea!;
    const city = cityOfLoc(idea.place.location);
    const dur = Math.max(5, toMin(r.item.end) - toMin(r.item.start) - heldPrayerMin(rows, r));
    const ahead = (d: string) => (Date.parse(d) - Date.parse(todayThere)) / 86_400_000;
    for (const d of days.filter((x) => x !== day && ahead(x) >= 0 && ahead(x) <= FORECAST_DAYS && !cityRule(city, x))) {
      const m = dayModel(rowsByDay.get(d) ?? [], bookingMap);
      const fit = firstFit(d, m.rows, candidateOf(idea, id, dur), m.travel, m.zones);
      if (!fit) continue;
      const f = await fetch(forecastUrl(idea.place.location, d), { signal: AbortSignal.timeout(8000) })
        .then((x) => (x.ok ? x.json() : null))
        .then((j: { hourly?: HourlyForecast } | null) => j?.hourly ?? null)
        .catch(() => null);
      if (f && !weatherRisk(f, d, fit.start, fit.end)) return setOtherDay((mm) => ({ ...mm, [id]: { day: d, start: fit.start } }));
    }
    setOtherDay((mm) => ({ ...mm, [id]: 'none' }));
  };

  // 🍽 Lunch / dinner: a day out with no food stop at meal time gets a nudge (with halal places nearby).
  const mainStops = rows.filter((r) => !r.item.locked && !r.prayer && !isSide(r.item.track));
  /**
   * Every day at the destination gets a meal line: each of lunch / dinner is
   * planned (the food stop in its window), missing, or not needed (you're
   * travelling / not there yet then). It doesn't come and go as stops move.
   */
  const meals = useMemo(() => {
    const [inFrom, inTo] = frame.inTrip ?? [0, 24 * 60];
    return (['lunch', 'dinner'] as MealKey[]).map((m) => {
      const [a, b] = MEAL_WINDOW[m];
      const there = Math.min(inTo, b) - Math.max(inFrom, a) >= 60;
      const eat = mainStops.find((r) => isFood(r) && hasMeal([{ start: toMin(r.item.start), end: toMin(r.item.end), food: true }], m));
      // A long visit over the whole meal time (theme park, festival…): you eat there.
      const within = eat ? undefined : mainStops.find((r) => toMin(r.item.end) - toMin(r.item.start) >= LONG_VISIT_MIN && toMin(r.item.start) <= a && toMin(r.item.end) >= Math.min(b, a + 90));
      return { key: m, there, eat, within };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, frame.inTrip]);
  const missingMeals = meals.filter((m) => m.there && !m.eat && !m.within).map((m) => m.key);
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

  // AI plan: one shared preview for the trip (the newest open one) — every member sees the same; the admin applies.
  const openPlan = jobs.data.find((j) => j.status === 'preview');
  const [viewPlan, setViewPlan] = useState(false);
  const [arranging, setArranging] = useState<'day' | 'trip' | null>(null);
  const lastJob = jobs.data.find((j) => j.status !== 'discarded');
  const canUndo = isAdmin && lastJob?.status === 'applied';

  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  // Tapping a stop selects it: its actions (Move, ±15, Map) open, and it's focused on the map
  // beside the list (on phones the map opens only from its Map button, so Move stays in view).
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setSelected(null), [day]);
  const select = (id: string) => setSelected((cur) => (cur === id ? null : id));
  const showOnMap = (id: string) => {
    setSelected(id);
    setShowMap(true);
  };
  const [adding, setAdding] = useState<Idea | null>(null);
  const [picking, setPicking] = useState<ScheduleItem | null>(null);
  const [placing, setPlacing] = useState<ScheduleItem | null>(null);
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

  // Dragging starts from a grip handle (touch-action: none), so it can start on a small move —
  // no press-and-hold — while swiping anywhere else still scrolls the page.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // ── Moving a stop: one method on phone and laptop ──
  // Pick it up (tap Move, or start dragging its grip), then choose a gap between the day's blocks.
  // Every gap shows when it would start, the travel in and out, and what it pushes later —
  // placement.ts, the same maths the server saves with, so the time shown is the time saved.
  const [moving, setMoving] = useState<MoveState | null>(null);
  const [hoverGap, setHoverGap] = useState<string | null>(null);
  const [landed, setLanded] = useState<Map<string, number> | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => setLanded(null), [schedule.data]);
  useEffect(() => setHoverGap(null), [day, moving]);
  /** Why a stop in `city` (trip destination index) can't go on day `d`, or null. */
  const cityRule = (city: number | null, d: string): string | null => {
    if (city === null || trip.destinations.length < 2) return null;
    const there = dayCities.get(d);
    return there?.length && !there.includes(city) ? `you're in ${cityLabel(trip.destinations, there)}` : null;
  };
  const cityOfLoc = (loc?: GeoPoint) => (loc && trip.destinations.length > 1 ? cityOf(trip.destinations, loc) : null);
  const dayRuleFor = (loc?: GeoPoint) => (d: string) => cityRule(cityOfLoc(loc), d);
  const blockedDay = moving ? cityRule(moving.city, day) : null;
  const gaps: GapOption[] = useMemo(
    () => (moving && !blockedDay ? gapOptions(day, model.rows, moving.cand, model.travel, model.zones) : []),
    [moving, blockedDay, day, model],
  );
  const gapByKey = useMemo(() => new Map(gaps.map((g) => [g.key, g])), [gaps]);
  const hovered = hoverGap ? gapByKey.get(hoverGap) : undefined;
  // Hovering a gap (laptop) or dragging over one: the whole day re-timed live around it.
  const shownStart = (id: string) => (hovered?.placement.ok ? hovered.placement.starts.get(id) : undefined) ?? landed?.get(id) ?? chain.starts.get(id);

  const titleOf = (id?: string) => rows.find((r) => r.item.id === id)?.title;
  const startMove = (r: Row) => {
    setSelected(null);
    setShowMap(false);
    const split = !!r.sides?.length;
    const base = Math.max(5, toMin(r.item.end) - toMin(r.item.start) - heldPrayerMin(rows, r));
    const cand: Candidate = r.idea
      ? candidateOf(r.idea, r.item.id, base)
      : { id: r.item.id, duration: base, ...((r.in ?? r.out) ? { loc: (r.in ?? r.out)! } : {}) };
    setMoving({ id: r.item.id, title: r.title, fromDay: day, cand, split, city: cityOfLoc(cand.loc) });
  };
  const startPlace = (idea: Idea, duration: number = durationRange(idea.estDurationMin).min) => {
    setShowMap(false);
    const split = approved.some((s) => s.tracks.some((t) => t.key === 'A' && t.ideaId === idea.id));
    setMoving({ id: `backlog:${idea.id}`, ideaId: idea.id, title: idea.place.name, fromDay: day, cand: candidateOf(idea, `backlog:${idea.id}`, duration), split, city: cityOfLoc(idea.place.location) });
    // Bring the day's list (with its gaps) into view.
    setTimeout(() => document.getElementById('day-list')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
  };
  /** Put the stop being moved into a gap. */
  const place = (g: GapOption) => {
    const m = moving;
    if (!m || !g.placement.ok) return;
    setMoving(null);
    setLanded(g.placement.starts);
    const start = toClock(g.placement.start);
    const len = g.placement.end - g.placement.start;
    void call(async () => {
      const res = m.ideaId
        ? await api.post<{ start?: string; moved?: boolean }>('schedule/add', { ideaId: m.ideaId, day, start, pinned: false, ...(m.split ? {} : { durationMin: len }) }, { tripId: trip.id })
        : await api.post<{ start?: string; moved?: boolean }>('schedule/update', { id: m.id, day, start, pinned: false, ...(m.split ? {} : { durationMin: len }) }, { tripId: trip.id });
      if (res?.moved && res.start) setNotice(`${m.title} was saved at ${fmtClock(toMin(res.start))} — the measured route there takes longer than the estimate.`);
    });
  };
  /** Earlier / later by 15 minutes (checked like any move). */
  const shift = (r: Row, by: number) => {
    const others = dayModel(rows.filter((x) => x.item.id !== r.item.id), bookingMap);
    const base = Math.max(5, toMin(r.item.end) - toMin(r.item.start) - heldPrayerMin(rows, r));
    const cand: Candidate = r.idea ? candidateOf(r.idea, r.item.id, base) : { id: r.item.id, duration: base, ...((r.in ?? r.out) ? { loc: (r.in ?? r.out)! } : {}) };
    const p = placeAt(day, others.rows, { ...cand, pinned: true }, toMin(r.item.start) + by, others.travel, others.zones);
    if (!p.ok) return setError(`${r.title} can't start at ${fmtClock(toMin(r.item.start) + by)}: ${p.why?.toLowerCase()}.`);
    setLanded(p.starts);
    void call(() => api.post('schedule/update', { id: r.item.id, start: toClock(p.start), pinned: true, ...(r.sides?.length ? {} : { durationMin: p.end - p.start }) }, { tripId: trip.id }));
  };
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 9000);
    return () => clearTimeout(t);
  }, [notice]);
  // Esc cancels a move.
  useEffect(() => {
    if (!moving) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoving(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moving]);

  // "Back to backlog" with a short undo.
  const [removed, setRemoved] = useState<{ ideaId?: string; title: string; day: string; start: string; duration: number } | null>(null);
  const toBacklog = (r: Row) =>
    void call(async () => {
      const res = await api.post<{ ideaId?: string }>('schedule/remove', { id: r.item.id }, { tripId: trip.id });
      // A lunch / dinner restaurant comes back as a backlog idea (its id is in the reply).
      const ideaId = r.item.ref.kind === 'idea' ? r.item.ref.ideaId : res?.ideaId;
      setRemoved({ ...(ideaId ? { ideaId } : {}), title: r.title, day: r.item.day, start: r.item.start, duration: toMin(r.item.end) - toMin(r.item.start) });
    });
  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => setRemoved(null), 8000);
    return () => clearTimeout(t);
  }, [removed]);
  const arrange = async (scope: 'day' | 'trip') => {
    setArranging(scope);
    await call(async () => {
      await api.post<ArrangeJob>('schedule/arrange', scope === 'day' ? { day } : {}, { tripId: trip.id });
      setViewPlan(true);
    });
    setArranging(null);
  };

  // Dragging is a shortcut into the same move: the gaps are the drop targets; hovering a day
  // (in the bar at the bottom) for a moment switches to it.
  const collision: CollisionDetection = (args) => {
    const under = pointerWithin(args);
    const chip = under.find((c) => String(c.id).startsWith('bar:'));
    if (chip) return [chip];
    const gap = under.find((c) => String(c.id).startsWith('gap:'));
    if (gap) return [gap];
    const all = args.droppableContainers.filter((c) => String(c.id).startsWith('gap:'));
    return all.length ? closestCenter({ ...args, droppableContainers: all }) : under;
  };
  const dayHover = useRef<{ day: string; t: ReturnType<typeof setTimeout> } | null>(null);
  const clearDayHover = () => {
    if (dayHover.current) clearTimeout(dayHover.current.t);
    dayHover.current = null;
  };
  const onDragStart = (e: DragStartEvent) => {
    setDragging({ title: String(e.active.data.current?.title ?? '') });
    const id = String(e.active.id);
    if (id.startsWith('backlog:')) {
      const idea = ideaMap.get(id.slice(8));
      if (idea) startPlace(idea);
    } else {
      const r = rows.find((x) => x.item.id === id);
      if (r) startMove(r);
    }
  };
  const onDragOver = ({ over }: DragOverEvent) => {
    const id = over ? String(over.id) : '';
    if (id.startsWith('gap:')) setHoverGap(id.slice(4));
    else setHoverGap(null);
    if (id.startsWith('bar:')) {
      const d = id.slice(4);
      if (d !== day && dayHover.current?.day !== d) {
        clearDayHover();
        dayHover.current = { day: d, t: setTimeout(() => setDay(d), 600) };
      }
    } else clearDayHover();
  };
  // The browser's scroll anchoring would jump the page while auto-scrolling a drag.
  useEffect(() => {
    document.documentElement.style.overflowAnchor = dragging ? 'none' : '';
  }, [dragging]);
  const onDragEnd = ({ over }: DragEndEvent) => {
    setDragging(null);
    clearDayHover();
    const id = over ? String(over.id) : '';
    // Dropped in a gap → placed. Anywhere else the stop stays picked up: tap a gap (or Cancel).
    if (id.startsWith('gap:')) {
      const g = gapByKey.get(id.slice(4));
      if (g?.placement.ok) place(g);
      else if (g) setError(`Not there: ${g.placement.why?.toLowerCase()}. Pick another spot.`);
    } else if (id.startsWith('bar:')) setDay(id.slice(4));
  };
  // A label that follows the pointer (the list re-flows when the gaps open, so a copy of the card would drift).
  const [dragAt, setDragAt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!dragging) return setDragAt(null);
    const onMove = (e: PointerEvent | TouchEvent) => {
      const p = 'touches' in e ? e.touches[0] : e;
      if (p) setDragAt({ x: p.clientX, y: p.clientY });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('touchmove', onMove);
    };
  }, [dragging]);
  const onDragCancel = () => {
    setDragging(null);
    clearDayHover();
  };

  /**
   * Where a new stop goes by default: the first day in its city (the day on
   * screen first) with a time that clashes with nothing; failing that, the
   * emptiest day in that city after its last stop.
   */
  const defaultSlot = (idea: Idea, duration: number): { day: string; start: string; fits: boolean } => {
    const city = cityOfLoc(idea.place.location);
    const inCity = city === null ? days : days.filter((d) => dayCities.get(d)?.includes(city));
    const unknown = days.filter((d) => !dayCities.get(d)?.length);
    const pool = inCity.length ? inCity : unknown.length ? unknown : days;
    const ordered = [...pool].sort((a, b) => Number(b === day) - Number(a === day) || a.localeCompare(b));
    const checker = makeChecker(rowsByDay, bookingMap, idea, []);
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
  let stopNo = 0;
  rows.forEach((r) => {
    const at = r.in ?? r.out;
    if (!at) return;
    if (r.prayer) {
      // Prayer places are numbered in the day's order too, and marked as a mosque.
      stopNo++;
      const groups = prayerGroups(r.item, members, me.uid);
      mapStops.push({ id: r.item.id, kind: 'prayer', label: String(stopNo), badge: '🕌', title: `${stopNo}. ${r.item.prayer?.facility?.name ?? r.title} (${r.item.prayer?.prayer} prayer)`, location: at, color: PRAYER_GROUP.main, ...(groups.picks.length ? { meet: `Meet ${fmtClock(toMin(r.item.end))}` } : {}) });
      groups.picks.forEach((g, k) => {
        if (!g.place) return;
        mapStops.push({ id: `${r.item.id}:pick${k}`, kind: 'side', label: `${stopNo}${String.fromCharCode(97 + k)}`, title: `While others pray: ${g.title} (${g.names.join(', ')})`, location: g.place.location, color: g.color });
        mapLinks.push({ from: at, to: g.place.location, color: g.color });
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
    for (const s of r.sides ?? []) {
      const k = trackKeyOf(s.item.track);
      if (!k || k === 'F' || !s.in) continue;
      mapStops.push({ id: s.item.id, kind: 'side', label: `${stopNo}${k.toLowerCase()}`, title: s.title, location: s.in, color: TRACK_COLOR[k].main });
      mapLinks.push({ from: at, to: s.in, color: TRACK_COLOR[k].main });
    }
  });

  return (
    <DndContext sensors={sensors} collisionDetection={collision} autoScroll={{ acceleration: 30, threshold: { x: 0, y: 0.18 } }} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-[#161C23]">Timeline</h1>
            <p className="text-sm text-[#6D7A77]">Tap a stop, then Move (or drag its grip ⋮⋮) and pick a spot. Bookings and prayer times stay fixed.</p>
          </div>
          {/* One control, two scopes: AI plans this day or the whole trip (a shared preview the admin applies). */}
          <div className="flex items-stretch gap-2 sm:shrink-0">
            <div role="group" aria-label="AI plan" className="flex flex-1 sm:flex-none min-h-11 rounded-xl border border-[#00685F] overflow-hidden text-sm font-bold">
              <span className="flex items-center gap-1.5 pl-3 pr-2.5 bg-[#00685F] text-white">
                <Sparkles className="w-4 h-4" /> <span className="whitespace-nowrap">AI plan</span>
              </span>
              {(['day', 'trip'] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => void arrange(scope)}
                  disabled={!!arranging}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 whitespace-nowrap text-[#00685F] bg-white hover:bg-[#00685F]/10 border-l border-[#00685F]/30 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {arranging === scope && <Loader2 className="w-4 h-4 animate-spin" />}
                  {scope === 'day' ? 'This day' : 'Whole trip'}
                </button>
              ))}
            </div>
            <Button variant="secondary" className="md:hidden shrink-0" onClick={() => setShowMap((v) => !v)} aria-pressed={showMap}>
              <MapIcon className="w-4 h-4" /> {showMap ? 'List' : 'Map'}
            </Button>
          </div>
        </div>
        {openPlan && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#00685F]/30 bg-[#00685F]/5 px-4 py-2.5 text-sm">
            <span className="text-[#161C23] min-w-0">
              <Sparkles className="inline w-4 h-4 text-[#00685F] -mt-0.5" /> An AI plan for <b>{openPlan.day ? formatDay(openPlan.day) : 'the whole trip'}</b> is ready
              {openPlan.createdBy !== me.uid ? ` (by ${people.get(openPlan.createdBy)?.displayName ?? 'a member'})` : ''}
              {isAdmin ? ' — review and apply it.' : ' — the admin can apply it.'}
            </span>
            <Button variant="secondary" className="shrink-0 !min-h-9" onClick={() => setViewPlan(true)}>
              Review
            </Button>
          </div>
        )}
        {canUndo && lastJob && (
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
        {notice && <p className="rounded-2xl border border-[#C9DDF2] bg-[#F3F8FD] px-4 py-2 text-sm text-[#1D4E89]">{notice}</p>}
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

        {meals.some((m) => m.there) && (
          <div className={cx('rounded-2xl border px-4 py-2.5 text-sm space-y-1.5', missingMeals.length ? 'border-[#F2D8B0] bg-[#FFF8EC]' : 'border-[#CFE7E2] bg-[#EEF7F5]')}>
            {meals.map((m) => {
              const name = m.key === 'lunch' ? 'Lunch' : 'Dinner';
              return (
                <div key={m.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Utensils className={cx('w-4 h-4 shrink-0', m.eat ? 'text-[#00685F]' : m.there ? 'text-[#8A5A00]' : 'text-[#9AA5A3]')} />
                  <p className="flex-1 min-w-[10rem] text-[#161C23]">
                    <b>{name}</b>{' '}
                    {m.eat ? (
                      <span>✓ {m.eat.title.replace(/^(Lunch|Dinner) · /, '')} · {fmtClock(toMin(m.eat.item.start))}</span>
                    ) : m.within ? (
                      <span>at {m.within.title} — find halal food inside or right by it</span>
                    ) : m.there ? (
                      <span className="text-[#8A5A00]">🟡 not planned yet ({m.key === 'lunch' ? '11:30 AM–2 PM' : '6–8:30 PM'})</span>
                    ) : (
                      <span className="text-[#6D7A77]">— travelling / not there then</span>
                    )}
                  </p>
                  {m.there && !m.eat && (
                    <Button variant="secondary" className="shrink-0 !min-h-8 !px-3 text-xs" onClick={() => setMealFor(m.key)}>
                      Find halal {m.key} {m.within ? 'there' : 'nearby'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

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

        {weatherHeads.filter((h) => h.day !== day).map((h) => (
          <button
            key={h.day}
            type="button"
            onClick={() => setDay(h.day)}
            className="w-full text-left flex items-start gap-3 rounded-2xl border border-[#C9DDF2] bg-[#F3F8FD] px-4 py-2.5 text-sm text-[#1D4E89]"
          >
            <span className="text-base leading-none mt-0.5">🌦</span>
            <span className="flex-1 min-w-0">
              <b>{h.day === todayThere ? 'Today' : 'Tomorrow'} (Day {days.indexOf(h.day) + 1}{dayCities.get(h.day)?.length && trip.destinations.length > 1 ? `, ${cityLabel(trip.destinations, dayCities.get(h.day)!)}` : ''})</b>: the weather may spoil{' '}
              {h.risks.map((x) => x.row.title).join(', ')} — {h.risks[0].risk.text.split(' — ')[0].toLowerCase()}.
              <span className="block text-xs font-semibold underline underline-offset-2">See plan B</span>
            </span>
          </button>
        ))}

        {weather.size > 0 && (
          <div className="rounded-2xl border border-[#C9DDF2] bg-[#F3F8FD] px-4 py-3 space-y-3 text-sm">
            <p className="font-bold text-[#1D4E89]">
              🌦 {day === todayThere ? 'Today' : 'Tomorrow'}: weather may spoil {weather.size} outdoor stop{weather.size > 1 ? 's' : ''} — pick a plan B
            </p>
            {[...weather].map(([id, w]) => {
              const r = rows.find((x) => x.item.id === id)!;
              const dur = toMin(r.item.end) - toMin(r.item.start);
              // A drier time today that still fits the plan.
              const checker = makeChecker(rowsByDay, bookingMap, r.idea, [r.item.id]);
              const drier = forecast
                ? Array.from({ length: 53 }, (_, k) => 8 * 60 + k * 15)
                    .filter((s) => s + dur <= 22 * 60 && s !== toMin(r.item.start) && !weatherRisk(forecast, day, s, s + dur) && !checker?.check(day, s, dur).some((x) => x.severity === 'block'))
                    .sort((a, b) => Math.abs(a - toMin(r.item.start)) - Math.abs(b - toMin(r.item.start)))[0]
                : undefined;
              const found = indoor[id];
              const moveTo = otherDay[id];
              const btn = '!min-h-8 !px-3 text-xs';
              return (
                <div key={id} className="space-y-1.5 rounded-xl bg-white/70 border border-[#DCE8F5] p-2.5">
                  <p className="text-[#161C23]">
                    <b>{r.title}</b> ({fmtClock(toMin(r.item.start))}): {w.risk.text}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {drier !== undefined && (
                      <Button variant="secondary" className={btn} onClick={() => void call(() => api.post('schedule/update', { id, start: toClock(drier) }, { tripId: trip.id }))}>
                        ⏰ Move to {fmtClock(drier)} (drier)
                      </Button>
                    )}
                    {w.swaps.map((sw) => (
                      <Button key={sw.id} variant="secondary" className={btn} onClick={() => void call(() => api.post('schedule/swap', { id, ideaId: sw.id }, { tripId: trip.id }))}>
                        🏛 Swap for {sw.place.name}
                        {sw.status === 'backup' ? ' (backup)' : ''}
                      </Button>
                    ))}
                    {found === undefined && (
                      <Button variant="ghost" className={btn} onClick={() => findIndoor(id)}>
                        🔎 Indoor places nearby
                      </Button>
                    )}
                    {found === 'loading' && <span className="text-xs text-[#6D7A77] self-center">Looking for indoor places…</span>}
                    {Array.isArray(found) &&
                      found.map((p) => (
                        <Button key={p.placeId} variant="secondary" className={btn} onClick={() => void call(() => api.post('schedule/swap-place', { id, placeId: p.placeId, name: p.name, location: p.location, typeLabel: p.typeLabel }, { tripId: trip.id }))}>
                          🏛 {p.name} · {p.typeLabel} · {p.minutes} min{p.source ? ' · OpenStreetMap' : ''}
                        </Button>
                      ))}
                    {Array.isArray(found) && !found.length && <span className="text-xs text-[#6D7A77] self-center">No indoor places found nearby.</span>}
                    {moveTo === undefined && (
                      <Button variant="ghost" className={btn} onClick={() => void findDrierDay(r)}>
                        📅 A drier day in this city
                      </Button>
                    )}
                    {moveTo === 'loading' && <span className="text-xs text-[#6D7A77] self-center">Checking the other days…</span>}
                    {moveTo === 'none' && <span className="text-xs text-[#6D7A77] self-center">No drier day with room in this city (within the forecast).</span>}
                    {moveTo && typeof moveTo === 'object' && (
                      <Button
                        variant="secondary"
                        className={btn}
                        onClick={() =>
                          void call(async () => {
                            await api.post('schedule/update', { id, day: moveTo.day, start: toClock(moveTo.start) }, { tripId: trip.id });
                            setDay(moveTo.day);
                          })
                        }
                      >
                        📅 Move to {formatDay(moveTo.day)}, {fmtClock(moveTo.start)} (dry)
                      </Button>
                    )}
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
              <div id="day-list" className="scroll-mt-24">
                {moving && blockedDay && (
                  <Card className="p-4 mb-2 text-sm text-[#8A5A00] border-[#F2D8B0] bg-[#FFF8EC]">
                    {moving.title} can't go on this day — {blockedDay}. Pick a day in its city in the bar below.
                  </Card>
                )}
                {moving && !blockedDay && !rows.length && gaps[0] && <GapSlot gap={gaps[0]} titleOf={titleOf} hovered={hoverGap === gaps[0].key} onHover={setHoverGap} onPick={place} />}
                <DayList empty={!rows.length && !moving}>
                  {rows.map((r, i) => {
                    // Travel into every block from the one before it — stops, prayer places, bookings.
                    const leg = chain.legs.get(r.item.id);
                    const prevRow = i > 0 ? rows[i - 1] : undefined;
                    const travelRow = prevRow && sameJourney(prevRow.item, r.item) ? (
                      <OnBoardRow booking={r.item.ref.kind === 'booking' ? bookingMap.get(r.item.ref.bookingId) : undefined} />
                    ) : leg ? (
                      <TravelRow
                        minutes={leg.minutes}
                        real={r.item.transitFromPrev?.fromId === leg.fromId ? r.item.transitFromPrev : undefined}
                        to={r.prayer ? 'prayer' : undefined}
                        {...gapBetween(rows.find((x) => x.item.id === leg.fromId), r, leg.minutes, shownStart)}
                      />
                    ) : (
                      <div className="h-1.5" />
                    );
                    // While moving: a ＋ spot before the first block and after each one (never inside a visit that holds a prayer).
                    const before = moving && i === 0 ? gaps.find((g) => g.afterId === null) : undefined;
                    const after = moving ? gaps.find((g) => g.afterId === r.item.id) : undefined;
                    const isMoving = moving?.id === r.item.id;
                    const holder = r.prayer ? longVisitAround(rows, r) : undefined;
                    return (
                      <div key={r.item.id} data-block={r.item.id}>
                        {before && <GapSlot gap={before} titleOf={titleOf} hovered={hoverGap === before.key} onHover={setHoverGap} onPick={place} />}
                        {i > 0 && !moving && travelRow}
                        {moving && i > 0 && !after && !gaps.some((g) => g.afterId === rows[i - 1].item.id) && <div className="h-1.5" />}
                        {r.prayer ? (
                          <PrayerRow
                            row={r}
                            tripId={trip.id}
                            inside={holder}
                            pairInside={pairInLongVisit(rows, r)}
                            people={people}
                            members={members}
                            me={me.uid}
                            canPick={!me.prefs?.prayerReminders}
                            onPick={() => setPicking(r.item)}
                            selected={selected === r.item.id}
                            onSelect={() => select(r.item.id)}
                            before={rows.slice(0, i).reverse().find((x) => !x.prayer)?.title}
                            after={rows.slice(i + 1).find((x) => !x.prayer)?.title}
                            dayZone={tz}
                            zoneName={dayDest.name}
                            until={prayerUntil(frame.prayers, r.item.prayer?.prayer)}
                            onPlace={() => setPlacing(r.item)}
                          />
                        ) : (
                          <StopRow
                            row={r}
                            shownStart={shownStart(r.item.id)}
                            moving={isMoving}
                            busy={!!moving}
                            onMove={() => startMove(r)}
                            onShift={(by) => shift(r, by)}
                            onUnpin={() => void call(() => api.post('schedule/update', { id: r.item.id, pinned: false }, { tripId: trip.id }))}
                            onBacklog={() => toBacklog(r)}
                            dayZone={tz}
                            weather={weather.get(r.item.id)?.risk}
                            warnings={[...(warnings.get(r.item.id) ?? []), ...(r.sides ?? []).flatMap((s) => warnings.get(s.item.id) ?? [])]}
                            people={people}
                            me={me.uid}
                            selected={selected === r.item.id || !!r.sides?.some((s) => s.item.id === selected)}
                            onSelect={() => select(r.item.id)}
                            onMap={() => showOnMap(r.item.id)}
                            onEdit={() => setEditing(r)}
                          />
                        )}
                        {after && <GapSlot gap={after} titleOf={titleOf} hovered={hoverGap === after.key} onHover={setHoverGap} onPick={place} />}
                      </div>
                    );
                  })}
                </DayList>
              </div>
            )}
          </div>

          <div className="space-y-4 md:sticky md:top-4">
            <div className={cx('space-y-1.5', !showMap && 'hidden md:block')}>
              <Card className="overflow-hidden h-72 md:h-80">
                <DayMap stops={mapStops} links={mapLinks} selectedId={selected} onSelect={setSelected} />
              </Card>
            </div>
            <Backlog
              ideas={backlog}
              pairName={pairName}
              onAdd={setAdding}
              onPlace={startPlace}
              placing={moving?.ideaId}
              day={day}
              destinations={trip.destinations}
              dayCity={dayCities.get(day)?.length ? trip.destinations[dayCities.get(day)!.at(-1)!].name : nearestDestination(trip.destinations, firstStop ?? frame.base).name}
            />
          </div>
        </div>
      </div>

      {dragging && dragAt && (
        <div className="pointer-events-none fixed z-50 max-w-[14rem] truncate rounded-xl bg-[#00685F] px-3 py-1.5 text-xs font-bold text-white shadow-lg" style={{ left: dragAt.x + 14, top: dragAt.y + 10 }}>
          {dragging.title}
        </div>
      )}
      {moving && (
        <MoveBar
          title={moving.title}
          days={days}
          day={day}
          dayStatus={(d) => cityRule(moving.city, d)}
          onDay={setDay}
          onCancel={() => setMoving(null)}
        />
      )}

      <EditStopSheet
        item={editing?.item ?? null}
        idea={editing?.idea}
        title={editing?.sides?.length ? `Split: ${[editing.title, ...editing.sides.map((s) => s.title)].join(' / ')}` : (editing?.title ?? '')}
        fixedLength={!!editing?.sides?.length}
        days={days}
        dayRule={editing ? dayRuleFor(editing.in ?? editing.out) : undefined}
        checker={editing ? makeChecker(rowsByDay, bookingMap, editing.idea, [editing.item.id, ...(editing.sides ?? []).map((s) => s.item.id)]) : undefined}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          const title = editing!.title;
          // A start typed by hand is kept (📌); otherwise the stop follows the one before.
          const pinned = patch.start !== editing!.item.start || patch.day !== editing!.item.day ? true : editing!.item.pinned;
          const res = await api.post<{ start?: string; moved?: boolean }>('schedule/update', { id: editing!.item.id, ...patch, ...(pinned !== undefined ? { pinned } : {}) }, { tripId: trip.id });
          if (res?.moved && res.start) setNotice(`${title} was saved at ${fmtClock(toMin(res.start))} — the measured route there takes longer than the estimate.`);
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
      {placing && <PrayerPlaceSheet item={schedule.data.find((i) => i.id === placing.id) ?? placing} tripId={trip.id} onClose={() => setPlacing(null)} />}
      {fixing && <FixDaySheet day={day} tripId={trip.id} rows={rows} onClose={() => setFixing(false)} />}
      {viewPlan && openPlan && (
        <ArrangeSheet
          job={openPlan}
          days={days}
          ideas={ideaMap}
          current={schedule.data}
          canApply={isAdmin}
          author={openPlan.createdBy === me.uid ? 'you' : people.get(openPlan.createdBy)?.displayName}
          onApply={async () => {
            await api.post('schedule/apply', { jobId: openPlan.id }, { tripId: trip.id });
            if (openPlan.day && openPlan.day !== day) setDay(openPlan.day);
          }}
          onDiscard={isAdmin || openPlan.createdBy === me.uid ? () => api.post('schedule/discard', { jobId: openPlan.id }, { tripId: trip.id }) : undefined}
          onClose={() => setViewPlan(false)}
        />
      )}
      <AddStopSheet
        idea={adding}
        days={days}
        defaultDay={day}
        pickDefault={adding ? (duration) => defaultSlot(adding, duration) : undefined}
        dayRule={adding ? dayRuleFor(adding.place.location) : undefined}
        checker={adding ? makeChecker(rowsByDay, bookingMap, adding, []) : undefined}
        onPickSpot={adding ? (duration) => startPlace(adding, duration) : undefined}
        onClose={() => setAdding(null)}
        onAdd={async (toDay, start, durationMin, pinned) => {
          // A different length than the place's is remembered for it.
          if (durationMin !== durationRange(adding!.estDurationMin).min) void api.post('ideas/duration', { ideaId: adding!.id, minutes: durationMin }, { tripId: trip.id }).catch(() => {});
          const title = adding!.place.name;
          const res = await api.post<{ start?: string; moved?: boolean }>('schedule/add', { ideaId: adding!.id, day: toDay, start, durationMin, pinned }, { tripId: trip.id });
          if (res?.moved && res.start) setNotice(`${title} was saved at ${fmtClock(toMin(res.start))} — the measured route there takes longer than the estimate.`);
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
            // The first time in the meal window that fits (the same placement the server saves with).
            const fit = idea ? firstFit(day, model.rows, candidateOf(idea, 'meal', dur), model.travel, model.zones, a, b + 30) : null;
            await api.post('schedule/add', { ideaId, day, start: toClock(fit?.start ?? a), pinned: true }, { tripId: trip.id });
          }}
        />
      )}
    </DndContext>
  );
}

/**
 * While moving: the stop's name, Cancel, and every trip day to switch to —
 * always on screen at the bottom (phone and laptop), and drop targets while
 * dragging (hover a day for a moment to open it). Days in another city are
 * greyed out.
 */
function MoveBar({ title, days, day, dayStatus, onDay, onCancel }: { title: string; days: string[]; day: string; dayStatus: (d: string) => string | null; onDay: (d: string) => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#00685F]/30 bg-white/95 backdrop-blur shadow-[0_-8px_24px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)]" role="region" aria-label="Moving a stop">
      <div className="max-w-5xl mx-auto px-4 pt-2.5 pb-2 space-y-2">
        <div className="flex items-center gap-3">
          <Move className="w-4 h-4 shrink-0 text-[#00685F]" />
          <p className="flex-1 min-w-0 text-sm text-[#161C23]">
            <b className="truncate">Moving {title}</b>
            <span className="block text-xs text-[#6D7A77]">Tap a ＋ spot in the day (or drop it there). Another day? Tap it below.</span>
          </p>
          <Button variant="secondary" className="shrink-0 !min-h-9" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        <div className="-mx-4 px-4 overflow-x-auto">
          <div className="flex gap-1.5 w-max pb-0.5">
            {days.map((d, i) => (
              <BarDay key={d} day={d} index={i} selected={d === day} blocked={dayStatus(d)} onClick={() => onDay(d)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BarDay({ day, index, selected, blocked, onClick }: { day: string; index: number; selected: boolean; blocked: string | null; onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `bar:${day}`, disabled: !!blocked });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      disabled={!!blocked && !selected}
      title={blocked ?? undefined}
      aria-pressed={selected}
      className={cx(
        'shrink-0 rounded-xl border px-2.5 py-1.5 text-left min-w-[4.75rem] min-h-11',
        selected ? 'bg-[#00685F] border-[#00685F] text-white' : 'bg-white border-[#E7DFD5] text-[#161C23]',
        blocked && !selected && 'opacity-40',
        isOver && !selected && 'ring-2 ring-[#00685F]/40 border-[#00685F]',
      )}
    >
      <span className={cx('block text-[10px] font-bold uppercase tracking-wider', selected ? 'text-white/80' : 'text-[#6D7A77]')}>Day {index + 1}</span>
      <span className="block text-xs font-semibold whitespace-nowrap">{formatDay(day)}</span>
    </button>
  );
}

const walkOrRide = (m: number) => (m === 0 ? 'same place' : `${m} min ${m <= 18 ? 'walk' : 'ride'}`);

/**
 * A spot the stop being moved can go: when it would start and end, the
 * travel in and out, what it pushes later — or why it doesn't fit. A drop
 * target while dragging; hovering it re-times the whole day on screen.
 */
function GapSlot({ gap, titleOf, hovered, onHover, onPick }: { gap: GapOption; titleOf: (id?: string) => string | undefined; hovered: boolean; onHover: (key: string | null) => void; onPick: (g: GapOption) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `gap:${gap.key}` });
  const p = gap.placement;
  const bits = [
    p.legIn && `${walkOrRide(p.legIn.minutes)} from ${titleOf(p.legIn.fromId) ?? 'the stop before'}`,
    p.legOut && `${walkOrRide(p.legOut.minutes)} to ${titleOf(p.legOut.toId) ?? 'the next stop'}`,
    p.prayerInside > 0 && `incl. ${p.prayerInside} min to pray there`,
    p.pushed.length === 1 && `moves ${titleOf(p.pushed[0].id) ?? 'a stop'} to ${fmtClock(p.starts.get(p.pushed[0].id) ?? 0)}`,
    p.pushed.length > 1 && `moves ${p.pushed.length} stops later (${titleOf(p.pushed[0].id) ?? 'the next'} → ${fmtClock(p.starts.get(p.pushed[0].id) ?? 0)})`,
  ].filter(Boolean);
  const active = isOver || hovered;
  return (
    <div ref={setNodeRef} className="py-1">
      <button
        type="button"
        disabled={!p.ok}
        onClick={() => onPick(gap)}
        onMouseEnter={() => onHover(gap.key)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(gap.key)}
        onBlur={() => onHover(null)}
        className={cx(
          'w-full min-h-11 rounded-xl border-2 border-dashed px-3 py-1.5 text-left transition-colors',
          p.ok ? 'border-[#00685F]/50 bg-[#00685F]/5 text-[#00685F] hover:bg-[#00685F]/10' : 'border-[#E0D8CE] bg-[#F7F4EF] text-[#9AA5A3] cursor-not-allowed',
          p.ok && active && 'border-[#00685F] bg-[#00685F]/15',
        )}
      >
        {p.ok ? (
          <>
            <span className="flex items-center gap-1.5 text-sm font-bold">
              <Plus className="w-4 h-4 shrink-0" /> Put here · {fmtClock(p.start)}–{fmtClock(p.end)}
            </span>
            {bits.length > 0 && <span className="block text-[11px] font-semibold text-[#3E4947]">{bits.join(' · ')}</span>}
          </>
        ) : (
          <span className="block text-xs font-semibold">✕ Not here — {p.why}</span>
        )}
      </button>
    </div>
  );
}

function DayChip({ day, index, selected, status, count, city, onClick }: { day: string; index: number; selected: boolean; status: 'block' | 'risk' | null; count: number; city: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'px-3 py-2 rounded-2xl border text-left min-w-[5.5rem] transition-colors',
        selected ? 'bg-[#00685F] border-[#00685F] text-white' : 'bg-white border-[#E7DFD5] text-[#161C23]',
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
  return (
    <div className="rounded-3xl min-h-40">
      {empty ? (
        <Card className="p-6 text-center space-y-1">
          <p className="font-semibold text-[#161C23]">Nothing planned yet</p>
          <p className="text-sm text-[#6D7A77]">Add an idea from the backlog, or let AI plan the day.</p>
        </Card>
      ) : (
        children
      )}
    </div>
  );
}

function StopRow({
  row,
  shownStart,
  moving,
  busy,
  onMove,
  onShift,
  onUnpin,
  onBacklog,
  dayZone,
  weather,
  warnings,
  people,
  me,
  selected,
  onSelect,
  onMap,
  onEdit,
}: {
  row: Row;
  /** While choosing a spot / saving: the start the re-timed day gives it. */
  shownStart?: number;
  /** This is the stop being moved. */
  moving: boolean;
  /** Some stop is being moved (no other actions meanwhile). */
  busy: boolean;
  onMove: () => void;
  onShift: (by: number) => void;
  onUnpin: () => void;
  onBacklog: () => void;
  dayZone: string;
  weather?: WeatherRisk;
  warnings: DayWarning[];
  people: Map<string, Member>;
  me: string;
  selected: boolean;
  onSelect: () => void;
  onMap: () => void;
  onEdit: () => void;
}) {
  const { item } = row;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled: item.locked || (busy && !moving), data: { title: row.title } });
  const moment = item.start === item.end;
  const len = toMin(item.end) - toMin(item.start);
  const s0 = shownStart ?? toMin(item.start);
  const moved = shownStart !== undefined && shownStart !== toMin(item.start);
  const movable = !item.locked;
  const stop = { onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(), onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(), onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation() };
  return (
    <div ref={setNodeRef} className={cx((isDragging || moving) && 'opacity-40')}>
      <Card className={cx('flex items-stretch', item.locked && 'bg-[#F3EFE9]', selected && 'ring-2 ring-[#00685F]/50', moving && 'outline-2 outline-dashed outline-[#00685F]')}>
        <div className={cx('w-[4.75rem] shrink-0 py-3 pl-3 text-xs font-bold tabular-nums', moved ? 'text-[#00685F]' : 'text-[#161C23]')}>
          <p>{fmtClock(s0)}</p>
          {!moment && <p className={cx('font-semibold', moved ? 'text-[#00685F]' : 'text-[#6D7A77]')}>{fmtClock(s0 + len)}</p>}
          {row.zone && (row.zone !== dayZone || item.ref.kind === 'booking') && (
            <p className={cx('mt-0.5 text-[10px] leading-tight font-semibold', row.zone !== dayZone ? 'text-[#8A5A00]' : 'text-[#9AA5A3]')}>{row.zoneName ?? tzCity(row.zone)} time</p>
          )}
        </div>
        <div className="flex-1 min-w-0 py-3 pr-2">
          <button type="button" onClick={onSelect} onKeyDown={(e) => e.stopPropagation()} aria-pressed={selected} className="block w-full text-left">
            <p className="flex items-center gap-1.5 font-semibold text-[#161C23]">
              <span className="text-[#00685F] shrink-0">{row.icon}</span>
              <span className="truncate">{row.title}</span>
            </p>
            {row.subtitle && !row.sides?.length && <p className="text-xs text-[#6D7A77] truncate">{row.subtitle}</p>}
            {row.prayerKnown && <p className="text-[11px] text-[#8A6A1F]">🕌 Prayer space here / right by it — a prayer time during the visit is prayed here</p>}
          </button>
          {item.pinned && movable && (
            <button type="button" onClick={onUnpin} {...stop} className="mt-0.5 text-[11px] font-semibold text-[#6D7A77] underline underline-offset-2">
              📌 Start set by hand — let it follow the stop before
            </button>
          )}
          {row.phone && (
            <a href={`tel:${row.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#00685F]" {...stop}>
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
          {/* Tapped: Move (then pick a spot, on this day or another) and small time nudges. */}
          {movable && selected && !busy && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5" {...stop}>
              <button type="button" onClick={onMove} className="inline-flex items-center gap-1 rounded-full bg-[#00685F] px-3 min-h-9 text-xs font-bold text-white">
                <Move className="w-3.5 h-3.5" /> Move
              </button>
              <button type="button" onClick={() => onShift(-15)} className="rounded-full border border-[#E7DFD5] bg-white px-3 min-h-9 text-xs font-semibold text-[#161C23]">
                −15 min
              </button>
              <button type="button" onClick={() => onShift(15)} className="rounded-full border border-[#E7DFD5] bg-white px-3 min-h-9 text-xs font-semibold text-[#161C23]">
                +15 min
              </button>
              <button type="button" onClick={onMap} className="md:hidden inline-flex items-center gap-1 rounded-full border border-[#E7DFD5] bg-white px-3 min-h-9 text-xs font-semibold text-[#161C23]">
                <MapIcon className="w-3.5 h-3.5" /> Map
              </button>
            </div>
          )}
        </div>
        {movable && !busy && (
          <div className="flex flex-col shrink-0 border-l border-[#F0EBE4]" {...stop}>
            <button type="button" onClick={onEdit} aria-label={`Change ${row.title}`} title="Change day / time / length" className="flex-1 w-11 min-h-11 flex items-center justify-center text-[#6D7A77] hover:text-[#00685F]">
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
        {item.locked ? (
          <span className="w-11 shrink-0 flex items-center justify-center text-[#9AA5A3]" title="Booking — fixed time">
            <Lock className="w-4 h-4" />
          </span>
        ) : (
          // The grip: drag from here (mouse or finger) — a shortcut into the same move as the Move button.
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Drag ${row.title} into a spot`}
            title="Drag to move"
            className="w-11 shrink-0 flex items-center justify-center text-[#6D7A77] bg-[#F7F4EF] rounded-r-2xl touch-none cursor-grab active:cursor-grabbing hover:text-[#00685F]"
          >
            <GripVertical className="w-5 h-5" />
          </button>
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

/**
 * The time between two cards, split up so it adds up: the trip, the buffer,
 * and any wait before a fixed block (prayer time, booking) or opening time.
 */
function gapBetween(from: Row | undefined, to: Row, legMin: number, shown: (id: string) => number | undefined): { buffer: number; wait: number; waitFor?: string } {
  if (!from) return { buffer: 0, wait: 0 };
  const start = (r: Row) => shown(r.item.id) ?? toMin(r.item.start);
  const end = (r: Row) => start(r) + Math.max(0, toMin(r.item.end) - toMin(r.item.start));
  const buffer = !from.prayer && legMin > 0 ? BUFFER_MIN : 0;
  const wait = start(to) - end(from) - legMin - buffer;
  const waitFor = to.prayer ? `${to.item.prayer?.prayer ?? 'the prayer'} time` : to.item.locked ? 'the booking' : to.item.pinned ? 'its set time 📌' : 'it opens';
  // Under 5 min is just times rounded to the next 5 minutes.
  return { buffer: wait < 0 ? 0 : buffer, wait: wait >= 5 ? wait : 0, waitFor };
}

/** Travel from the block before (the Routes API leg when measured, else an estimate), the buffer, and any wait. */
function TravelRow({ minutes, real, to, buffer = 0, wait = 0, waitFor }: { minutes: number; real?: TransitLeg; to?: 'prayer'; buffer?: number; wait?: number; waitFor?: string }) {
  const mode = real?.mode ?? (minutes <= 18 ? 'walk' : 'transit');
  const Icon = MODE[mode].icon;
  const text =
    minutes === 0
      ? 'Same place'
      : real
        ? `${real.source === 'ors' && real.mode === 'transit' ? '~' : ''}${real.minutes} min ${MODE[real.mode].label}${real.meters ? ` · ${real.meters < 1000 ? `${real.meters} m` : `${(real.meters / 1000).toFixed(1)} km`}` : ''}${real.source === 'ors' ? ' · via openrouteservice' : ''}`
        : `~${minutes} min ${MODE[mode].label}${to === 'prayer' ? ' to pray' : ''}`;
  return (
    <p className="flex items-center gap-2 pl-8 py-1 text-xs text-[#6D7A77]">
      <span className="h-4 border-l-2 border-dotted border-[#D5CEC4]" />
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>
        {text}
        {buffer > 0 && ` + ${buffer} min buffer`}
        {wait > 0 && <span className="text-[#8A5A00]"> · {wait} min free before {waitFor}</span>}
      </span>
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
  onPlace,
  placing,
  day,
  destinations,
  dayCity,
}: {
  ideas: Idea[];
  pairName: (ideaId: string) => string | undefined;
  onAdd: (idea: Idea) => void;
  /** Pick a spot on the timeline for it (move mode). */
  onPlace: (idea: Idea) => void;
  /** The idea being placed right now. */
  placing?: string;
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
                  <BacklogItem key={i.id} idea={i} pair={pairName(i.id)} hours={hoursOn(i, day)} onAdd={() => onAdd(i)} onPlace={() => onPlace(i)} placing={placing === i.id} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </Card>
  );
}

function BacklogItem({ idea, pair, hours, onAdd, onPlace, placing }: { idea: Idea; pair?: string; hours: { text: string; closed: boolean } | null; onAdd: () => void; onPlace: () => void; placing: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `backlog:${idea.id}`, data: { title: idea.place.name } });

  return (
    <li ref={setNodeRef} className={cx('flex items-center gap-1 rounded-2xl border border-[#E7DFD5] bg-white p-2', (isDragging || placing) && 'opacity-40')}>
      {/* Drag handle on larger screens; everywhere, "Place" picks a spot on the timeline and "Add" suggests one. */}
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
        <PlaceThumb photoUrl={idea.place.photoUrl} at={idea.place.location} className="w-10 h-10 rounded-xl shrink-0" small />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[#161C23] truncate">{idea.place.name}</span>
          <span className="block text-xs text-[#6D7A77] truncate">
            {pair ? (
              <span className="inline-flex items-center gap-1 text-[#1D4E89]">
                <GitFork className="w-3 h-3" /> Split with {pair}
              </span>
            ) : (
              <>
                {idea.place.typeLabel ?? idea.place.category} · {durationRange(idea.estDurationMin).label}
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
      <div className="flex flex-col sm:flex-row shrink-0">
        <Button variant="ghost" className="shrink-0 !px-2.5 !min-h-9" onClick={onAdd} aria-label={`Add ${idea.place.name} at a suggested time`}>
          <Plus className="w-4 h-4" /> Add
        </Button>
        <Button variant="ghost" className="shrink-0 !px-2.5 !min-h-9" onClick={onPlace} aria-label={`Pick a spot on the timeline for ${idea.place.name}`}>
          <Move className="w-4 h-4" /> Place
        </Button>
      </div>
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

/**
 * The visit a prayer falls inside, if any: a long one (≥ LONG_VISIT_MIN — theme
 * park, festival, hike…) or one you can pray at (A → pray → back to A).
 */
function longVisitAround(rows: Row[], prayer: Row): { title: string; ideaId?: string; end: number; short: boolean } | undefined {
  const s = toMin(prayer.item.start);
  const v = rows.find((r) => !r.prayer && !r.item.locked && toMin(r.item.start) <= s && toMin(r.item.end) > s && (toMin(r.item.end) - toMin(r.item.start) >= LONG_VISIT_MIN || r.prayInside));
  return v ? { title: v.title, ...(v.item.ref.kind === 'idea' ? { ideaId: v.item.ref.ideaId } : {}), end: toMin(v.item.end), short: toMin(v.item.end) - toMin(v.item.start) < LONG_VISIT_MIN } : undefined;
}

/** Zuhur with Asar (or Maghrib with Isyak) both inside the same long visit — travellers may pray them together. */
function pairInLongVisit(rows: Row[], prayer: Row): string | undefined {
  const PAIRS: Record<string, string> = { Dhuhr: 'Asr', Maghrib: 'Isha' };
  const name = prayer.item.prayer?.prayer;
  const other = name ? PAIRS[name] : undefined;
  if (!other) return undefined;
  const visit = longVisitAround(rows, prayer);
  if (visit?.short) return undefined;
  const partner = rows.find((r) => r.prayer && r.item.prayer?.prayer === other);
  return visit && partner && longVisitAround(rows, partner)?.title === visit.title ? other : undefined;
}

/** When a prayer's time ends: the next prayer's start (Isha: none shown). */
function prayerUntil(prayers: DayFrame['prayers'], name?: string): number | undefined {
  if (!prayers || !name) return undefined;
  const next: Record<string, keyof NonNullable<DayFrame['prayers']>['times'] | 'sunrise'> = { Fajr: 'sunrise', Dhuhr: 'asr', Asr: 'maghrib', Maghrib: 'isha' };
  const k = next[name];
  if (!k) return undefined;
  return k === 'sunrise' ? prayers.sunrise : prayers.times[k];
}

const MALAY_NAME: Record<string, string> = { Fajr: 'Subuh', Dhuhr: 'Zuhur', Asr: 'Asar', Maghrib: 'Maghrib', Isha: 'Isyak' };

/** A prayer break's groups: who prays, what each of the others picked (each its own colour), who rests. */
function prayerGroups(item: ScheduleItem, members: Member[], me: string) {
  const p = item.prayer!;
  const name = (u: string) => (u === me ? 'you' : (members.find((m) => m.uid === u)?.displayName ?? '?'));
  const picks = p.fillerPicks ?? {};
  const byTitle = new Map<string, { title: string; place?: { name: string; location: GeoPoint }; meet?: { kind: string; name: string; at: string }; uids: string[] }>();
  for (const [uid, pk] of Object.entries(picks)) {
    if (pk.kind === 'rest') continue;
    const g = byTitle.get(pk.title) ?? { title: pk.title, ...(pk.place ? { place: pk.place } : {}), ...(pk.meet ? { meet: pk.meet } : {}), uids: [] };
    g.uids.push(uid);
    byTitle.set(pk.title, g);
  }
  const groups = [...byTitle.values()].map((g, k) => ({ ...g, names: g.uids.map(name), color: PRAYER_PICK_COLORS[k % PRAYER_PICK_COLORS.length] }));
  // Praying: those who said they pray (and didn't pick something else).
  const praying = members.filter((m) => !picks[m.uid] && m.prefs?.prayerReminders).map((m) => m.uid);
  // Rest / free time: anyone else who picked nothing — people who don't pray, and people who haven't
  // said (we don't know, so they're free; they can join the prayer or pick something) — or picked "rest".
  const resting = members.filter((m) => picks[m.uid]?.kind === 'rest' || (!picks[m.uid] && !m.prefs?.prayerReminders)).map((m) => m.uid);
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
  tripId,
  inside,
  pairInside,
  people,
  members,
  me,
  canPick,
  selected,
  onSelect,
  onPick,
  before,
  after,
  dayZone,
  zoneName,
  until,
  onPlace,
}: {
  row: Row;
  tripId: string;
  /** The visit this prayer falls in (pray there, then carry on). */
  inside?: { title: string; ideaId?: string; end: number; short: boolean };
  /** The prayer it can be combined with inside the same visit (travellers' jamak). */
  pairInside?: string;
  people: Map<string, Member>;
  members: Member[];
  me: string;
  canPick: boolean;
  selected: boolean;
  onSelect: () => void;
  onPick: () => void;
  before?: string;
  after?: string;
  /** The day's timezone and its city ("Kyoto") — prayer times are on that clock. */
  dayZone: string;
  zoneName: string;
  /** When this prayer's time ends (the next prayer begins), minutes. */
  until?: number;
  /** Choose another place to pray (the time stays). */
  onPlace: () => void;
}) {
  const p = row.item.prayer!;
  const f = p.facility;
  const g = prayerGroups(row.item, members, me);
  const myPick = p.fillerPicks?.[me];
  const iPray = g.praying.includes(me);
  // Which rule placed it: the visit it's in, the stop before, the stop after, the hotel / station, or someone's choice.
  const BASIS = { inside: 'at', before: 'near the stop before —', after: 'near the next stop —', hotel: 'near your hotel —', station: 'at / near the station —', area: 'where you are', chosen: 'chosen by your group' } as const;
  const route = p.basis
    ? `${BASIS[p.basis]}${p.basisName && p.basis !== 'chosen' && p.basis !== 'area' ? ` ${p.basisName}` : ''}`
    : before && after && before !== after
      ? `on the way from ${before} to ${after}`
      : before
        ? `near ${before}`
        : after
          ? `before ${after}`
          : '';
  const meet = fmtClock(toMin(row.item.end));
  const where = f?.name ?? 'the prayer spot';
  const box = (key: string, color: { main: string; soft: string }, label: string, names: string[], sub?: string) => (
    <div key={key} className="rounded-lg px-2 py-1.5 min-w-0 border-l-4" style={{ background: color.soft, borderColor: color.main }}>
      <p className="text-[11px] font-bold leading-tight" style={{ color: color.main }}>
        {label}
      </p>
      {sub && <p className="text-xs font-semibold text-[#161C23] leading-tight">{sub}</p>}
      <p className="text-[11px] text-[#6D7A77] truncate">{names.join(', ') || '—'}</p>
    </div>
  );
  const split = g.picks.length > 0 || g.resting.length > 0;
  const [spotBusy, setSpotBusy] = useState<'idle' | 'busy' | 'done'>('idle');
  const reportSpot = async () => {
    if (!inside?.ideaId) return;
    const note = window.prompt(`Where is the prayer room at ${inside.title}? (e.g. "next to Guest Relations", optional)`, '');
    if (note === null) return;
    setSpotBusy('busy');
    await api.post('prayer/spot', { ideaId: inside.ideaId, note: note.trim() || undefined, day: row.item.day }, { tripId }).catch(() => {});
    setSpotBusy('done');
  };
  const atVenue = !!f && f.walkMin === 0;
  return (
    <div className={cx(inside && 'ml-5 pl-3 border-l-2 border-dashed border-[#EAD9A8]')}>
    {inside && <p className="text-[11px] font-semibold text-[#8A6A1F] pt-1">During {inside.title} — {inside.short ? 'step out to pray right there, then back to it' : 'pray there, then carry on'}</p>}
    <Card className={cx('flex items-stretch my-1 border-[#EAD9A8] bg-[#FDF6E3]', selected && 'ring-2 ring-[#CA8A04]/50')}>
      <div className="w-[4.75rem] shrink-0 py-3 pl-3 text-xs font-bold tabular-nums" style={{ color: PRAYER_GROUP.main }}>
        <p>{fmtClock(toMin(row.item.start))}</p>
        <p className="font-semibold opacity-70">{meet}</p>
        <p className="mt-0.5 text-[10px] leading-tight font-semibold opacity-70">🔒 {zoneName} time</p>
      </div>
      <div className="flex-1 min-w-0 py-3 pr-2">
        <button type="button" onClick={onSelect} aria-pressed={selected} className="block w-full text-left">
          <p className="font-semibold text-[#7A5500]">
            🕌 {p.prayer} prayer{split && <span className="font-normal text-[#8A6A1F]"> · the group splits</span>}
          </p>
          {until !== undefined && <p className="text-[11px] text-[#8A6A1F]">Its time lasts until {fmtClock(until)} ({zoneName}) — pray any time before then if plans slip</p>}
          <p className="text-xs text-[#6B5A2E]">
            {f
              ? `${f.name} · ${f.walkMin ? `${f.walkMin} min walk` : 'on site'}${f.via ? ` (via ${f.via})` : ''}`
              : inside
                ? 'No prayer room known here yet — ask staff (big venues often have one), or any clean, quiet spot'
                : 'No mosque found nearby — any clean, quiet spot works'}
            {f && route && !(inside && p.basis === 'inside') && <span className="text-[#6D7A77]"> · {route}</span>}
          </p>
        </button>
        <button type="button" onClick={onPlace} className="mt-1 text-xs font-semibold text-[#8A6A1F] underline underline-offset-2">
          📍 Change place{p.chosen ? ' (chosen)' : ''}
        </button>
        {pairInside && (
          <p className="mt-1 text-xs text-[#6B5A2E]">
            🧳 Travellers may pray {MALAY_NAME[p.prayer]} and {MALAY_NAME[pairInside]} together now (jamak taqdim{p.prayer === 'Maghrib' ? ', Maghrib 3 + Isyak 2' : ', 2 rakaat each'}) — one stop, and the rest of {inside?.title ?? 'the visit'} is free. Follow your madhhab.
          </p>
        )}
        {inside?.ideaId && !atVenue && spotBusy !== 'done' && (
          <button type="button" disabled={spotBusy === 'busy'} onClick={() => void reportSpot()} className="mt-1 text-xs font-semibold text-[#00685F] underline underline-offset-2 disabled:opacity-50">
            📍 There's a prayer room here — tell everyone
          </button>
        )}
        {spotBusy === 'done' && <p className="mt-1 text-xs text-[#0B6B45]">Thanks — every Safar trip visiting {inside?.title} will now pray there.</p>}
        {split ? (
          <div className="mt-1.5 space-y-1">
            <p className="text-[11px] font-semibold text-[#161C23]">🚩 Everyone meets back at {inside?.short ? inside.title : where} at {meet}{g.picks.some((x) => x.meet && x.meet.kind !== 'prayer') ? ' (groups further away: see their box)' : ''}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {box('pray', PRAYER_GROUP, '🕌 Praying', g.praying.map(g.name), where)}
              {g.picks.map((x) => box(x.title, { main: x.color, soft: '#F5F7FB' }, x.meet && x.meet.kind !== 'prayer' ? `☕ Meet ${x.meet.kind === 'next' ? 'at' : 'halfway,'} ${x.meet.name} ${fmtClock(toMin(x.meet.at))}` : '☕ Meanwhile', x.names, x.title))}
              {g.resting.length > 0 && box('rest', REST_GROUP, REST_GROUP.label, g.resting.map(g.name), 'Nearby')}
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-xs text-[#6B5A2E] truncate">{g.praying.map(g.name).join(', ')}</p>
        )}
        {!g.picks.length && p.fillerPlace && g.resting.length > 0 && (
          <p className="mt-0.5 text-xs text-[#1D4E89] truncate">☕ Idea for the others: {p.fillerPlace.name} nearby</p>
        )}
        {g.unsure.length > 0 && (
          <p className="mt-0.5 text-[11px] text-[#6D7A77]">
            {g.unsure.length === 1 && g.unsure[0] === me
              ? "You haven't said whether you pray (Preferences) — free time by default; join the prayer or pick something."
              : `${g.unsure.map(g.name).join(', ')} haven't said whether they pray — free time by default; they can join the prayer or pick something.`}
          </p>
        )}
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
    {inside?.short && <p className="text-[11px] font-semibold text-[#8A6A1F] pb-1">↩ Back to {inside.title} until {fmtClock(inside.end)} — the others just stay there</p>}
    </div>
  );
}
