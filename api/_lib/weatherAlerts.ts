// The hourly reminders job checks the forecast for outdoor stops and warns
// the group: the evening before (one message for tomorrow's affected stops)
// and on the day, for stops starting in the next 4 hours — rain, storm, heat,
// strong sun — with the Timeline's plan B one tap away.
import { forecastUrl, isOutdoor, nearestDestination, paths, ScheduleItem, toMin, weatherRisk, type HourlyForecast } from '../../src/domain/index.js';
import { adminDb } from './firebaseAdmin.js';
import { notify } from './push.js';
import type { TripData } from './schedule.js';

const LOOKAHEAD_MIN = 4 * 60;
/** The evening-before message goes out between these local times. */
const EVENING = [18 * 60, 21 * 60];
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

async function hourlyAt(at: { lat: number; lng: number }, day: string): Promise<HourlyForecast | undefined> {
  const res = await fetch(forecastUrl(at, day), { signal: AbortSignal.timeout(8000) }).catch(() => null);
  return res?.ok ? ((await res.json()) as { hourly?: HourlyForecast }).hourly : undefined;
}

/** The evening before: one message listing tomorrow's outdoor stops the weather may spoil. */
async function eveningBefore(tripId: string, data: TripData, now: number): Promise<number> {
  const { trip } = data;
  const tz = trip.destinations[0].timezone;
  const here = localNow(tz, now);
  const day = nextDay(here.day);
  if (here.min < EVENING[0] || here.min >= EVENING[1] || day < trip.startDate || day > trip.endDate) return 0;
  const snap = await adminDb().collection(paths.schedule(tripId)).where('day', '==', day).get();
  const hit: string[] = [];
  const cache = new Map<string, HourlyForecast | undefined>();
  for (const d of snap.docs) {
    const r = ScheduleItem.safeParse(d.data());
    if (!r.success || r.data.ref.kind !== 'idea') continue;
    const idea = data.ideas.get(r.data.ref.ideaId);
    if (!idea || !isOutdoor(idea.place)) continue;
    const key = `${idea.place.location.lat.toFixed(1)},${idea.place.location.lng.toFixed(1)}`;
    if (!cache.has(key)) cache.set(key, await hourlyAt(idea.place.location, day));
    const hourly = cache.get(key);
    const risk = hourly && weatherRisk(hourly, day, toMin(r.data.start), toMin(r.data.end));
    if (risk) hit.push(`${idea.place.name} (${risk.kind === 'rain' ? 'rain' : risk.kind === 'storm' ? 'storm' : risk.kind === 'heat' ? 'heat' : 'strong sun'})`);
  }
  if (!hit.length) return 0;
  return notify(
    trip.memberIds,
    { kind: 'timeline', title: `🌦 Tomorrow: weather may spoil ${hit.length} stop${hit.length > 1 ? 's' : ''}`, body: `${hit.slice(0, 3).join(', ')}${hit.length > 3 ? '…' : ''}. Open the timeline for a plan B.`, url: `/t/${tripId}/timeline?day=${day}`, tag: `wx-eve-${tripId}-${day}` },
    { timeZone: tz, throttleKey: `wxeve:${tripId}:${day}`, throttle: 86_400 },
  );
}

const localNow = (timeZone: string, now: number) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return { day: `${v('year')}-${v('month')}-${v('day')}`, min: Number(v('hour')) * 60 + Number(v('minute')) };
};

/** Returns how many weather alerts were sent. */
export async function checkWeather(tripId: string, data: TripData, now = Date.now()): Promise<number> {
  const { trip } = data;
  const zones = [...new Set(trip.destinations.map((d) => d.timezone))];
  let sent = await eveningBefore(tripId, data, now).catch(() => 0);
  const days = [...new Set(zones.map((z) => localNow(z, now).day))].filter((d) => d >= trip.startDate && d <= trip.endDate);
  if (!days.length) return sent;
  for (const day of days) {
    const snap = await adminDb().collection(paths.schedule(tripId)).where('day', '==', day).get();
    const stops = snap.docs.flatMap((d) => {
      const r = ScheduleItem.safeParse(d.data());
      if (!r.success || r.data.ref.kind !== 'idea') return [];
      const idea = data.ideas.get(r.data.ref.ideaId);
      return idea && isOutdoor(idea.place) ? [{ item: r.data, idea }] : [];
    });
    for (const { item, idea } of stops) {
      const tz = nearestDestination(trip.destinations, idea.place.location).timezone;
      const here = localNow(tz, now);
      const start = toMin(item.start);
      if (here.day !== day || start < here.min || start - here.min > LOOKAHEAD_MIN) continue;
      const hourly = await hourlyAt(idea.place.location, day);
      if (!hourly) continue;
      const risk = weatherRisk(hourly, day, start, toMin(item.end));
      if (!risk) continue;
      sent += await notify(
        item.memberUids.length ? item.memberUids : trip.memberIds,
        { kind: 'timeline', title: `🌦 ${idea.place.name} at ${item.start}`, body: `${risk.text} Open the timeline for a plan B.`, url: `/t/${tripId}/timeline?day=${day}`, tag: `wx-${item.id}` },
        { timeZone: tz, throttleKey: `wx:${item.id}:${day}`, throttle: 86_400 },
      );
    }
  }
  return sent;
}
