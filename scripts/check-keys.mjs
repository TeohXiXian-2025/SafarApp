// Verifies every key in .env.local against its real service.
// Prints only pass/fail + non-secret details — never key values.
// Usage: npm run check:keys
import { config } from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

config({ path: '.env.local', quiet: true });
const env = process.env;

const KL = { lat: 3.1579, lng: 101.7116 }; // KLCC — any real location works
const results = [];

async function check(name, fn, { optional = false } = {}) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (err) {
    results.push({ name, ok: false, optional, detail: String(err?.message ?? err).slice(0, 300) });
  }
}

function need(...keys) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`);
}

async function getJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const msg = body?.error?.message ?? body?.error ?? body?.message ?? text;
    throw new Error(`HTTP ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return body;
}

// ─── Firebase (web config) ───────────────────────────────────────────────────
await check('Firebase web config', async () => {
  need('VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_APP_ID');
  const cfg = await getJson(
    `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${env.VITE_FIREBASE_API_KEY}`,
    { headers: { Referer: 'http://localhost:5173/' } },
  );
  // Google may report the project id or the project number (= messagingSenderId).
  const ours = [env.VITE_FIREBASE_PROJECT_ID, env.VITE_FIREBASE_MESSAGING_SENDER_ID];
  if (!ours.includes(String(cfg.projectId)))
    throw new Error(`API key belongs to project "${cfg.projectId}", not "${env.VITE_FIREBASE_PROJECT_ID}" (${env.VITE_FIREBASE_MESSAGING_SENDER_ID})`);
  return `project=${env.VITE_FIREBASE_PROJECT_ID} (#${cfg.projectId}); authorized domains: ${(cfg.authorizedDomains ?? []).join(', ')}`;
});

// ─── Firebase (admin / service account) ──────────────────────────────────────
let adminApp;
await check('Firebase service account', async () => {
  need('FIREBASE_SERVICE_ACCOUNT');
  const sa = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
  if (sa.project_id !== env.VITE_FIREBASE_PROJECT_ID)
    throw new Error(`service account is for "${sa.project_id}", web config is "${env.VITE_FIREBASE_PROJECT_ID}"`);
  adminApp = initializeApp({ credential: cert(sa), storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET });
  return `client_email=${sa.client_email}`;
});

if (adminApp) {
  await check('Firebase Auth (admin)', async () => {
    const list = await getAuth(adminApp).listUsers(1);
    return `reachable; ${list.users.length ? 'has users' : 'no users yet'}`;
  });
  await check('Firestore', async () => {
    const cols = await getFirestore(adminApp).listCollections();
    return `default database reachable; ${cols.length} top-level collections`;
  });
  await check('Cloud Storage bucket', async () => {
    const [exists] = await getStorage(adminApp).bucket().exists();
    if (!exists) throw new Error(`bucket "${env.VITE_FIREBASE_STORAGE_BUCKET}" not found — enable Storage in the Firebase console`);
    return `bucket=${env.VITE_FIREBASE_STORAGE_BUCKET}`;
  });
}

// ─── Google Maps ─────────────────────────────────────────────────────────────
const placesSearch = (key, referer) =>
  getJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id', // IDs-only field mask = cheapest SKU
      ...(referer ? { Referer: referer } : {}),
    },
    body: JSON.stringify({ textQuery: 'halal restaurant', locationBias: { circle: { center: { latitude: KL.lat, longitude: KL.lng }, radius: 1000 } }, pageSize: 1 }),
  });

await check('Maps browser key (Places, from localhost:5173)', async () => {
  need('VITE_GOOGLE_MAPS_API_KEY');
  const r = await placesSearch(env.VITE_GOOGLE_MAPS_API_KEY, 'http://localhost:5173/');
  return `ok; ${r.places?.length ?? 0} result`;
});

await check('Maps browser key is referrer-restricted', async () => {
  try {
    await placesSearch(env.VITE_GOOGLE_MAPS_API_KEY, 'https://evil.example.com/');
  } catch (e) {
    if (/HTTP 403/.test(e.message)) return 'ok; unknown sites are blocked';
    throw e;
  }
  throw new Error('key works from ANY website — add HTTP referrer restrictions in Google Cloud → Credentials');
});

await check('Maps server key: Places API (New)', async () => {
  need('GOOGLE_MAPS_SERVER_KEY');
  const r = await placesSearch(env.GOOGLE_MAPS_SERVER_KEY);
  return `ok; ${r.places?.length ?? 0} result`;
});

await check('Maps server key: Routes API', async () => {
  const r = await getJson('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_MAPS_SERVER_KEY, 'X-Goog-FieldMask': 'routes.duration' },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: KL.lat, longitude: KL.lng } } },
      destination: { location: { latLng: { latitude: 3.1466, longitude: 101.6958 } } },
      travelMode: 'WALK',
    }),
  });
  return `ok; KLCC → Bukit Bintang walk ${r.routes?.[0]?.duration ?? '?'}`;
});

await check('Maps server key: Time Zone API', async () => {
  const r = await getJson(
    `https://maps.googleapis.com/maps/api/timezone/json?location=${KL.lat},${KL.lng}&timestamp=${Math.floor(Date.now() / 1000)}&key=${env.GOOGLE_MAPS_SERVER_KEY}`,
  );
  if (r.status !== 'OK') throw new Error(`${r.status}: ${r.errorMessage ?? ''}`);
  return `ok; ${r.timeZoneId}`;
});

// ─── Gemini ──────────────────────────────────────────────────────────────────
await check('Gemini API', async () => {
  need('GEMINI_API_KEY');
  const r = await getJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
  });
  const flash = (r.models ?? [])
    .map((m) => m.name.replace('models/', ''))
    .filter((n) => /^gemini-[\d.]+-flash(-lite)?$/.test(n) || /^gemini-flash-latest$/.test(n));
  return `ok; flash models: ${flash.join(', ') || '(none matched)'}`;
});

// ─── Groq (free backup AI) ───────────────────────────────────────────────────
await check('Groq (backup AI)', async () => {
  need('GROQ_API_KEY');
  const r = await getJson('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` } });
  const ids = (r.data ?? []).map((m) => m.id);
  const want = [env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b', env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b'];
  const missing = want.filter((m) => !ids.includes(m));
  if (missing.length) throw new Error(`key works, but model(s) not available: ${missing.join(', ')}`);
  return `ok; text=${want[0]}, vision=${want[1]}`;
}, { optional: true });

// ─── Hotels ──────────────────────────────────────────────────────────────────
await check('LiteAPI', async () => {
  need('LITEAPI_KEY');
  const mode = env.LITEAPI_KEY.startsWith('sand_') ? 'SANDBOX' : env.LITEAPI_KEY.startsWith('prod_') ? 'PRODUCTION' : 'unknown-type';
  const r = await getJson('https://api.liteapi.travel/v3.0/data/countries', { headers: { 'X-API-Key': env.LITEAPI_KEY } });
  return `ok (${mode} key); ${r.data?.length ?? 0} countries`;
});

await check('SerpApi', async () => {
  need('SERPAPI_KEY');
  // account.json is free and does not consume a search
  const r = await getJson(`https://serpapi.com/account.json?api_key=${env.SERPAPI_KEY}`);
  return `ok; plan=${r.plan_name ?? r.plan_id}; searches left this month=${r.plan_searches_left ?? r.total_searches_left}`;
}, { optional: true });

// ─── Halal data ──────────────────────────────────────────────────────────────
await check('Foursquare Places', async () => {
  need('FOURSQUARE_API_KEY');
  const url = `https://places-api.foursquare.com/places/search?query=halal&ll=${KL.lat},${KL.lng}&limit=1`;
  try {
    const r = await getJson(url, {
      headers: { Authorization: `Bearer ${env.FOURSQUARE_API_KEY}`, 'X-Places-Api-Version': '2025-06-17', Accept: 'application/json' },
    });
    return `ok (new Places API); ${r.results?.length ?? 0} result`;
  } catch (e) {
    // Legacy v3 keys use a different host + auth scheme
    const r = await getJson(`https://api.foursquare.com/v3/places/search?query=halal&ll=${KL.lat},${KL.lng}&limit=1`, {
      headers: { Authorization: env.FOURSQUARE_API_KEY, Accept: 'application/json' },
    }).catch((e2) => { throw new Error(`new API: ${e.message} | legacy v3: ${e2.message}`); });
    return `ok (legacy v3 API); ${r.results?.length ?? 0} result`;
  }
}, { optional: true });

// ─── Flight status ───────────────────────────────────────────────────────────
await check('Flight status (AviationStack)', async () => {
  need('FLIGHT_STATUS_API_KEY');
  // NOTE: uses 1 request of the monthly quota. Free plan is HTTP-only.
  const r = await getJson(`http://api.aviationstack.com/v1/flights?access_key=${env.FLIGHT_STATUS_API_KEY}&flight_iata=MH1&limit=1`);
  if (r.error) throw new Error(`${r.error.code}: ${r.error.message}`);
  return `ok; real-time flights endpoint reachable`;
}, { optional: true });

// ─── Monitoring / rate limiting ──────────────────────────────────────────────
await check('Sentry DSN format', async () => {
  need('VITE_SENTRY_DSN');
  const u = new URL(env.VITE_SENTRY_DSN);
  if (!u.username || !/^\/\d+$/.test(u.pathname)) throw new Error('does not look like https://<key>@<host>/<projectId>');
  return `ok; host=${u.host}`;
}, { optional: true });

await check('Upstash Redis', async () => {
  need('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN');
  const r = await getJson(`${env.UPSTASH_REDIS_REST_URL.replace(/\/$/, '')}/ping`, {
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  return `ok; ${r.result}`;
}, { optional: true });

// ─── Report ──────────────────────────────────────────────────────────────────
console.log('');
for (const r of results) {
  const icon = r.ok ? '✅' : r.optional ? '⚠️ ' : '❌';
  console.log(`${icon} ${r.name.padEnd(48)} ${r.detail ?? ''}`);
}
const failed = results.filter((r) => !r.ok && !r.optional).length;
console.log(`\n${results.length - failed}/${results.length} passed${failed ? ` — ${failed} required check(s) failed` : ''}`);
process.exit(failed ? 1 : 0);
