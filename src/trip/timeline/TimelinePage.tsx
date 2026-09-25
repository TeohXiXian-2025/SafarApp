// Day-by-day timeline: bookings are fixed anchors, approved ideas are dragged
// in from the backlog (or added with a tap on phones), reordered, re-timed.
// Travel time between stops comes from the Routes API (server-side).
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, Car, Footprints, GripVertical, Lock, Map as MapIcon, MapPin, Plus, TrainFront } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Booking,
  byTime,
  dayWarnings,
  estimateTravelMin,
  fmtClock,
  Idea,
  paths,
  planningDate,
  ScheduleItem,
  toMin,
  tripDays,
  type DayWarning,
  type GeoPoint,
  type TransitLeg,
} from '../../domain';
import { api } from '../../lib/api';
import { useQuery } from '../../lib/firestore';
import { Badge, Button, Card, cx, ErrorBanner, Spinner } from '../../ui';
import { bookingTitle, formatDay, KIND } from '../bookings/format';
import { placePhotoUrl } from '../ideas/halalLabel';
import { useTrip } from '../TripLayout';
import { DayMap, type MapStop } from './DayMap';
import { AddStopSheet, EditStopSheet } from './StopSheets';

interface Row {
  item: ScheduleItem;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  idea?: Idea;
  /** Where you arrive / leave from (for travel estimates and the map). */
  in?: GeoPoint;
  out?: GeoPoint;
}

const EVENT_LABEL = { span: '', depart: 'Departs', arrive: 'Arrives', checkin: 'Check-in', checkout: 'Check-out' } as const;

function toRow(item: ScheduleItem, ideas: Map<string, Idea>, bookings: Map<string, Booking>): Row | null {
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
    return {
      item,
      title: [EVENT_LABEL[r.event], bookingTitle(b)].filter(Boolean).join(' · '),
      subtitle: b.kind === 'hotel' ? b.to.address ?? b.to.name : route,
      icon: <Icon className="w-4 h-4" />,
      in: inAt,
      out: outAt,
    };
  }
  return { item, title: r.title, icon: <MapPin className="w-4 h-4" />, in: r.place?.location, out: r.place?.location };
}

export function TimelinePage() {
  const { trip } = useTrip();
  const [params, setParams] = useSearchParams();
  const days = useMemo(() => tripDays(trip.startDate, trip.endDate), [trip.startDate, trip.endDate]);
  const day = days.includes(params.get('day') ?? '') ? params.get('day')! : planningDate(trip.startDate, trip.endDate, trip.destinations[0].timezone);
  const setDay = (d: string) => setParams({ day: d }, { replace: true });

  const schedule = useQuery(`schedule:${trip.id}`, () => paths.schedule(trip.id), ScheduleItem);
  const ideas = useQuery(`ideas:${trip.id}`, () => paths.ideas(trip.id), Idea);
  const bookings = useQuery(`bookings:${trip.id}`, () => paths.bookings(trip.id), Booking);

  const ideaMap = useMemo(() => new Map(ideas.data.map((i) => [i.id, i])), [ideas.data]);
  const bookingMap = useMemo(() => new Map(bookings.data.map((b) => [b.id, b])), [bookings.data]);
  const rowsByDay = useMemo(() => {
    const out = new Map<string, Row[]>();
    for (const it of [...schedule.data].sort(byTime)) {
      const row = toRow(it, ideaMap, bookingMap);
      if (row) out.set(it.day, [...(out.get(it.day) ?? []), row]);
    }
    return out;
  }, [schedule.data, ideaMap, bookingMap]);
  const backlog = useMemo(() => ideas.data.filter((i) => i.status === 'backlog').sort((a, b) => a.createdAt - b.createdAt), [ideas.data]);

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

  const warnings = useMemo(() => {
    const byItem = new Map<string, DayWarning[]>();
    const list = dayWarnings(day, rows.map((r) => ({ ...r.item, transitMin: r.item.transitFromPrev?.minutes })), (id) => rows.find((r) => r.item.id === id)?.idea?.place.openingHours);
    for (const w of list) byItem.set(w.itemId, [...(byItem.get(w.itemId) ?? []), w]);
    return byItem;
  }, [rows, day]);

  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [adding, setAdding] = useState<Idea | null>(null);
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const movable = rows.filter((r) => !r.item.locked).map((r) => r.item.id);

  const onDragStart = (e: DragStartEvent) => setDragging({ title: String(e.active.data.current?.title ?? '') });
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over) return;
    const id = String(active.id);
    const target = String(over.id);
    if (id.startsWith('backlog:')) {
      const toDay = target.startsWith('chip:') ? target.slice(5) : day;
      void call(() => addIdea(id.slice(8), toDay));
      return;
    }
    if (target.startsWith('chip:')) {
      if (target.slice(5) !== day) void call(() => api.post('schedule/update', { id, day: target.slice(5) }, { tripId: trip.id }));
      return;
    }
    const from = movable.indexOf(id);
    const to = movable.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    const order = arrayMove(movable, from, to);
    setPending({ day, order });
    void call(() => api.post('schedule/reorder', { day, order }, { tripId: trip.id }));
  };

  const mapStops: MapStop[] = [];
  rows.forEach((r) => {
    const at = r.in ?? r.out;
    if (at) mapStops.push({ id: r.item.id, label: r.item.locked ? '•' : String(mapStops.filter((s) => !s.booking).length + 1), title: r.title, location: at, booking: r.item.locked });
  });
  const loading = schedule.loading || ideas.loading || bookings.loading;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-[#161C23]">Timeline</h1>
            <p className="text-sm text-[#6D7A77]">Drag approved ideas onto a day. Bookings stay fixed.</p>
          </div>
          <Button variant="secondary" className="md:hidden shrink-0" onClick={() => setShowMap((v) => !v)} aria-pressed={showMap}>
            <MapIcon className="w-4 h-4" /> {showMap ? 'List' : 'Map'}
          </Button>
        </div>

        <div className="-mx-4 px-4 overflow-x-auto">
          <div className="flex gap-2 w-max pb-1">
            {days.map((d, i) => (
              <DayChip key={d} day={d} index={i} selected={d === day} count={rowsByDay.get(d)?.length ?? 0} onClick={() => setDay(d)} />
            ))}
          </div>
        </div>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px] items-start">
          <div className={cx('space-y-2', showMap && 'hidden md:block')}>
            {loading ? (
              <Spinner label="Loading timeline…" />
            ) : (
              <DayList empty={!rows.length}>
                <SortableContext items={movable} strategy={verticalListSortingStrategy}>
                  {rows.map((r, i) => (
                    <div key={r.item.id}>
                      {i > 0 && <TravelRow leg={r.item.transitFromPrev} a={rows[i - 1].out} b={r.in} />}
                      <StopRow row={r} warnings={warnings.get(r.item.id) ?? []} onOpen={() => !r.item.locked && setEditing(r)} />
                    </div>
                  ))}
                </SortableContext>
              </DayList>
            )}
          </div>

          <div className="space-y-4 md:sticky md:top-4">
            <Card className={cx('overflow-hidden h-72 md:h-80', !showMap && 'hidden md:block')}>
              <DayMap stops={mapStops} onSelect={(id) => setEditing(rows.find((r) => r.item.id === id && !r.item.locked) ?? null)} />
            </Card>
            <Backlog ideas={backlog} onAdd={setAdding} />
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && <div className="px-4 py-3 rounded-2xl bg-white shadow-xl border border-[#00685F]/40 font-semibold text-sm text-[#161C23] max-w-xs truncate">{dragging.title}</div>}
      </DragOverlay>

      <EditStopSheet
        item={editing?.item ?? null}
        idea={editing?.idea}
        title={editing?.title ?? ''}
        days={days}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          await api.post('schedule/update', { id: editing!.item.id, ...patch }, { tripId: trip.id });
          if (patch.day !== day) setDay(patch.day);
        }}
        onRemove={() => api.post('schedule/remove', { id: editing!.item.id }, { tripId: trip.id })}
      />
      <AddStopSheet
        idea={adding}
        days={days}
        defaultDay={day}
        onClose={() => setAdding(null)}
        onAdd={async (toDay, start) => {
          await addIdea(adding!.id, toDay, start);
          if (toDay !== day) setDay(toDay);
        }}
      />
    </DndContext>
  );
}

function DayChip({ day, index, selected, count, onClick }: { day: string; index: number; selected: boolean; count: number; onClick: () => void }) {
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
      <span className={cx('block text-[11px] font-bold uppercase tracking-wider', selected ? 'text-white/80' : 'text-[#6D7A77]')}>Day {index + 1}</span>
      <span className="block text-sm font-semibold whitespace-nowrap">{formatDay(day)}</span>
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

function StopRow({ row, warnings, onOpen }: { row: Row; warnings: DayWarning[]; onOpen: () => void }) {
  const { item } = row;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: item.locked, data: { title: row.title } });
  const moment = item.start === item.end;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx(isDragging && 'opacity-40')}>
      <Card className={cx('flex items-stretch', item.locked && 'bg-[#F3EFE9]')}>
        <div className="w-[4.75rem] shrink-0 py-3 pl-3 text-xs font-bold text-[#161C23] tabular-nums">
          <p>{fmtClock(toMin(item.start))}</p>
          {!moment && <p className="text-[#6D7A77] font-semibold">{fmtClock(toMin(item.end))}</p>}
        </div>
        <button type="button" onClick={onOpen} disabled={item.locked} className="flex-1 min-w-0 py-3 pr-2 text-left disabled:cursor-default">
          <p className="flex items-center gap-1.5 font-semibold text-[#161C23]">
            <span className="text-[#00685F] shrink-0">{row.icon}</span>
            <span className="truncate">{row.title}</span>
          </p>
          {row.subtitle && <p className="text-xs text-[#6D7A77] truncate">{row.subtitle}</p>}
          {warnings.map((w) => (
            <p key={w.kind} className="mt-1 flex items-start gap-1 text-xs text-[#8A5A00]">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {w.text}
            </p>
          ))}
        </button>
        {item.locked ? (
          <span className="w-11 shrink-0 flex items-center justify-center text-[#9AA5A3]" title="Booking — fixed time">
            <Lock className="w-4 h-4" />
          </span>
        ) : (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Drag to reorder ${row.title}`}
            className="w-11 shrink-0 flex items-center justify-center text-[#9AA5A3] touch-none cursor-grab active:cursor-grabbing"
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

function Backlog({ ideas, onAdd }: { ideas: Idea[]; onAdd: (idea: Idea) => void }) {
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
        <ul className="space-y-2">
          {ideas.map((i) => (
            <BacklogItem key={i.id} idea={i} onAdd={() => onAdd(i)} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function BacklogItem({ idea, onAdd }: { idea: Idea; onAdd: () => void }) {
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
          <span className="block text-xs text-[#6D7A77] truncate">{idea.place.typeLabel ?? idea.place.category} · {idea.estDurationMin} min</span>
        </span>
      </button>
      <Button variant="ghost" className="shrink-0 px-2.5" onClick={onAdd} aria-label={`Add ${idea.place.name} to a day`}>
        <Plus className="w-4 h-4" /> Add
      </Button>
    </li>
  );
}
