// Work that runs after the reply: re-planning a day (prayer places, travel
// legs, re-timing) can take a while, so a save answers at once and the day
// follows a moment later (the app shows it live from Firestore). On Vercel,
// waitUntil keeps the function alive until it's done; elsewhere (local dev)
// the promise simply runs on. Re-plans of the same day run one at a time, and
// one already waiting absorbs any newer request (it reads the latest data).
import { waitUntil } from '@vercel/functions';
import { loadTripData, refreshDay } from './schedule.js';

const running = new Map<string, Promise<void>>();
const waiting = new Set<string>();

/** Runs `task` after the reply, one at a time per `key`; a second request while one is waiting is dropped. */
export function inBackground(key: string, task: () => Promise<unknown>) {
  if (waiting.has(key)) return;
  waiting.add(key);
  const next = (running.get(key) ?? Promise.resolve())
    .then(async () => {
      waiting.delete(key);
      await task();
    })
    .catch((err) => console.warn('[background]', key, err))
    .finally(() => {
      if (running.get(key) === next) running.delete(key);
    });
  running.set(key, next);
  waitUntil(next);
}

/** Re-plans these days of a trip after the reply (each with fresh data), then runs `after` (e.g. tell the admin about a 🔴). */
export function refreshLater(tripId: string, days: Iterable<string>, after?: (day: string) => Promise<unknown>) {
  for (const day of new Set(days)) {
    inBackground(`${tripId}:${day}`, async () => {
      const data = await loadTripData(tripId);
      if (day < data.trip.startDate || day > data.trip.endDate) return;
      await refreshDay(tripId, day, data);
      if (after) await after(day);
    });
  }
}
