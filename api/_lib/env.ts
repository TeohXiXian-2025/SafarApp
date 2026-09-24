// Server-only environment access. Files under api/_lib are not deployed as
// functions (Vercel skips "_"-prefixed paths); they're bundled into the routes.

const SERVER_KEYS = [
  'FIREBASE_SERVICE_ACCOUNT',
  'GOOGLE_MAPS_SERVER_KEY',
  'GEMINI_API_KEY',
  'LITEAPI_KEY',
  'SERPAPI_KEY',
  'FOURSQUARE_API_KEY',
  'FLIGHT_STATUS_API_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'APP_URL',
] as const;

export type ServerKey = (typeof SERVER_KEYS)[number];

/** Returns the value or throws — use for keys a route cannot work without. */
export function requireEnv(key: ServerKey): string {
  const v = process.env[key];
  if (!v) throw new Error(`Server misconfigured: ${key} is not set`);
  return v;
}

export function optionalEnv(key: ServerKey): string | undefined {
  return process.env[key] || undefined;
}

/** Which integrations are configured (booleans only — never values). */
export function configuredServices(): Record<ServerKey, boolean> {
  return Object.fromEntries(SERVER_KEYS.map((k) => [k, Boolean(process.env[k])])) as Record<ServerKey, boolean>;
}
