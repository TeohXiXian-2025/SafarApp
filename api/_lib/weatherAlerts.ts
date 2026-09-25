// During the trip, the hourly reminders job checks the forecast for outdoor
// stops starting in the next 4 hours and warns the group once per stop
// (rain, storm, heat, strong sun) — with the Timeline's plan B one tap away.
import { forecastUrl, isOutdoor, nearestDestination, paths, ScheduleItem, toMin, weatherRisk, type HourlyForecast } from '../../src/domain/index.js';
import { adminDb } from './firebaseAdmin.js';
import { notify } from './push.js';
import type { TripData } from './schedule.js';

const LOOKAHEAD_MIN = 4 * 60;

const localNow = (timeZone: string, now: number) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return { day: `${v('year')}-${v('month')}-${v('day')}`, min: Number(v('hour')) * 60 + Number(v('minute')) };
};

/** Returns how many weather alerts were sent. */
export async function checkWeather(tripId: string, data: TripData, now = Date.now()): Promise<number> {
  const { trip } = data;
  const zones = [...new Set(trip.destinations.map((d) => d.timezone))];
  const days = [...new Set(zones.map((z) => localNow(z, now).day))].filter((d) => d >= trip.startDate && d <= trip.endDate);
  if (!days.length) return 0;
  let sent = 0;
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
      const res = await fetch(forecastUrl(idea.place.location, day), { signal: AbortSignal.timeout(8000) }).catch(() => null);
      const hourly = res?.ok ? ((await res.json()) as { hourly?: HourlyForecast }).hourly : undefined;
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
