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
  isOutdoor,
  metersBetween,
  timeSequence,
  toClock,
  toMin,
  tripDays,
  type GeoPoint,
  type Idea,
  type Trip,
  type Unit,
} from '../../src/domain/index.js';
import { withTrip } from '../_lib/auth.js';
import { adminDb } from '../_lib/firebaseAdmin.js';
import { extractJson } from '../_lib/gemini.js';
import { HttpError, json, readJson } from '../_lib/http.js';
import { useDailyQuota } from '../_lib/quota.js';
import type { RouteTable } from '../_lib/routes.js';
import {
  approvedSplit,
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
  type TripData,
} from '../_lib/schedule.js';
import { notify } from '../_lib/push.js';
import { logActivity } from '../_lib/trip.js';

const jobRef = (tripId: string, id: string) => adminDb().doc(paths.job(tripId, id));

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

/** Refresh several days one after another (they share Routes API budgets). */
async function refreshDays(tripId: string, days: Iterable<string>, data: TripData) {
  for (const d of new Set(days)) await refreshDay(tripId, d, data);
}

export const scheduleRoutes: RouteTable = {
  /** Put a backlog idea (or split pair) on a day — at `start`, or after the day's last stop. */
  'POST schedule/add': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ ideaId: Id, day: LocalDate, start: LocalTime.optional() }));
      await useDailyQuota(member.uid, 'arrange');
      const data = await loadTripData(tripId);
      assertTripDay(data.trip, body.day);
      const idea = data.ideas.get(body.ideaId);
      if (!idea) throw new HttpError(404, 'Idea not found');
      if (idea.status === 'scheduled') throw new HttpError(409, `${idea.place.name} is already on the timeline`);
      if (idea.status !== 'backlog') throw new HttpError(409, 'Only ideas in the backlog can go on the timeline');

      const split = approvedSplit(data, idea);
      const lead = leadIdea(data, idea);
      const day = (await dayItems(tripId, body.day)).filter((i) => !isPrayerItem(i));
      const duration = unitFor(lead, split).duration;
      const start = body.start ? toMin(body.start) : toMin(nextSlot(withPrayerTimes(data, body.day, day, lead.place.location), duration).start);

      const batch = adminDb().batch();
      const placed = writeStops(batch, tripId, { data, idea: lead, day: body.day, start, orderIndex: day.length, actor: member.uid });
      placed.forEach((id) => batch.update(ideaDocRef(tripId, id), { status: 'scheduled', updatedAt: Date.now() }));
      logActivity(batch, tripId, member.uid, `${member.displayName} added ${split ? `the split at ${lead.place.name}` : idea.place.name} to ${body.day}`);
      await batch.commit();
      await refreshDay(tripId, body.day, data);
      await alertAdmin(tripId, body.day, member, data);
      return json({ id: ideaItemId(lead.id) }, { status: 201 });
    },
    { perMinute: 30 },
  ),

  /** Move a stop (split pairs move together) to another day and/or time, or change how long it takes. */
  'POST schedule/update': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(
        req,
        z.object({ id: Id, day: LocalDate.optional(), start: LocalTime.optional(), durationMin: z.number().int().min(5).max(24 * 60).optional() }),
      );
      await useDailyQuota(member.uid, 'arrange');
      const [data, item] = await Promise.all([loadTripData(tripId), loadMovable(tripId, body.id)]);
      const day = body.day ?? item.day;
      assertTripDay(data.trip, day);
      const moved = day !== item.day;
      const current = await dayItems(tripId, item.day);
      const group = pairIds(item, current);
      const lead = group.find((i) => !isTrackB(i)) ?? item;
      const leadIdea = ideaOf(data, lead);
      if (!leadIdea) throw new HttpError(404, 'Idea not found');
      const split = approvedSplit(data, leadIdea);

      const duration = split ? split.reunion.afterMinutes : (body.durationMin ?? toMin(item.end) - toMin(item.start));
      // Editing a side group's time moves the whole split: keep its offset from the main group.
      let start = body.start ? toMin(body.start) - (toMin(item.start) - toMin(lead.start)) : toMin(lead.start);
      let orderIndex = lead.orderIndex;
      if (moved) {
        const target = (await dayItems(tripId, day)).filter((i) => !isPrayerItem(i));
        orderIndex = target.length;
        if (!body.start) start = toMin(nextSlot(withPrayerTimes(data, day, target, leadIdea.place.location), duration).start);
      }
      const batch = adminDb().batch();
      group.forEach((g) => batch.delete(itemRef(tripId, g.id)));
      writeStops(batch, tripId, { data, idea: leadIdea, day, start, durationMin: split ? undefined : duration, orderIndex, actor: member.uid });
      await batch.commit();
      await refreshDays(tripId, moved ? [day, item.day] : [day], data);
      await alertAdmin(tripId, day, member, data);
      return json({ ok: true });
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
   * AI Arrange (admin): plans every backlog + scheduled idea across the trip
   * around the bookings, opening hours, meal times, pace and prayer times.
   * Nothing changes until the admin applies the preview.
   */
  'POST schedule/arrange': withTrip(
    async (_req, { tripId, user }) => {
      await useDailyQuota(user.uid, 'arrange');
      const data = await loadTripData(tripId);
      const days = tripDays(data.trip.startDate, data.trip.endDate);
      const frames = framesFor(data, days);
      const ideas = [...data.ideas.values()].filter((i) => (i.status === 'backlog' || i.status === 'scheduled') && !isAltOfSplit(data, i));
      if (!ideas.length) throw new HttpError(409, 'Nothing to arrange yet — approve some ideas on the Idea Board first');
      const units = ideas.map((i) => unitFor(i, approvedSplit(data, i)));
      const pace = mergePrefs(data.members).pace ?? 'moderate';
      // Straight-line estimates run short of real routes (checked after Apply) — plan with a margin.
      const travel = (a: GeoPoint, b: GeoPoint) => Math.round(estimateTravelMin(a, b) * 1.25);
      const result = arrangeTrip(frames, units, { maxStops: PACE[pace].maxStops, travel, destinations: data.trip.destinations });

      const plan: ArrangeJob['plan'] = {
        days: result.days
          .filter((d) => d.timing.placed.length)
          .map((d) => ({
            day: d.day,
            travelMin: Math.round(d.timing.travelMin),
            stops: d.timing.placed.map((p) => ({ ideaId: p.id, start: toClock(p.start), end: toClock(p.end) })),
            prayers: d.timing.prayers.map((p) => ({ key: p.key, start: toClock(p.start), end: toClock(p.end) })),
          })),
        unplaced: result.unplaced.map((u) => ({ ideaId: u.id, reason: u.reason })),
      };
      await addNotes(plan, data);

      const ref = adminDb().collection(paths.jobs(tripId)).doc();
      const job = ArrangeJob.parse({ id: ref.id, kind: 'arrange', status: 'preview', plan, createdBy: user.uid, at: Date.now() });
      await ref.set(job);
      return json(job);
    },
    { admin: true, perMinute: 6 },
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
      const before = current.filter((i) => !i.locked);

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
      }
      const wasScheduled = new Set(before.flatMap((i) => (i.ref.kind === 'idea' ? [i.ref.ideaId] : [])));
      for (const id of new Set([...scheduled, ...wasScheduled])) {
        if (data.ideas.has(id)) batch.update(ideaDocRef(tripId, id), { status: scheduled.has(id) ? 'scheduled' : 'backlog', updatedAt: Date.now() });
      }
      batch.update(snap.ref, { status: 'applied', before, appliedAt: Date.now() });
      logActivity(batch, tripId, member.uid, `${member.displayName} applied AI Arrange (${scheduled.size} stops over ${job.plan.days.length} days)`);
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
      const current = (await adminDb().collection(paths.schedule(tripId)).get()).docs.map((d) => ScheduleItem.parse(d.data())).filter((i) => !i.locked);

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

  /** Re-place a day's prayer breaks and travel legs (e.g. saved before prayer times were locked). */
  'POST schedule/refresh': withTrip(
    async (req, { tripId }) => {
      const { day } = await readJson(req, z.object({ day: LocalDate }));
      await refreshDay(tripId, day);
      return json({ ok: true });
    },
    { perMinute: 10 },
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

  /** Close a preview without applying it. */
  'POST schedule/discard': withTrip(
    async (req, { tripId }) => {
      const { jobId } = await readJson(req, z.object({ jobId: Id }));
      const ref = jobRef(tripId, jobId);
      const snap = await ref.get();
      if (snap.exists && snap.data()?.status === 'preview') await ref.update({ status: 'discarded' });
      return json({ ok: true });
    },
    { admin: true, perMinute: 30 },
  ),
};

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

