// Web Push to members' phones and browsers (VAPID keys we generate — no
// Firebase Cloud Messaging needed). Each person picks which kinds they get;
// non-urgent ones wait out quiet hours (trip timezone); bundled kinds are
// throttled so a burst of new ideas is one alert. Never throws — a failed
// notification must not fail the action that caused it.
import webpush from 'web-push';
import { NotifyPrefs, PushSub, shouldSend, type NotifyKind } from '../../src/domain/index.js';
import { optionalEnv } from './env.js';
import { adminDb } from './firebaseAdmin.js';

export const subsPath = (uid: string) => `users/${uid}/pushSubs`;
export const prefsPath = (uid: string) => `users/${uid}/private/notify`;
/** In-app alerts (the 🔔 in the header) — kept for every notification, even with push off. */
export const inboxPath = (uid: string) => `users/${uid}/inbox`;
export const inboxStatePath = (uid: string) => `users/${uid}/private/inbox`;

/** Saves the alert to each person's in-app inbox (laptops, or push turned off). */
async function toInbox(uids: string[], note: Note) {
  const db = adminDb();
  const batch = db.batch();
  const at = Date.now();
  for (const uid of uids) batch.set(db.collection(inboxPath(uid)).doc(), { title: note.title, body: note.body, url: note.url, kind: note.kind, at });
  if (uids.length) await batch.commit().catch((e) => console.warn('[inbox] write failed', e));
}

let configured: boolean | undefined;
function ready(): boolean {
  if (configured !== undefined) return configured;
  const pub = optionalEnv('VAPID_PUBLIC_KEY');
  const priv = optionalEnv('VAPID_PRIVATE_KEY');
  // The subject tells push services who to contact; it must be https (local dev runs on http).
  const app = optionalEnv('APP_URL');
  const subject = app?.startsWith('https://') ? app : 'https://safar-app-cristal-teohs-projects.vercel.app';
  try {
    if (pub && priv) webpush.setVapidDetails(subject, pub, priv);
    configured = !!(pub && priv);
  } catch (err) {
    console.error('[push] bad VAPID config', err);
    configured = false;
  }
  return configured;
}

export async function loadPrefs(uid: string): Promise<NotifyPrefs> {
  const snap = await adminDb().doc(prefsPath(uid)).get();
  return NotifyPrefs.parse(snap.data()?.prefs ?? {});
}

/** True the first time in `seconds` for this key (Upstash SET NX EX); always true without Redis. */
async function firstInWindow(key: string, seconds: number): Promise<boolean> {
  const url = optionalEnv('UPSTASH_REDIS_REST_URL');
  const token = optionalEnv('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return true;
  const res = await fetch(`${url.replace(/\/$/, '')}/set/${encodeURIComponent(`notify:${key}`)}/1/NX/EX/${seconds}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(1500),
  }).catch(() => null);
  if (!res?.ok) return true;
  return ((await res.json()) as { result: string | null }).result === 'OK';
}

export interface Note {
  kind: NotifyKind;
  title: string;
  body: string;
  /** Where tapping it goes, e.g. /t/abc/ideas?filter=mixed */
  url: string;
  /** Replaces an earlier notification with the same tag on the device. */
  tag?: string;
}

/**
 * Sends `note` to each uid's devices (except `except`). `throttle` = seconds
 * during which the same (uid, throttleKey) isn't notified again.
 */
export async function notify(
  uids: string[],
  note: Note,
  opts: { timeZone: string; except?: string; throttleKey?: string; throttle?: number; /** Ignore choices, quiet hours and throttling (test alerts). */ force?: boolean },
): Promise<number> {
  const targets = [...new Set(uids)].filter((u) => u !== opts.except);
  if (!opts.force) await toInbox(targets, note);
  if (!ready() || !targets.length) return 0;
  const db = adminDb();
  let sent = 0;
  await Promise.allSettled(
    targets
      .map(async (uid) => {
        if (!opts.force) {
          const prefs = await loadPrefs(uid);
          if (!shouldSend(note.kind, prefs, opts.timeZone)) return;
          if (opts.throttleKey && !(await firstInWindow(`${uid}:${opts.throttleKey}`, opts.throttle ?? 600))) return;
        }
        const subs = await db.collection(subsPath(uid)).get();
        await Promise.allSettled(
          subs.docs.map(async (d) => {
            const sub = PushSub.safeParse(d.data());
            if (!sub.success) return;
            try {
              await webpush.sendNotification(sub.data, JSON.stringify({ title: note.title, body: note.body, url: note.url, tag: note.tag ?? note.kind }), {
                TTL: 12 * 3600,
                urgency: note.kind === 'decide' || note.kind === 'choose' || note.kind === 'vote' ? 'high' : 'normal',
                timeout: 5000,
              });
              sent++;
            } catch (err) {
              const status = (err as { statusCode?: number }).statusCode;
              // Gone / not found: the browser unsubscribed or the app was removed.
              if (status === 404 || status === 410) await d.ref.delete().catch(() => {});
              else console.warn('[push] send failed', status ?? err);
            }
          }),
        );
      }),
  );
  return sent;
}
