// Firestore reads today (the free tier is 50K/day, reset at midnight Pacific),
// from Google Cloud Monitoring — asking costs no Firestore reads. Needs the
// service account to have the "Monitoring Viewer" role; without it the count
// is unknown and nothing is slowed down. Near the free limit, jobs that can
// safely wait until tomorrow skip their run; nothing people do is ever blocked.
import { adminApp, adminProjectId } from './firebaseAdmin.js';

export const FREE_READS_PER_DAY = 50_000;
/** From this share of the free reads on, jobs that can wait are skipped. */
const SAVE_FROM = 0.8;
const CHECK_EVERY_MS = 10 * 60_000;

let cached: { at: number; used: number | null } | undefined;

/** When today's free-tier day began (midnight in California). */
function pacificMidnight(now: Date): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  );
  return new Date(now.getTime() - ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000 - now.getMilliseconds());
}

async function fetchReadsToday(): Promise<number | null> {
  const token = await adminApp().options.credential?.getAccessToken();
  if (!token) return null;
  const now = new Date();
  const q = new URLSearchParams({
    filter: 'metric.type="firestore.googleapis.com/document/read_count"',
    'interval.startTime': pacificMidnight(now).toISOString(),
    'interval.endTime': now.toISOString(),
    'aggregation.alignmentPeriod': '3600s',
    'aggregation.perSeriesAligner': 'ALIGN_SUM',
    'aggregation.crossSeriesReducer': 'REDUCE_SUM',
  });
  const res = await fetch(`https://monitoring.googleapis.com/v3/projects/${adminProjectId()}/timeSeries?${q}`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    console.warn('[firestoreReads] monitoring', res.status, (await res.text()).slice(0, 200));
    return null;
  }
  const body = (await res.json()) as { timeSeries?: { points?: { value: { int64Value?: string } }[] }[] };
  return (body.timeSeries ?? []).flatMap((t) => t.points ?? []).reduce((n, p) => n + Number(p.value.int64Value ?? 0), 0);
}

/** Reads so far today, or null when Monitoring can't be asked. Checked at most every 10 minutes. */
export async function firestoreReadsToday(): Promise<number | null> {
  if (cached && Date.now() - cached.at < CHECK_EVERY_MS) return cached.used;
  const used = await fetchReadsToday().catch((e) => (console.warn('[firestoreReads]', e), null));
  cached = { at: Date.now(), used };
  return used;
}

/** True near the free limit: jobs that can wait until tomorrow should skip. Unknown count → false. */
export async function saveReads(): Promise<boolean> {
  const used = await firestoreReadsToday();
  return used !== null && used >= FREE_READS_PER_DAY * SAVE_FROM;
}
