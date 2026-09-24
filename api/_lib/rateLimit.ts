import { optionalEnv } from './env.js';
import { HttpError } from './http.js';

/**
 * Fixed-window rate limit backed by Upstash Redis (REST, no SDK needed).
 * If Upstash isn't configured the limit is skipped, so local dev still works.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const url = optionalEnv('UPSTASH_REDIS_REST_URL');
  const token = optionalEnv('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return;

  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify([
      ['INCR', bucket],
      ['EXPIRE', bucket, String(windowSeconds)],
    ]),
  }).catch(() => null);

  // Fail open: a Redis outage shouldn't take the app down.
  if (!res?.ok) return;
  const [incr] = (await res.json()) as [{ result: number }];
  if (incr.result > limit) {
    throw new HttpError(429, `Too many requests — try again in a moment`);
  }
}
