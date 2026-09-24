// Remembers which AI models are currently unusable (quota exhausted or
// overloaded) so requests skip them instead of waiting for them to fail.
// Shared across all function instances via Upstash Redis; falls back to
// per-instance memory when Redis isn't configured.
import { optionalEnv } from './env.js';

const local = new Map<string, number>(); // model → skip until (ms)

async function redis(commands: (string | number)[][]): Promise<{ result: unknown }[] | null> {
  const url = optionalEnv('UPSTASH_REDIS_REST_URL');
  const token = optionalEnv('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return null;
  const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(1500),
  }).catch(() => null);
  return res?.ok ? ((await res.json()) as { result: unknown }[]) : null;
}

const key = (model: string) => `ai:down:${model}`;

/** Models from `candidates` that are currently marked down. */
export async function downModels(candidates: string[]): Promise<Set<string>> {
  const now = Date.now();
  const down = new Set(candidates.filter((m) => (local.get(m) ?? 0) > now));
  const r = await redis([['MGET', ...candidates.map(key)]]);
  const values = (r?.[0]?.result as (string | null)[] | undefined) ?? [];
  values.forEach((v, i) => v && down.add(candidates[i]));
  return down;
}

/**
 * Mark a model down. Quota exhaustion (429) → skip for the retry delay Google
 * gives (or an hour); overload/timeouts → skip for 2 minutes.
 */
export async function markDown(model: string, status: number, retryAfterSeconds?: number) {
  const seconds = status === 429 ? Math.min(Math.max(retryAfterSeconds ?? 3600, 60), 6 * 3600) : 120;
  local.set(model, Date.now() + seconds * 1000);
  await redis([['SET', key(model), String(status), 'EX', seconds]]);
}

/**
 * How long to skip a model after a 429. A *daily* quota won't come back in
 * the "retry in 46s" Google suggests, so park it for an hour.
 */
export function retryAfterFrom(err: unknown): number | undefined {
  if (/PerDay/i.test(String((err as Error)?.message ?? ''))) return 3600;
  const m = /retry(?:Delay)?[^0-9]{0,20}(\d+(?:\.\d+)?)s/i.exec(String((err as Error)?.message ?? ''));
  return m ? Math.ceil(Number(m[1])) : undefined;
}
