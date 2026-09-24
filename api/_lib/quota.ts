// Per-person daily allowances for the expensive (AI / paid-API) actions, so
// one person can't use up the group's shared free quotas. Counted in Upstash;
// skipped (allowed) if Redis isn't configured. Resets at midnight UTC.
import { optionalEnv } from './env.js';
import { HttpError } from './http.js';

export const DAILY_LIMITS = {
  import: { limit: 25, label: 'post imports' },
  analyze: { limit: 80, label: 'halal & review checks' },
  bookingParse: { limit: 20, label: 'ticket readings' },
  addIdea: { limit: 150, label: 'ideas added' },
} as const;
export type QuotaKind = keyof typeof DAILY_LIMITS;

export async function useDailyQuota(uid: string, kind: QuotaKind): Promise<void> {
  const url = optionalEnv('UPSTASH_REDIS_REST_URL');
  const token = optionalEnv('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return;
  const key = `quota:${kind}:${uid}:${new Date().toISOString().slice(0, 10)}`;
  const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, String(2 * 86400)],
    ]),
    signal: AbortSignal.timeout(1500),
  }).catch(() => null);
  if (!res?.ok) return; // fail open — never block people because Redis hiccupped
  const used = Number(((await res.json()) as { result: number }[])[0]?.result ?? 0);
  const { limit, label } = DAILY_LIMITS[kind];
  if (used > limit) {
    throw new HttpError(429, `You've reached today's limit of ${limit} ${label}. It resets at 8:00 AM Malaysia time (midnight UTC).`);
  }
}
