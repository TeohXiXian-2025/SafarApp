// Timeline arranging.
//   Manual: put backlog ideas on a day, move / re-time / reorder them, take
//   them off again. Split pairs move together; bookings stay locked.
//   AI Arrange (admin): plan every stop across the trip → preview → apply → undo.
// After every change the day's prayer breaks and travel legs are refreshed.
import { Type } from '@google/genai';
import { z } from 'zod';
import {
  ArrangeJob,
  arrangeTrip,
  Id,
  ideaItemId,
  LocalDate,
  LocalTime,
  lockedPrayers,
  nextSlot,
  PACE,
  PRAYER_LABEL,
  mergePrefs,
  paths,
  ScheduleItem,
  estimateTravelMin,
  findSlot,
  firstFit,
  fitsPrayerBreak,
  byTimeAndPriority,
  praysInside,
  cityOf,
  GeoPoint,
  MEAL_WINDOW,
  goodForWhilePraying,
  openingRanges,
  prays,
  isOutdoor,
  metersBetween,
  timeSequence,
  toClock,
  toMin,
  tripDays,
  Idea,
  type Trip,
  type MealKey,
  type Unit,
  type ArrangedDay,
  type DayFrame,
  type UnfitReason,
  rebaseFrame,
} from '../../src/domain/index.js';
import { FieldValue, type WriteBatch } from 'firebase-admin/firestore';
import { withTrip } from '../_lib/auth.js';
import { DEFAULT_DURATION, ideaPlaceFrom, searchNearby, searchNearbyFood, type NearbyFood } from '../_lib/places.js';
import { mealPlaces } from '../_lib/meals.js';
import { cachedLeg } from '../_lib/directions.js';
import { rememberPlaces } from '../_lib/openPlaces.js';
import { adminDb } from '../_lib/firebaseAdmin.js';
import { extractJson } from '../_lib/gemini.js';
import { HttpError, json, readJson } from '../_lib/http.js';
import { useDailyQuota } from '../_lib/quota.js';
import type { RouteTable } from '../_lib/routes.js';
import {
  approvedSplit,
  dayCitiesOf,
  dayItems,
  dayProblems,
  frameAt,
  framesFor,
  ideaDocRef,
  isAltOfSplit,
  isPrayerItem,
  leadIdea,
  isTrackB,
  itemEnds,
  itemRef,
  loadTripData,
  pairIds,
  planFixDay,
  refreshDay,
  writeFixPlan,
  unitFor,
  writeStops,
  dayChain,
  prayerWalk,
  stopName,
  type TripData,
} from '../_lib/schedule.js';
import { notify } from '../_lib/push.js';
import { logActivity } from '../_lib/trip.js';

const jobRef = (tripId: string, id: string) => adminDb().doc(paths.job(tripId, id));

/** Activities for the ones not praying: within this of the prayer place (then checked for time). */
const OPTION_M = 3000;

/**
 * A prayer break's surroundings: the prayer place, its locked time, and the
 * next stop after it (where the others may meet the group again).
 */
function breakContext(data: TripData, item: ScheduleItem, dayList: ScheduleItem[]) {
  const at = item.prayer?.facility?.location ?? (item.ref.kind === 'custom' ? item.ref.place?.location : undefined);
  if (!at) return null;
  const start = toMin(item.start);
  const end = toMin(item.end);
  const stops = dayList.filter((i) => !isPrayerItem(i) && !isTrackB(i)).sort(byTimeAndPriority);
  const ends = itemEnds(data, stops);
  const nextItem = stops.find((i) => toMin(i.start) >= end && ends.get(i.id));
  const next = nextItem ? { name: stopName(data, nextItem), location: ends.get(nextItem.id)!.in, start: toMin(nextItem.start) } : undefined;
  return { at, start, end, next, prayer: { name: item.prayer?.facility?.name ?? 'the prayer place', location: at } };
}

/** "Right by the prayer place": ~5–7 min on foot. */
const QUICK_M = 600;
/** Short things to do while the others pray. */
const QUICK_TYPES = ['cafe', 'coffee_shop', 'bakery', 'dessert_shop', 'ice_cream_shop', 'tea_house', 'juice_shop', 'book_store', 'gift_shop'];

function assertTripDay(trip: Trip, day: string) {
  if (day < trip.startDate || day > trip.endDate) throw new HttpError(400, 'That day is outside the trip dates');
}

async function loadMovable(tripId: string, id: string): Promise<ScheduleItem> {
  const snap = await itemRef(tripId, id).get();
  if (!snap.exists) throw new HttpError(404, 'That stop is no longer on the timeline');
  const item = ScheduleItem.parse(snap.data());
  if (item.locked) throw new HttpError(409, 'Bookings are fixed — edit the booking to change its time');
  if (isPrayerItem(item)) throw new HttpError(409, 'Prayer breaks are placed automatically around your stops');
  return item;
}

const ideaOf = (data: TripData, item: ScheduleItem) => (item.ref.kind === 'idea' ? data.ideas.get(item.ref.ideaId) : undefined);

/** A day's stops plus its locked prayer times, for finding the next free slot. */
function withPrayerTimes(data: TripData, day: string, items: ScheduleItem[], near?: GeoPoint) {
  const prayers = lockedPrayers(frameAt(data, day, near).prayers).map((p) => ({ id: `prayer_${p.key}`, start: toClock(p.start), end: toClock(p.end), orderIndex: 0, locked: true }));
  return [...items, ...prayers];
}

/**
 * When no time was given: the first time the stop fits on the day — the same
 * placement the Timeline previews (travel, prayer times, journeys, opening
 * hours) — else after the day's last stop.
 */
function autoStart(data: TripData, dayList: ScheduleItem[], idea: Idea, duration: number, day: string, movingIds: string[] = []): number {
  const { rows, travel, zones } = dayChain(data, dayList.filter((i) => !movingIds.includes(i.id)));
  const fit = firstFit(day, rows, { id: '__new', duration, loc: idea.place.location, hours: idea.place.openingHours, prayInside: praysInside(prayerWalk(idea)) }, travel, zones);
  if (fit) return fit.start;
  const stops = dayList.filter((i) => !isPrayerItem(i) && !movingIds.includes(i.id));
  return toMin(nextSlot(withPrayerTimes(data, day, stops, idea.place.location), duration).start);
}

/** A stop only goes on a day the group is in its city (days with no known city are open). */
function assertCity(data: TripData, day: string, at: GeoPoint, name: string) {
  const dests = data.trip.destinations;
  if (dests.length < 2) return;
  const cities = dayCitiesOf(data).get(day);
  if (!cities?.length) return;
  const c = cityOf(dests, at);
  if (!cities.includes(c)) throw new HttpError(400, `${name} is in ${dests[c].name}, but on that day you're in ${cities.map((i) => dests[i].name).join(' / ')} — pick a day in ${dests[c].name}.`);
}

/** Where a stop ended up after the day was re-timed (travel measured, prayer places found). */
async function landedAt(tripId: string, id: string): Promise<string | undefined> {
  const snap = await itemRef(tripId, id).get();
  return snap.exists ? (snap.data()?.start as string | undefined) : undefined;
}

/** Refresh several days one after another (they share Routes API budgets). */
async function refreshDays(tripId: string, days: Iterable<string>, data: TripData) {
  for (const d of new Set(days)) await refreshDay(tripId, d, data);
}

export const scheduleRoutes: RouteTable = {
  /** Put a backlog idea (or split pair) on a day — at `start`, or after the day's last stop. */
  'POST schedule/add': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ ideaId: Id, day: LocalDate, start: LocalTime.optional(), durationMin: z.number().int().min(5).max(24 * 60).optional(), pinned: z.boolean().optional() }));
      await useDailyQuota(member.uid, 'arrange');
      const data = await loadTripData(tripId);
      assertTripDay(data.trip, body.day);
      const idea = data.ideas.get(body.ideaId);
      if (!idea) throw new HttpError(404, 'Idea not found');
      if (idea.status === 'scheduled') throw new HttpError(409, `${idea.place.name} is already on the timeline`);
      if (idea.status !== 'backlog') throw new HttpError(409, 'Only ideas in the backlog can go on the timeline');

      const split = approvedSplit(data, idea);
      const lead = leadIdea(data, idea);
      assertCity(data, body.day, lead.place.location, lead.place.name);
      const all = await dayItems(tripId, body.day);
      const day = all.filter((i) => !isPrayerItem(i));
      // A split's length comes from its groups; a single stop can be given its own.
      const duration = split ? unitFor(lead, split).duration : (body.durationMin ?? unitFor(lead, split).duration);
      const start = body.start ? toMin(body.start) : autoStart(data, all, lead, duration, body.day);

      if (start + duration > 24 * 60 - 1) throw new HttpError(400, `${lead.place.name} would run past midnight there — pick an earlier time or another day`);
      const batch = adminDb().batch();
      const placed = writeStops(batch, tripId, { data, idea: lead, day: body.day, start, durationMin: split ? undefined : duration, orderIndex: day.length, actor: member.uid, pinned: body.pinned });
      placed.forEach((id) => batch.update(ideaDocRef(tripId, id), { status: 'scheduled', updatedAt: Date.now() }));
      logActivity(batch, tripId, member.uid, `${member.displayName} added ${split ? `the split at ${lead.place.name}` : idea.place.name} to ${body.day}`);
      await batch.commit();
      await refreshDay(tripId, body.day, data);
      await alertAdmin(tripId, body.day, member, data);
      const landed = await landedAt(tripId, ideaItemId(lead.id));
      return json({ id: ideaItemId(lead.id), start: landed ?? toClock(start), moved: !!landed && landed !== toClock(start) }, { status: 201 });
    },
    { perMinute: 30 },
  ),

  /** Move a stop (split pairs move together) to another day and/or time, or change how long it takes. */
  'POST schedule/update': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(
        req,
        z.object({ id: Id, day: LocalDate.optional(), start: LocalTime.optional(), durationMin: z.number().int().min(5).max(24 * 60).optional(), pinned: z.boolean().optional() }),
      );
      await useDailyQuota(member.uid, 'arrange');
      const [data, item] = await Promise.all([loadTripData(tripId), loadMovable(tripId, body.id)]);
      const day = body.day ?? item.day;
      assertTripDay(data.trip, day);
      const moved = day !== item.day;
      const current = await dayItems(tripId, item.day);
      // A lunch / dinner stop (no idea behind it): just move / re-time it.
      if (item.ref.kind === 'custom') {
        const duration = body.durationMin ?? toMin(item.end) - toMin(item.start);
        let start = body.start ? toMin(body.start) : toMin(item.start);
        if (moved && item.ref.place) assertCity(data, day, item.ref.place.location, item.ref.title);
        if (moved && !body.start) start = toMin(nextSlot(withPrayerTimes(data, day, (await dayItems(tripId, day)).filter((i) => !isPrayerItem(i)), item.ref.place?.location), duration).start);
        const batch = adminDb().batch();
        batch.delete(itemRef(tripId, item.id));
        batch.set(itemRef(tripId, item.id), ScheduleItem.parse({ ...item, day, start: toClock(start), end: toClock(start + duration), ...(body.pinned !== undefined ? { pinned: body.pinned } : {}), updatedBy: member.uid, updatedAt: Date.now() }));
        await batch.commit();
        await refreshDays(tripId, moved ? [day, item.day] : [day], data);
        return json({ ok: true });
      }
      const group = pairIds(item, current);
      const lead = group.find((i) => !isTrackB(i)) ?? item;
      const leadIdea = ideaOf(data, lead);
      if (!leadIdea) throw new HttpError(404, 'Idea not found');
      const split = approvedSplit(data, leadIdea);

      // (A stop squashed to nothing by an old bug gets its place's length back.)
      const kept = toMin(item.end) - toMin(item.start);
      const duration = split ? split.reunion.afterMinutes : (body.durationMin ?? (kept >= 5 ? kept : leadIdea.estDurationMin));
      // Editing a side group's time moves the whole split: keep its offset from the main group.
      let start = body.start ? toMin(body.start) - (toMin(item.start) - toMin(lead.start)) : toMin(lead.start);
      let orderIndex = lead.orderIndex;
      if (moved) {
        assertCity(data, day, leadIdea.place.location, leadIdea.place.name);
        const all = await dayItems(tripId, day);
        orderIndex = all.filter((i) => !isPrayerItem(i)).length;
        if (!body.start) start = autoStart(data, all, leadIdea, duration, day);
      }
      // Never cut a stop short at midnight: say so instead.
      if (start < 0 || start + duration > 24 * 60 - 1) throw new HttpError(400, `${leadIdea.place.name} would run past midnight there — pick an earlier time or another day`);
      const batch = adminDb().batch();
      group.forEach((g) => batch.delete(itemRef(tripId, g.id)));
      writeStops(batch, tripId, { data, idea: leadIdea, day, start, durationMin: split ? undefined : duration, orderIndex, actor: member.uid, pinned: body.pinned ?? (moved ? false : lead.pinned) });
      await batch.commit();
      await refreshDays(tripId, moved ? [day, item.day] : [day], data);
      await alertAdmin(tripId, day, member, data);
      const landed = await landedAt(tripId, lead.id);
      return json({ ok: true, start: landed ?? toClock(start), moved: !!landed && landed !== toClock(start) });
    },
    { perMinute: 60 },
  ),

  /** New order for a day's movable stops: re-timed back to back around bookings, opening hours and prayer times. */
  'POST schedule/reorder': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ day: LocalDate, order: z.array(Id).min(1).max(100) }));
      await useDailyQuota(member.uid, 'arrange');
      const data = await loadTripData(tripId);
      const items = await dayItems(tripId, body.day);
      const movable = items.filter((i) => !i.locked && !isPrayerItem(i) && !isTrackB(i));
      const ordered = [...body.order.flatMap((id) => movable.find((m) => m.id === id) ?? []), ...movable.filter((m) => !body.order.includes(m.id))];
      if (!ordered.length) return json({ ok: true });

      const ends = itemEnds(data, ordered);
      const units: Unit[] = ordered.map((it) => {
        const idea = ideaOf(data, it);
        const base = idea ? unitFor(idea, approvedSplit(data, idea)) : null;
        return { ...(base ?? { id: it.id }), id: it.id, loc: ends.get(it.id)?.in ?? data.trip.destinations[0].location, duration: Math.max(5, toMin(it.end) - toMin(it.start)) } as Unit;
      });
      const frame = frameAt(data, body.day, units[0]?.loc);
      const locked = items.filter((i) => i.locked && toMin(i.end) > toMin(i.start));
      const timing = timeSequence(
        { ...frame, start: Math.min(...ordered.map((i) => toMin(i.start))), end: 24 * 60 - 1, blocks: locked.map((l) => ({ start: toMin(l.start), end: toMin(l.end) })) },
        units,
        { strict: false },
      );

      const batch = adminDb().batch();
      timing.placed.forEach((p, orderIndex) => {
        const it = ordered.find((o) => o.id === p.id)!;
        const shift = p.start - toMin(it.start);
        for (const g of pairIds(it, items)) {
          batch.update(itemRef(tripId, g.id), { start: toClock(toMin(g.start) + shift), end: toClock(toMin(g.end) + shift), orderIndex, updatedBy: member.uid, updatedAt: Date.now() });
        }
      });
      logActivity(batch, tripId, member.uid, `${member.displayName} reordered ${body.day}`);
      await batch.commit();
      await refreshDay(tripId, body.day, data);
      await alertAdmin(tripId, body.day, member, data);
      return json({ ok: true });
    },
    { perMinute: 60 },
  ),

  /** Take a stop (or split pair) off the timeline; its ideas go back to the backlog. */
  'POST schedule/remove': withTrip(
    async (req, { tripId, member }) => {
      const { id } = await readJson(req, z.object({ id: Id }));
      const [data, item] = await Promise.all([loadTripData(tripId), loadMovable(tripId, id)]);
      // A lunch / dinner restaurant (picked by someone, or by AI Arrange): it goes to the backlog
      // as a food idea — no vote, it was already chosen — so it can be put back later.
      if (item.ref.kind === 'custom' && item.ref.meal && item.ref.place) {
        const batch = adminDb().batch();
        batch.delete(itemRef(tripId, item.id));
        const ideaId = mealToBacklog(batch, tripId, data, item, member.uid);
        logActivity(batch, tripId, member.uid, `${member.displayName} took ${item.ref.title} off ${item.day}`);
        await batch.commit();
        await refreshDay(tripId, item.day, data);
        return json({ ok: true, ...(ideaId ? { ideaId } : {}) });
      }
      const group = pairIds(item, await dayItems(tripId, item.day));
      const batch = adminDb().batch();
      for (const g of group) {
        batch.delete(itemRef(tripId, g.id));
        const idea = ideaOf(data, g);
        if (idea) batch.update(ideaDocRef(tripId, idea.id), { status: 'backlog', updatedAt: Date.now() });
      }
      const lead = ideaOf(data, group.find((g) => !isTrackB(g)) ?? item);
      if (lead) logActivity(batch, tripId, member.uid, `${member.displayName} took ${lead.place.name} off ${item.day}`);
      await batch.commit();
      await refreshDay(tripId, item.day, data);
      return json({ ok: true });
    },
    { perMinute: 60 },
  ),

  /**
   * AI Arrange (any member): plans the backlog + scheduled ideas — across the
   * trip, or for one day — around the bookings, the city you're in each day,
   * opening hours, meal times, pace and prayer times, visiting each day's
   * places in the shortest order. The plan is one shared preview (everyone
   * sees the same one; a new one replaces it) and nothing changes until the
   * admin applies it.
   */
  'POST schedule/arrange': withTrip(
    async (req, { tripId, user }) => {
      const body = await readJson(req, z.object({ day: LocalDate.optional() }).default({}));
      await useDailyQuota(user.uid, 'arrange');
      const data = await loadTripData(tripId);
      if (body.day) assertTripDay(data.trip, body.day);
      const days = body.day ? [body.day] : tripDays(data.trip.startDate, data.trip.endDate);
      const frames = framesFor(data, days);
      // One day: what's on it now + the backlog (in that day's city); the other days stay as they are.
      const onDay = body.day ? new Set((await dayItems(tripId, body.day)).flatMap((i) => (i.ref.kind === 'idea' ? [i.ref.ideaId] : []))) : null;
      const dayCity = body.day ? dayCitiesOf(data).get(body.day) : undefined;
      const inCity = (i: Idea) => !dayCity?.length || data.trip.destinations.length < 2 || dayCity.includes(cityOf(data.trip.destinations, i.place.location));
      const ideas = [...data.ideas.values()].filter(
        (i) => !isAltOfSplit(data, i) && (onDay ? onDay.has(i.id) || (i.status === 'backlog' && inCity(i)) : i.status === 'backlog' || i.status === 'scheduled'),
      );
      if (!ideas.length) throw new HttpError(409, body.day ? 'Nothing to plan for this day — add ideas to the backlog (in this city) first' : 'Nothing to arrange yet — approve some ideas on the Idea Board first');
      const units = ideas.map((i) => unitFor(i, approvedSplit(data, i), data.trip.destinations));
      const pace = mergePrefs(data.members).pace ?? 'moderate';
      // Straight-line estimates run short of real routes (checked after Apply) — plan with a margin.
      const travel = (a: GeoPoint, b: GeoPoint) => Math.round(estimateTravelMin(a, b) * 1.25);
      const draft = arrangeTrip(frames, units, { maxStops: PACE[pace].maxStops, travel, destinations: data.trip.destinations, dayCities: dayCitiesOf(data), meals: true });
      // The order was chosen with estimates (many orders tried); the preview is timed with real routes.
      const real = await withRealRoutes(draft.days, frames, travel, data.trip.destinations);
      const result = { days: real.days, unplaced: [...draft.unplaced, ...real.dropped] };

      const plan: ArrangeJob['plan'] = {
        days: result.days
          .filter((d) => d.timing.placed.length)
          .map((d) => ({
            day: d.day,
            travelMin: Math.round(d.timing.travelMin),
            stops: d.timing.placed.filter((p) => !p.id.startsWith('meal:')).map((p) => ({ ideaId: p.id, start: toClock(p.start), end: toClock(p.end) })),
            prayers: d.timing.prayers.map((p) => ({ key: p.key, start: toClock(p.start), end: toClock(p.end) })),
            meals: d.timing.placed.filter((p) => p.id.startsWith('meal:')).map((p) => ({ key: p.id.slice(5) as MealKey, start: toClock(p.start), end: toClock(p.end), ...(p.at ? { near: p.at } : {}) })),
          })),
        // For one day, the backlog ideas that didn't make it simply stay in the backlog.
        unplaced: result.unplaced.filter((u) => !onDay || onDay.has(u.id)).map((u) => ({ ideaId: u.id, reason: u.reason })),
      };
      await pickRestaurants(plan);
      await addNotes(plan, data);

      const ref = adminDb().collection(paths.jobs(tripId)).doc();
      const job = ArrangeJob.parse({ id: ref.id, kind: 'arrange', status: 'preview', ...(body.day ? { day: body.day } : {}), plan, createdBy: user.uid, at: Date.now() });
      // One shared preview: a new plan replaces any open one.
      const open = await adminDb().collection(paths.jobs(tripId)).where('status', '==', 'preview').get();
      const batch = adminDb().batch();
      open.docs.forEach((d) => batch.update(d.ref, { status: 'discarded' }));
      batch.set(ref, job);
      await batch.commit();
      if (user.uid !== data.trip.adminId) {
        await notify(
          [data.trip.adminId],
          { kind: 'timeline', title: 'An AI plan is waiting for you', body: `A member made an AI plan for ${body.day ?? 'the whole trip'} — open the Timeline to check and apply it.`, url: `/t/${tripId}/timeline${body.day ? `?day=${body.day}` : ''}`, tag: `plan-${tripId}` },
          { timeZone: data.trip.destinations[0].timezone },
        ).catch(() => {});
      }
      return json(job);
    },
    { perMinute: 6 },
  ),

  /** Apply a previewed plan: replaces every movable stop (bookings stay). Undo restores the old ones. */
  'POST schedule/apply': withTrip(
    async (req, { tripId, member }) => {
      const { jobId } = await readJson(req, z.object({ jobId: Id }));
      const snap = await jobRef(tripId, jobId).get();
      const job = snap.exists ? ArrangeJob.parse(snap.data()) : null;
      if (job?.status !== 'preview') throw new HttpError(409, 'That preview is no longer available — arrange again');
      const data = await loadTripData(tripId);
      const current = (await adminDb().collection(paths.schedule(tripId)).get()).docs.map((d) => ScheduleItem.parse(d.data()));
      // A one-day plan only replaces that day's stops.
      const before = current.filter((i) => !i.locked && (!job.day || i.day === job.day));

      const batch = adminDb().batch();
      before.forEach((i) => batch.delete(itemRef(tripId, i.id)));
      const scheduled = new Set<string>();
      for (const d of job.plan.days) {
        d.stops.forEach((s, orderIndex) => {
          const idea = data.ideas.get(s.ideaId);
          if (!idea) return;
          const split = approvedSplit(data, idea);
          const ids = writeStops(batch, tripId, { data, idea, day: d.day, start: toMin(s.start), durationMin: split ? undefined : toMin(s.end) - toMin(s.start), orderIndex, actor: member.uid });
          ids.forEach((id) => scheduled.add(id));
        });
        // Lunch / dinner at the restaurant the plan picked (skipped when none was found nearby).
        for (const m of d.meals) {
          if (!m.place) continue;
          batch.set(itemRef(tripId, mealItemId(d.day, m.key)), mealItem({ day: d.day, meal: m.key, start: m.start, end: m.end, place: m.place, phone: m.phone, members: data.trip.memberIds, actor: member.uid }));
        }
      }
      const wasScheduled = new Set(before.flatMap((i) => (i.ref.kind === 'idea' ? [i.ref.ideaId] : [])));
      for (const id of new Set([...scheduled, ...wasScheduled])) {
        if (data.ideas.has(id)) batch.update(ideaDocRef(tripId, id), { status: scheduled.has(id) ? 'scheduled' : 'backlog', updatedAt: Date.now() });
      }
      batch.update(snap.ref, { status: 'applied', before, appliedAt: Date.now() });
      const meals = job.plan.days.reduce((n, d) => n + d.meals.filter((m) => m.place).length, 0);
      logActivity(batch, tripId, member.uid, `${member.displayName} applied AI Arrange (${scheduled.size} stops${meals ? ` + ${meals} meals` : ''} over ${job.plan.days.length} days)`);
      await batch.commit();
      await refreshDays(tripId, [...job.plan.days.map((d) => d.day), ...before.map((i) => i.day)], data);
      // With real travel times in, re-check each day; anything 🔴 is re-timed right away.
      const fixed = await autoFix(tripId, job.plan.days.map((d) => d.day), member.uid);
      await notify(
        data.trip.memberIds,
        { kind: 'timeline', title: 'The timeline was re-planned', body: `${member.displayName} applied AI Arrange: ${scheduled.size} stops over ${job.plan.days.length} days.`, url: `/t/${tripId}/timeline`, tag: `timeline-${tripId}` },
        { timeZone: data.trip.destinations[0].timezone, except: member.uid },
      );
      return json({ ok: true, fixed });
    },
    { admin: true, perMinute: 6 },
  ),

  /** Undo an applied plan: puts back exactly what was on the timeline before. */
  'POST schedule/undo': withTrip(
    async (req, { tripId, member }) => {
      const { jobId } = await readJson(req, z.object({ jobId: Id }));
      const snap = await jobRef(tripId, jobId).get();
      const job = snap.exists ? ArrangeJob.parse(snap.data()) : null;
      if (job?.status !== 'applied' || !job.before) throw new HttpError(409, 'Nothing to undo');
      const data = await loadTripData(tripId);
      const current = (await adminDb().collection(paths.schedule(tripId)).get()).docs.map((d) => ScheduleItem.parse(d.data())).filter((i) => !i.locked && (!job.day || i.day === job.day));

      const batch = adminDb().batch();
      current.forEach((i) => batch.delete(itemRef(tripId, i.id)));
      // Restore stops whose ideas still exist (one may have been deleted since).
      const restore = job.before.filter((i) => i.ref.kind !== 'idea' || data.ideas.has(i.ref.ideaId));
      restore.forEach((i) => batch.set(itemRef(tripId, i.id), i));
      const restored = new Set(restore.flatMap((i) => (i.ref.kind === 'idea' ? [i.ref.ideaId] : [])));
      const nowScheduled = new Set(current.flatMap((i) => (i.ref.kind === 'idea' ? [i.ref.ideaId] : [])));
      for (const id of new Set([...restored, ...nowScheduled])) {
        if (data.ideas.has(id)) batch.update(ideaDocRef(tripId, id), { status: restored.has(id) ? 'scheduled' : 'backlog', updatedAt: Date.now() });
      }
      batch.update(snap.ref, { status: 'undone' });
      logActivity(batch, tripId, member.uid, `${member.displayName} undid AI Arrange`);
      await batch.commit();
      await refreshDays(tripId, [...current.map((i) => i.day), ...restore.map((i) => i.day)], data);
      return json({ ok: true });
    },
    { admin: true, perMinute: 6 },
  ),

  /**
   * "Fix this day": re-orders and re-times the day's movable stops so nothing
   * is outside opening hours or unreachable (travel + buffer, around bookings
   * and prayer times). Stops that can't fit that day go back to the backlog.
   * Without `apply` it's a preview.
   */
  'POST schedule/fixday': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ day: LocalDate, apply: z.boolean().default(false) }));
      const data = await loadTripData(tripId);
      const items = await dayItems(tripId, body.day);
      const { stops, removed } = planFixDay(data, body.day, items);
      if (!body.apply || (!stops.length && !removed.length)) return json({ stops, removed });

      const batch = adminDb().batch();
      writeFixPlan(batch, tripId, data, items, { stops, removed }, member.uid);
      logActivity(batch, tripId, member.uid, `${member.displayName} fixed ${body.day}${removed.length ? ` (${removed.length} stop${removed.length > 1 ? 's' : ''} back to the backlog)` : ''}`);
      await batch.commit();
      await refreshDay(tripId, body.day, data);
      return json({ stops, removed });
    },
    { perMinute: 20 },
  ),

  /**
   * What someone who isn't praying can do during a prayer break: ideas the ones
   * praying marked "good while we pray" first, then accepted ideas and split
   * alternatives none of them voted against, backups / split-vote ideas they
   * liked (even if the ones praying turned them down) — all in the same city,
   * open then, and with time to get there, stay a while and reach where
   * everyone meets again; plus quick places right by the prayer place.
   */
  'POST prayer/options': withTrip(
    async (req, { tripId, member }) => {
      const { itemId } = await readJson(req, z.object({ itemId: Id }));
      const snap = await itemRef(tripId, itemId).get();
      const item = snap.exists ? ScheduleItem.parse(snap.data()) : null;
      if (!item?.prayer) throw new HttpError(404, 'That prayer break is no longer on the timeline');
      const data = await loadTripData(tripId);
      const ctx = breakContext(data, item, await dayItems(tripId, item.day));
      if (!ctx) return json({ ideas: [], nearby: [] });
      const { at, start, end, next, prayer } = ctx;
      const openThen = (hours?: string[]) => {
        const r = openingRanges(hours, item.day);
        return r === null || r.some(([o, c]) => o <= start && c >= end);
      };
      const city = data.trip.destinations.length > 1 ? cityOf(data.trip.destinations, at) : null;
      const ideas = [...data.ideas.values()]
        .filter((i) => goodForWhilePraying(i, [member.uid]) && (city === null || cityOf(data.trip.destinations, i.place.location) === city) && metersBetween(i.place.location, at) <= OPTION_M && openThen(i.place.openingHours))
        .flatMap((i) => {
          const fit = fitsPrayerBreak({ pick: i.place.location, prayer, start, end, next });
          if (!fit.fits) return [];
          return [
            {
              ideaId: i.id,
              name: i.place.name,
              typeLabel: i.place.typeLabel ?? i.place.category,
              walkMin: estimateTravelMin(at, i.place.location),
              status: i.status,
              marked: i.goodWhilePraying.length,
              liked: i.votes[member.uid]?.value === 1,
              short: i.estDurationMin <= fit.stayMin + 10,
              stayMin: fit.stayMin,
              split: isAltOfSplit(data, i),
              meet: { kind: fit.meet.kind, name: fit.meet.name || 'halfway', at: toClock(fit.meet.at) },
              location: i.place.location,
            },
          ];
        })
        .sort((a, b) => b.marked - a.marked || Number(b.liked) - Number(a.liked) || a.walkMin - b.walkMin)
        .slice(0, 10);
      // Quick places right by the prayer place (cached per spot for a day).
      const cell = `${at.lat.toFixed(3)}_${at.lng.toFixed(3)}`;
      const cacheRef = adminDb().doc(`quickNearby/${cell}`);
      const cached = (await cacheRef.get()).data();
      let nearby = cached && Date.now() - Number(cached.at) < 86_400_000 ? (cached.places as NearbyFood[]) : null;
      if (!nearby) {
        nearby = (await searchNearbyFood(at, QUICK_TYPES, QUICK_M, 10)) ?? [];
        await cacheRef.set({ at: Date.now(), places: nearby }).catch(() => {});
      }
      return json({
        ideas,
        nearby: nearby.map((p) => ({ placeId: p.placeId, name: p.name, location: p.location, typeLabel: p.typeLabel, rating: p.rating, walkMin: estimateTravelMin(at, p.location), ...(p.source && p.source !== 'google' ? { via: p.source === 'traveller' ? 'traveller reports' : 'OpenStreetMap' } : {}) })),
        meetDefault: { name: prayer.name, at: toClock(end) },
      });
    },
    { perMinute: 20 },
  ),

  /**
   * A member who doesn't pray picks what they'll do during a prayer break (or
   * clears it with null). No vote needed — it's their own time. Where they
   * meet the others again is worked out from where it is (meetPoint).
   */
  'POST prayer/pick': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(
        req,
        z.object({
          itemId: Id,
          pick: z
            .discriminatedUnion('kind', [
              z.object({ kind: z.literal('idea'), ideaId: Id }),
              z.object({ kind: z.literal('place'), place: z.object({ name: z.string().min(1).max(200), location: GeoPoint, placeId: z.string().max(300).optional() }) }),
              z.object({ kind: z.literal('rest') }),
            ])
            .nullable(),
        }),
      );
      const data = await loadTripData(tripId);
      // Members who said they pray have their break; anyone who hasn't said (no preferences yet) may choose.
      const me = data.members.find((m) => m.uid === member.uid) ?? member;
      if (me.prefs?.prayerReminders) {
        throw new HttpError(409, 'You have prayer breaks on — turn them off in your preferences to pick something else.');
      }
      const ref = itemRef(tripId, body.itemId);
      const snap = await ref.get();
      const item = snap.exists ? ScheduleItem.parse(snap.data()) : null;
      if (!item?.prayer) throw new HttpError(404, 'That prayer break is no longer on the timeline');
      const ctx = breakContext(data, item, await dayItems(tripId, item.day));
      let pick: NonNullable<ScheduleItem['prayer']>['fillerPicks'][string] | null = null;
      let place: { name: string; location: GeoPoint; placeId?: string } | undefined;
      if (body.pick?.kind === 'idea') {
        const idea = data.ideas.get(body.pick.ideaId);
        if (!idea || !goodForWhilePraying(idea, [member.uid])) throw new HttpError(400, 'Pick one of the ideas you accepted (or a backup you liked)');
        place = { name: idea.place.name, location: idea.place.location, ...(idea.place.placeId ? { placeId: idea.place.placeId } : {}) };
        pick = { kind: 'idea', title: idea.place.name, ideaId: idea.id, place, at: Date.now() };
      } else if (body.pick?.kind === 'place') {
        place = body.pick.place;
        pick = { kind: 'place', title: body.pick.place.name, place: body.pick.place, at: Date.now() };
      } else if (body.pick?.kind === 'rest') {
        pick = { kind: 'rest', title: 'Free time nearby', at: Date.now() };
      }
      if (pick && place && ctx) {
        const dests = data.trip.destinations;
        if (dests.length > 1 && cityOf(dests, place.location) !== cityOf(dests, ctx.at)) throw new HttpError(400, `${place.name} is in another city — pick something in ${dests[cityOf(dests, ctx.at)].name}.`);
        const fit = fitsPrayerBreak({ pick: place.location, prayer: ctx.prayer, start: ctx.start, end: ctx.end, next: ctx.next });
        if (!fit.fits) throw new HttpError(400, `${place.name} is too far for this break — there'd be no time there before everyone meets again.`);
        let name = fit.meet.name;
        // A point halfway: name it after a station or landmark right there.
        if (fit.meet.kind === 'middle') {
          const spot = ((await searchNearby(fit.meet.location, ['train_station', 'subway_station', 'tourist_attraction', 'park'], 500, 1).catch(() => null)) ?? [])[0];
          name = spot?.name ?? 'halfway';
          if (spot) fit.meet.location = spot.location;
        }
        pick.meet = { kind: fit.meet.kind, name, location: fit.meet.location, at: toClock(fit.meet.at) };
      }
      await ref.update({ [`prayer.fillerPicks.${member.uid}`]: pick ?? FieldValue.delete(), updatedAt: Date.now() });
      return json({ ok: true, ...(pick?.meet ? { meet: pick.meet } : {}) });
    },
    { perMinute: 30 },
  ),

  /** Mosques / prayer rooms to choose from for a prayer break (the time stays locked). */
  'POST prayer/places': withTrip(
    async (req, { tripId }) => {
      const { itemId } = await readJson(req, z.object({ itemId: Id }));
      const snap = await itemRef(tripId, itemId).get();
      const item = snap.exists ? ScheduleItem.parse(snap.data()) : null;
      if (!item?.prayer) throw new HttpError(404, 'That prayer break is no longer on the timeline');
      const data = await loadTripData(tripId);
      const list = await dayItems(tripId, item.day);
      const ctx = breakContext(data, item, list);
      if (!ctx) return json({ places: [] });
      const stops = list.filter((i) => !isPrayerItem(i) && !isTrackB(i)).sort(byTimeAndPriority);
      const ends = itemEnds(data, stops);
      const before = [...stops].reverse().find((i) => toMin(i.end) <= ctx.start || (toMin(i.start) <= ctx.start && toMin(i.end) > ctx.start));
      const after = stops.find((i) => toMin(i.start) >= ctx.end);
      const anchors = [
        ...(before && ends.get(before.id) ? [{ label: `near ${stopName(data, before)}`, at: ends.get(before.id)!.out }] : []),
        ...(after && ends.get(after.id) ? [{ label: `near ${stopName(data, after)}`, at: ends.get(after.id)!.in }] : []),
        { label: 'near the current place', at: ctx.at },
      ];
      const found: { name: string; location: GeoPoint; placeId?: string; near: string; walkMin: number; via?: string }[] = [];
      const add = (p: { name: string; location: GeoPoint; placeId?: string; via?: string }) => {
        if (found.some((f) => f.name === p.name && metersBetween(f.location, p.location) < 50)) return;
        const best = anchors.map((a) => ({ a, m: metersBetween(a.at, p.location) })).sort((x, y) => x.m - y.m)[0];
        found.push({ ...p, near: best.a.label, walkMin: estimateTravelMin(best.a.at, p.location) });
      };
      for (const it of [before, after]) {
        const idea = it?.ref.kind === 'idea' ? data.ideas.get(it.ref.ideaId) : undefined;
        const pr = idea?.halal?.prayer;
        if (!idea || !pr) continue;
        if (pr.access === 'onsite') add({ name: `${idea.place.name} (prayer space on site)`, location: idea.place.location, ...(idea.place.placeId ? { placeId: idea.place.placeId } : {}) });
        pr.places.slice(0, 3).forEach((p) => add({ name: p.name, location: p.location, ...(p.placeId ? { placeId: p.placeId } : {}) }));
      }
      // Mosques around each end (cached per spot for a week).
      for (const a of anchors.slice(0, 2)) {
        const cell = `${a.at.lat.toFixed(3)}_${a.at.lng.toFixed(3)}`;
        const cacheRef = adminDb().doc(`mosquesNearby/${cell}`);
        const cached = (await cacheRef.get()).data();
        let near = cached && Date.now() - Number(cached.at) < 7 * 86_400_000 ? (cached.places as { name: string; location: GeoPoint; placeId: string; via?: string }[]) : null;
        if (!near) {
          near = ((await searchNearby(a.at, ['mosque'], 2500, 5).catch(() => null)) ?? []).map((p) => ({ name: p.name, location: p.location, placeId: p.placeId, ...(p.source && p.source !== 'google' ? { via: p.source === 'traveller' ? 'traveller reports' : 'OpenStreetMap' } : {}) }));
          await cacheRef.set({ at: Date.now(), places: near }).catch(() => {});
        }
        near.forEach(add);
      }
      return json({ places: found.sort((x, y) => x.walkMin - y.walkMin).slice(0, 10), current: item.prayer.facility?.name ?? null });
    },
    { perMinute: 20 },
  ),

  /** Choose where to pray for a break (null = back to Safar's pick). The time stays locked. */
  'POST prayer/place': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ itemId: Id, place: z.object({ name: z.string().min(1).max(200), location: GeoPoint, placeId: z.string().max(256).optional() }).nullable() }));
      // (A place from a backup source keeps its "osm_…" id; it's only stored, never sent to Google.)
      const ref = itemRef(tripId, body.itemId);
      const snap = await ref.get();
      const item = snap.exists ? ScheduleItem.parse(snap.data()) : null;
      if (!item?.prayer) throw new HttpError(404, 'That prayer break is no longer on the timeline');
      const data = await loadTripData(tripId);
      if (body.place) {
        const dests = data.trip.destinations;
        const ctx = breakContext(data, item, await dayItems(tripId, item.day));
        if (ctx && dests.length > 1 && cityOf(dests, body.place.location) !== cityOf(dests, ctx.at)) throw new HttpError(400, 'Pick a prayer place in the city you are in then.');
        if (ctx && metersBetween(ctx.at, body.place.location) > 5000) throw new HttpError(400, "That's too far from where you'll be then — pick one closer.");
      }
      await ref.update(
        body.place
          ? { 'prayer.chosen': { ...body.place, by: member.uid, at: Date.now() }, updatedAt: Date.now() }
          : { 'prayer.chosen': FieldValue.delete(), updatedAt: Date.now() },
      );
      await refreshDay(tripId, item.day, data);
      return json({ ok: true });
    },
    { perMinute: 20 },
  ),

  /** Re-place a day's prayer breaks and travel legs (e.g. saved before prayer times were locked). */
  'POST schedule/refresh': withTrip(
    async (req, { tripId }) => {
      const { day } = await readJson(req, z.object({ day: LocalDate }));
      await refreshDay(tripId, day);
      return json({ ok: true });
    },
    { perMinute: 40 },
  ),

  /**
   * Bad weather on a day: one or two AI sentences with a plan B, using only
   * the day's stops and the group's backlog (indoor places near the ones at risk).
   */
  'POST schedule/weather-plan': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ day: LocalDate, risks: z.array(z.object({ itemId: Id, text: z.string().max(300) })).min(1).max(10) }));
      await useDailyQuota(member.uid, 'arrange');
      const data = await loadTripData(tripId);
      const items = (await dayItems(tripId, body.day)).filter((i) => i.ref.kind === 'idea').sort((a, b) => a.start.localeCompare(b.start));
      const name = (i: ScheduleItem) => (i.ref.kind === 'idea' ? (data.ideas.get(i.ref.ideaId)?.place.name ?? 'a stop') : 'a stop');
      const atRisk = body.risks.flatMap((r) => {
        const it = items.find((i) => i.id === r.itemId);
        return it ? [{ stop: name(it), time: it.start, weather: r.text, loc: it.ref.kind === 'idea' ? data.ideas.get(it.ref.ideaId)?.place.location : undefined }] : [];
      });
      if (!atRisk.length) throw new HttpError(409, 'Those stops are no longer on this day');
      const indoor = [...data.ideas.values()]
        .filter((i) => (i.status === 'backlog' || i.status === 'backup') && !isOutdoor(i.place) && atRisk.some((r) => r.loc && metersBetween(r.loc, i.place.location) < 4000))
        .slice(0, 8)
        .map((i) => ({ name: i.place.name, kind: i.place.typeLabel ?? i.place.category, minutes: i.estDurationMin }));
      const out = await extractJson({
        system:
          'You help a travel group adapt one day of their plan to bad weather. In at most 2 short sentences (max 45 words), suggest a practical plan B: swap an outdoor stop for one of the indoor options given, or move it to a drier time of the same day. Use only the places given; never invent places.',
        parts: [{ text: JSON.stringify({ day: body.day, plan: items.map((i) => `${i.start} ${name(i)}`), weatherProblems: atRisk.map(({ loc: _l, ...r }) => r), indoorOptionsNearby: indoor }) }],
        responseSchema: { type: Type.OBJECT, properties: { plan: { type: Type.STRING } }, required: ['plan'] },
        validate: z.object({ plan: z.string().min(5) }),
        budgetMs: 15_000,
      });
      return json({ text: out.plan.slice(0, 400) });
    },
    { perMinute: 6 },
  ),

  /**
   * "No lunch planned": halal places to eat around where the group is at that
   * meal time — the group's own food ideas in the backlog first, then the
   * best-rated halal-listed / community-verified restaurants nearby.
   */
  'POST schedule/meal-options': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ day: LocalDate, meal: z.enum(['lunch', 'dinner']), near: GeoPoint }));
      await useDailyQuota(member.uid, 'food');
      const data = await loadTripData(tripId);
      const [a, b] = MEAL_WINDOW[body.meal];
      const openThen = (hours?: string[]) => {
        const r = openingRanges(hours, body.day);
        return r === null || r.some(([o, c]) => o < b && c > a + 45);
      };
      const ideas = [...data.ideas.values()]
        .filter((i) => i.status === 'backlog' && i.place.category === 'food' && !isAltOfSplit(data, i) && metersBetween(i.place.location, body.near) < 3000 && openThen(i.place.openingHours))
        .sort((x, y) => metersBetween(x.place.location, body.near) - metersBetween(y.place.location, body.near))
        .slice(0, 4)
        .map((i) => ({ ideaId: i.id, name: i.place.name, walkMin: estimateTravelMin(body.near, i.place.location), typeLabel: i.place.typeLabel ?? 'Restaurant' }));
      const places = await mealPlaces(body.near, 6).catch(() => []);
      return json({ ideas, places: places.filter((p) => !ideas.some((i) => data.ideas.get(i.ideaId)?.place.placeId === p.placeId)) });
    },
    { perMinute: 20 },
  ),

  /** Add a lunch / dinner stop at a restaurant (not an idea) in the meal window, fitting around the day. */
  'POST schedule/add-meal': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(
        req,
        z.object({
          day: LocalDate,
          meal: z.enum(['lunch', 'dinner']),
          place: z.object({ name: z.string().min(1).max(200), location: GeoPoint, placeId: z.string().max(300).optional() }),
          phone: z.string().max(40).optional(),
        }),
      );
      await useDailyQuota(member.uid, 'arrange');
      const data = await loadTripData(tripId);
      assertTripDay(data.trip, body.day);
      const all = (await dayItems(tripId, body.day)).filter((i) => i.id !== mealItemId(body.day, body.meal));
      const { rows, travel, zones } = dayChain(data, all);
      const [a, b] = MEAL_WINDOW[body.meal];
      // First time in the meal window that fits (same placement as the Timeline), else the window's start.
      let start = a;
      let length = 60;
      for (const d of [60, 45]) {
        const fit = firstFit(body.day, rows, { id: '__meal', duration: d, loc: body.place.location }, travel, zones, a, b + 30);
        if (fit) {
          start = fit.start;
          length = d;
          break;
        }
      }
      const batch = adminDb().batch();
      batch.set(itemRef(tripId, mealItemId(body.day, body.meal)), mealItem({ day: body.day, meal: body.meal, start: toClock(start), end: toClock(start + length), place: body.place, phone: body.phone, members: data.trip.memberIds, actor: member.uid }));
      logActivity(batch, tripId, member.uid, `${member.displayName} added ${body.meal} at ${body.place.name} on ${body.day}`);
      await batch.commit();
      await refreshDay(tripId, body.day, data);
      return json({ ok: true }, { status: 201 });
    },
    { perMinute: 20 },
  ),

  /**
   * Bad weather: swap an outdoor stop for an indoor idea (backlog — or a
   * backup, for the admin) at the same time. The outdoor one goes back to
   * the backlog for another day.
   */
  'POST schedule/swap': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ id: Id, ideaId: Id }));
      await useDailyQuota(member.uid, 'arrange');
      const [data, item] = await Promise.all([loadTripData(tripId), loadMovable(tripId, body.id)]);
      const idea = data.ideas.get(body.ideaId);
      if (!idea) throw new HttpError(404, 'Idea not found');
      if (idea.status === 'backup' && member.role !== 'admin') throw new HttpError(403, 'Only the admin can bring a backup idea onto the plan');
      if (idea.status !== 'backlog' && idea.status !== 'backup') throw new HttpError(409, `${idea.place.name} isn't in the backlog`);
      await swapInto(tripId, member, data, item, idea);
      return json({ ok: true });
    },
    { perMinute: 20 },
  ),

  /**
   * Bad weather and nothing indoor in the backlog: indoor places near an
   * outdoor stop (museums, malls, aquariums…) in the same city.
   */
  'POST schedule/indoor-options': withTrip(
    async (req, { tripId, member }) => {
      const { id } = await readJson(req, z.object({ id: Id }));
      await useDailyQuota(member.uid, 'food');
      const [data, item] = await Promise.all([loadTripData(tripId), loadMovable(tripId, id)]);
      const at = ideaOf(data, item)?.place.location ?? (item.ref.kind === 'custom' ? item.ref.place?.location : undefined);
      if (!at) return json({ places: [] });
      const cell = `${at.lat.toFixed(3)}_${at.lng.toFixed(3)}`;
      const cacheRef = adminDb().doc(`indoorNearby/${cell}`);
      const cached = (await cacheRef.get()).data();
      let found = cached && Date.now() - Number(cached.at) < 7 * 86_400_000 ? (cached.places as { placeId: string; name: string; location: GeoPoint; types: string[]; source?: string }[]) : null;
      if (!found) {
        found = (await searchNearby(at, INDOOR_TYPES, 3000, 8).catch(() => null)) ?? [];
        await cacheRef.set({ at: Date.now(), places: found }).catch(() => {});
      }
      const dests = data.trip.destinations;
      const known = new Set([...data.ideas.values()].filter((i) => i.status === 'scheduled').map((i) => i.place.placeId));
      const places = found
        .filter((p) => !known.has(p.placeId) && (dests.length < 2 || cityOf(dests, p.location) === cityOf(dests, at)))
        .map((p) => ({ placeId: p.placeId, name: p.name, location: p.location, typeLabel: INDOOR_LABEL[p.types.find((t) => t in INDOOR_LABEL) ?? ''] ?? 'Indoor', minutes: estimateTravelMin(at, p.location), ...(p.source && p.source !== 'google' ? { source: p.source } : {}) }))
        .sort((a, b) => a.minutes - b.minutes)
        .slice(0, 6);
      return json({ places });
    },
    { perMinute: 10 },
  ),

  /** Swap an outdoor stop for an indoor place found nearby: it joins the ideas (no vote — picked for the weather) and takes the stop's time. */
  'POST schedule/swap-place': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ id: Id, placeId: z.string().min(3).max(300), name: z.string().min(1).max(200), location: GeoPoint, typeLabel: z.string().max(80).optional() }));
      await useDailyQuota(member.uid, 'arrange');
      const [data, item] = await Promise.all([loadTripData(tripId), loadMovable(tripId, body.id)]);
      const placeKey = paths.placeKey({ placeId: body.placeId, location: body.location });
      let idea = [...data.ideas.values()].find((i) => i.placeKey === placeKey);
      if (idea?.status === 'scheduled') throw new HttpError(409, `${idea.place.name} is already on the timeline`);
      if (!idea) {
        const place = await ideaPlaceFrom({ placeId: body.placeId, name: body.name, location: body.location, types: ['museum'], ...(body.typeLabel ? { typeLabel: body.typeLabel } : {}) });
        const ref = adminDb().collection(paths.ideas(tripId)).doc();
        const now = Date.now();
        idea = Idea.parse({ id: ref.id, placeKey, place, source: { type: 'ai' }, estDurationMin: DEFAULT_DURATION[place.category], status: 'backlog', votes: {}, choices: {}, decidedBy: member.uid, createdBy: member.uid, createdAt: now, updatedAt: now });
        await ref.set(idea);
        data.ideas.set(idea.id, idea);
      } else if (idea.status !== 'backlog') {
        await ideaDocRef(tripId, idea.id).update({ status: 'backlog', updatedAt: Date.now() });
        idea = { ...idea, status: 'backlog' };
      }
      await swapInto(tripId, member, data, item, idea);
      return json({ ok: true, ideaId: idea.id });
    },
    { perMinute: 10 },
  ),

  /**
   * "There's a prayer room here": a traveller at a venue (theme park, mall,
   * station, park…) says where to pray inside it. Shared with every trip that
   * visits the same place; this trip's prayer breaks there use it at once.
   */
  'POST prayer/spot': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ ideaId: Id, note: z.string().trim().max(120).optional(), day: LocalDate.optional() }));
      const data = await loadTripData(tripId);
      const idea = data.ideas.get(body.ideaId);
      if (!idea) throw new HttpError(404, 'Place not found');
      const ref = adminDb().doc(paths.prayerSpot(idea.placeKey));
      await adminDb().runTransaction(async (tx) => {
        const cur = (await tx.get(ref)).data() ?? {};
        const by = { ...(cur.by ?? {}), [member.uid]: Date.now() };
        tx.set(ref, { name: idea.place.name, count: Object.keys(by).length, by, ...(body.note ? { note: body.note } : cur.note ? { note: cur.note } : {}), updatedAt: Date.now() });
      });
      // Remembered for every trip as a real prayer place (found even when Google and OpenStreetMap are out).
      await rememberPlaces(['mosque'], [{ placeId: `mem_${idea.placeKey}`, name: `${idea.place.name} — prayer room`, location: idea.place.location, types: ['mosque'], source: 'traveller' }], 'traveller');
      if (body.day) await refreshDay(tripId, body.day, data);
      return json({ ok: true });
    },
    { perMinute: 10 },
  ),

  /** Close a preview without applying it. */
  'POST schedule/discard': withTrip(
    async (req, { tripId, member }) => {
      const { jobId } = await readJson(req, z.object({ jobId: Id }));
      const ref = jobRef(tripId, jobId);
      const snap = await ref.get();
      if (snap.exists && snap.data()?.status === 'preview') {
        // The admin, or whoever made the plan, can close it.
        if (member.role !== 'admin' && snap.data()?.createdBy !== member.uid) throw new HttpError(403, 'Only the admin or whoever made this plan can close it');
        await ref.update({ status: 'discarded' });
      }
      return json({ ok: true });
    },
    { perMinute: 30 },
  ),
};

/** Routes API legs measured per AI plan (each is cached for 30 days, so re-plans are cheap). */
const MAX_PLAN_LEGS = 60;

/**
 * Times an AI plan with real routes: measures each leg of each day's chosen
 * order (hotel → first stop → … → last stop) with the Routes API and re-times
 * the day with those minutes. A stop that no longer fits comes back as
 * unplaced ('time'); legs over the budget keep the estimate.
 */
async function withRealRoutes(days: ArrangedDay[], frames: DayFrame[], estimate: (a: GeoPoint, b: GeoPoint) => number, destinations: Trip['destinations']) {
  const key = (a: GeoPoint, b: GeoPoint) => `${a.lat.toFixed(5)},${a.lng.toFixed(5)}>${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
  const pairs = new Map<string, [GeoPoint, GeoPoint]>();
  for (const d of days) {
    const f = frames.find((x) => x.day === d.day);
    const pts = [...(f?.baseKnown ? [f.base] : []), ...d.order.filter((u) => !u.floating).map((u) => u.loc)];
    for (let i = 1; i < pts.length; i++) if (pairs.size < MAX_PLAN_LEGS) pairs.set(key(pts[i - 1], pts[i]), [pts[i - 1], pts[i]]);
  }
  const real = new Map<string, number>();
  const list = [...pairs];
  for (let i = 0; i < list.length; i += 6) {
    await Promise.all(
      list.slice(i, i + 6).map(async ([k, [a, b]]) => {
        const leg = await cachedLeg(a, b).catch(() => null);
        if (leg) real.set(k, leg.minutes);
      }),
    );
  }
  const travel = (a: GeoPoint, b: GeoPoint) => real.get(key(a, b)) ?? estimate(a, b);
  const dropped: { id: string; reason: UnfitReason }[] = [];
  const out = days.map((d) => {
    const f = frames.find((x) => x.day === d.day);
    if (!f || !d.order.length) return d;
    const frame = rebaseFrame(f, d.order.find((u) => !u.floating)?.loc, destinations);
    const timing = timeSequence(frame, d.order, { strict: true, travel });
    dropped.push(...timing.unfit.filter((u) => !u.id.startsWith('meal:')));
    const placed = new Set(timing.placed.map((p) => p.id));
    return { day: d.day, order: d.order.filter((u) => placed.has(u.id)), timing: { ...timing, unfit: [] } };
  });
  return { days: out, dropped };
}

/** Indoor place types for a rainy / hot day, and how to name them. */
const INDOOR_LABEL: Record<string, string> = {
  museum: 'Museum',
  art_gallery: 'Gallery',
  aquarium: 'Aquarium',
  shopping_mall: 'Shopping mall',
  movie_theater: 'Cinema',
  bowling_alley: 'Bowling',
  library: 'Library',
};
const INDOOR_TYPES = Object.keys(INDOOR_LABEL);

/** Puts `idea` in place of a stop (split pairs go together), at the stop's time; the old one goes back to the backlog. */
async function swapInto(tripId: string, member: { uid: string; role: string; displayName: string }, data: TripData, item: ScheduleItem, idea: Idea) {
  const group = pairIds(item, await dayItems(tripId, item.day));
  const batch = adminDb().batch();
  for (const g of group) {
    batch.delete(itemRef(tripId, g.id));
    const old = ideaOf(data, g);
    if (old) batch.update(ideaDocRef(tripId, old.id), { status: 'backlog', updatedAt: Date.now() });
  }
  const placed = writeStops(batch, tripId, { data, idea, day: item.day, start: toMin(item.start), orderIndex: item.orderIndex, actor: member.uid });
  placed.forEach((id) => batch.update(ideaDocRef(tripId, id), { status: 'scheduled', updatedAt: Date.now() }));
  const was = ideaOf(data, item)?.place.name ?? 'a stop';
  logActivity(batch, tripId, member.uid, `${member.displayName} swapped ${was} for ${idea.place.name} on ${item.day} (weather)`);
  await batch.commit();
  await refreshDay(tripId, item.day, data);
  await alertAdmin(tripId, item.day, member, data);
}

/**
 * After a member (not the admin) changes a day by hand: if it now has a 🔴
 * problem, tell the admin (at most every 30 min per day).
 */
async function alertAdmin(tripId: string, day: string, actor: { uid: string; role: string; displayName: string }, data: TripData) {
  if (actor.role === 'admin') return;
  const problems = dayProblems(data, day, await dayItems(tripId, day)).filter((w) => w.severity === 'block');
  if (!problems.length) return;
  await notify(
    [data.trip.adminId],
    {
      kind: 'timeline',
      title: `🔴 ${day}: ${problems.length} thing${problems.length > 1 ? 's' : ''} won't work`,
      body: `After ${actor.displayName}'s change: ${problems[0].text}`,
      url: `/t/${tripId}/timeline?day=${day}`,
      tag: `red-${tripId}-${day}`,
    },
    { timeZone: data.trip.destinations[0].timezone, throttleKey: `red:${tripId}:${day}`, throttle: 1800 },
  );
}

/** Days with a 🔴 problem get "Fix this day" applied (once). Returns the days changed. */
async function autoFix(tripId: string, days: string[], actor: string): Promise<string[]> {
  const data = await loadTripData(tripId);
  const changed: string[] = [];
  for (const day of new Set(days)) {
    const items = await dayItems(tripId, day);
    if (!dayProblems(data, day, items).some((w) => w.severity === 'block')) continue;
    const plan = planFixDay(data, day, items);
    if (!plan.stops.length && !plan.removed.length) continue;
    const batch = adminDb().batch();
    writeFixPlan(batch, tripId, data, items, plan, actor);
    await batch.commit();
    await refreshDay(tripId, day, data);
    changed.push(day);
  }
  return changed;
}

/** One friendly sentence per day from the AI (skipped quietly if it's busy). */
async function addNotes(plan: ArrangeJob['plan'], data: TripData) {
  if (!plan.days.length) return;
  const facts = plan.days.map((d) => ({
    day: d.day,
    stops: d.stops.map((s) => `${s.start} ${data.ideas.get(s.ideaId)?.place.name ?? ''}`),
    prayerBreaks: d.prayers.map((p) => `${p.start} ${PRAYER_LABEL[p.key]}`),
    travelMin: d.travelMin,
  }));
  try {
    const out = await extractJson({
      system:
        'You summarise a group trip plan. For each day write ONE short, friendly sentence (max 25 words) saying what the day is about and why the order works (e.g. same area, lunch near X, prayer break between). Use only the given facts; never invent places.',
      parts: [{ text: JSON.stringify(facts) }],
      responseSchema: { type: Type.OBJECT, properties: { days: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { day: { type: Type.STRING }, note: { type: Type.STRING } }, required: ['day', 'note'] } } }, required: ['days'] },
      validate: z.object({ days: z.array(z.object({ day: z.string(), note: z.string() })) }),
      budgetMs: 12_000,
    });
    for (const n of out.days) {
      const d = plan.days.find((x) => x.day === n.day);
      if (d) d.note = n.note.slice(0, 300);
    }
  } catch {
    // Notes are a nice-to-have; the plan stands on its own.
  }
}


/** Timeline id of a day's lunch / dinner stop (one each). */
export const mealItemId = (day: string, meal: MealKey) => `meal_${day}_${meal}`;

export function mealItem(o: { day: string; meal: MealKey; start: string; end: string; place: { name: string; location: GeoPoint; placeId?: string; address?: string }; phone?: string; members: string[]; actor: string }): ScheduleItem {
  return ScheduleItem.parse({
    id: mealItemId(o.day, o.meal),
    day: o.day,
    start: o.start,
    end: o.end,
    ref: { kind: 'custom', title: `${o.meal === 'lunch' ? 'Lunch' : 'Dinner'} · ${o.place.name}`, place: o.place, meal: o.meal, ...(o.phone ? { phone: o.phone } : {}) },
    track: 'all',
    memberUids: o.members,
    locked: false,
    orderIndex: 50,
    updatedBy: o.actor,
    updatedAt: Date.now(),
  });
}

/**
 * A lunch / dinner stop taken off the timeline becomes a backlog food idea
 * (the same place already on the board is reused). Returns its id.
 */
function mealToBacklog(batch: WriteBatch, tripId: string, data: TripData, item: ScheduleItem, actor: string): string | undefined {
  if (item.ref.kind !== 'custom' || !item.ref.place) return undefined;
  const place = item.ref.place;
  const placeKey = paths.placeKey(place);
  const minutes = Math.max(30, toMin(item.end) - toMin(item.start));
  const existing = place.placeId || place.osmId ? [...data.ideas.values()].find((i) => i.placeKey === placeKey) : undefined;
  if (existing) {
    if (existing.status !== 'scheduled') batch.update(ideaDocRef(tripId, existing.id), { status: 'backlog', updatedAt: Date.now() });
    return existing.id;
  }
  const ref = adminDb().collection(paths.ideas(tripId)).doc();
  const now = Date.now();
  batch.set(
    ref,
    Idea.parse({
      id: ref.id,
      placeKey: place.placeId || place.osmId ? placeKey : `meal_${ref.id}`,
      place: { ...place, category: 'food', typeLabel: 'Halal restaurant', types: ['restaurant'], ...(item.ref.phone ? { phone: item.ref.phone } : {}) },
      source: { type: 'meal' },
      estDurationMin: minutes,
      status: 'backlog',
      votes: {},
      choices: {},
      decidedBy: actor,
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
    }),
  );
  return ref.id;
}

/** Restaurant lookups per AI Arrange (each is 1–2 Places calls, cached a week per spot). */
const MAX_MEAL_LOOKUPS = 16;

/** A halal restaurant near where each meal slot lands (best-rated verified / listed first). */
async function pickRestaurants(plan: ArrangeJob['plan'] & { days: { meals: { near?: GeoPoint }[] }[] }) {
  let n = 0;
  const taken = new Set<string>();
  for (const d of plan.days) {
    for (const m of d.meals as (ArrangeJob['plan']['days'][number]['meals'][number] & { near?: GeoPoint })[]) {
      const near = m.near;
      delete m.near;
      if (!near || n++ >= MAX_MEAL_LOOKUPS) continue;
      const best = (await mealPlaces(near, 6).catch(() => [])).find((p) => !taken.has(p.placeId));
      if (!best) continue;
      taken.add(best.placeId);
      m.place = { placeId: best.placeId, name: best.name, location: best.location };
      if (best.phone) m.phone = best.phone;
      m.halal = `${best.verdict.text}${best.verdict.basis ? ` · ${best.verdict.basis}` : ''}`.slice(0, 120);
    }
  }
}
