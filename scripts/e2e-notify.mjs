// End-to-end test for push notifications and reminders, against a running API
// (npm run dev) and the REAL Firebase. A local fake push service stands in for
// Google/Apple: it receives each Web Push request and DECRYPTS it with the
// subscription's keys, so we check exactly what a phone would show.
// Web Push only speaks HTTPS: the fake service uses a throwaway self-signed
// certificate, so run the API with NODE_TLS_REJECT_UNAUTHORIZED=0 for this test.
// Usage: npm run e2e:notify
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { config } from 'dotenv';
import { cert, initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFs } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';

const ece = createRequire(import.meta.url)('http_ece');
config({ path: '.env.local', quiet: true });
const env = process.env;
const BASE = env.E2E_BASE_URL ?? 'http://localhost:5173';
const sa = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
const admin = initAdmin({ credential: cert(sa) }, 'admin');
const db = adminFs(admin);
const webConfig = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID };

const run = Date.now().toString(36);
const created = { uids: [], tripIds: [] };
let passed = 0;
const ok = (m) => (passed++, console.log(`  ✅ ${m}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Fake push service ─────────────────────────────────────────────────────
const inbox = new Map(); // device name → decrypted payloads
const keys = new Map(); // device name → { ecdh, auth }
let gone = new Set(); // devices that answer 410 Gone
const certDir = mkdtempSync(join(tmpdir(), 'safar-push-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1', '-keyout', join(certDir, 'key.pem'), '-out', join(certDir, 'cert.pem')], { stdio: 'ignore' });
const server = createServer({ key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) }, (req, res) => {
  const name = req.url.slice(1);
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    if (gone.has(name)) return res.writeHead(410).end();
    const k = keys.get(name);
    try {
      const plain = ece.decrypt(Buffer.concat(chunks), { version: 'aes128gcm', privateKey: k.ecdh, authSecret: k.auth });
      inbox.set(name, [...(inbox.get(name) ?? []), { ...JSON.parse(plain.toString()), ttl: req.headers.ttl, urgency: req.headers.urgency, vapid: String(req.headers.authorization).startsWith('vapid ') }]);
    } catch (e) {
      inbox.set(name, [...(inbox.get(name) ?? []), { error: String(e) }]);
    }
    res.writeHead(201).end();
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
function device(name) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  keys.set(name, { ecdh, auth });
  return { endpoint: `https://127.0.0.1:${port}/${name}`, keys: { p256dh: ecdh.getPublicKey('base64url'), auth: auth.toString('base64url') } };
}
const take = (name) => {
  const got = inbox.get(name) ?? [];
  inbox.delete(name);
  return got;
};

async function makeUser(name) {
  const u = await adminAuth(admin).createUser({ email: `e2en-${run}-${name}@safar.test`, displayName: name });
  created.uids.push(u.uid);
  const app = initializeApp(webConfig, `${name}-${run}`);
  await signInWithCustomToken(getAuth(app), await adminAuth(admin).createCustomToken(u.uid));
  const idToken = await getAuth(app).currentUser.getIdToken();
  const call = async (path, body, query, method = 'POST') => {
    const url = new URL(`/api/${path}`, BASE);
    Object.entries(query ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${idToken}`, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { uid: u.uid, name, call };
}
async function placeId(query) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_MAPS_SERVER_KEY, 'X-Goog-FieldMask': 'places.id' },
    body: JSON.stringify({ textQuery: query, pageSize: 1 }),
  });
  return (await res.json()).places[0].id;
}

// A destination where it's daytime right now, so non-urgent alerts aren't held for quiet hours.
const CITIES = [
  { name: 'Kuala Lumpur', placeId: 'ChIJ5-rvAcdJzDERfSgcL1uO2fQ', location: { lat: 3.139, lng: 101.6869 }, countryCode: 'MY', tz: 'Asia/Kuala_Lumpur', q: 'Petronas Twin Towers' },
  { name: 'London', placeId: 'ChIJdd4hrwug2EcRmSrV3Vo6llI', location: { lat: 51.5072, lng: -0.1276 }, countryCode: 'GB', tz: 'Europe/London', q: 'British Museum London' },
  { name: 'New York', placeId: 'ChIJOwg_06VPwokRYv534QaPC8g', location: { lat: 40.7128, lng: -74.006 }, countryCode: 'US', tz: 'America/New_York', q: 'Metropolitan Museum of Art New York' },
];
const hour = (tz) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const city = CITIES.find((c) => hour(c.tz) >= 9 && hour(c.tz) < 21) ?? CITIES[0];

try {
  console.log(`\nNotifications e2e against ${BASE} (trip in ${city.name}, local hour ${hour(city.tz)})`);
  const key = await fetch(new URL('/api/push/key', BASE)).then((r) => r.json());
  assert.ok(key.key?.length > 60, 'VAPID public key served');
  ok('public VAPID key is served');

  const [alice, bob, cara] = await Promise.all(['Alice', 'Bob', 'Cara'].map(makeUser));
  const t = await alice.call('trips/create', { name: 'E2E Notify', destinations: [{ name: city.name, placeId: city.placeId, location: city.location, countryCode: city.countryCode }], startDate: '2026-12-07', endDate: '2026-12-08', currency: 'MYR' });
  const tripId = t.body.tripId;
  created.tripIds.push(tripId);
  const q = { tripId };
  const inv = await alice.call('invites/create', {}, q);
  for (const u of [bob, cara]) await u.call('invites/accept', { token: inv.body.token });
  const base = { halalRequired: false, halalTier: 'certified', prayerReminders: false, pace: 'moderate', interests: [], hotelPriorities: [] };
  for (const u of [alice, bob, cara]) await db.doc(`trips/${tripId}/members/${u.uid}`).update({ prefs: base });

  for (const u of [alice, bob, cara]) assert.equal((await u.call('push/subscribe', { subscription: device(u.name), device: 'e2e' })).status, 200);
  const prefs = await bob.call('push/prefs', undefined, undefined, 'GET');
  assert.equal(prefs.body.devices, 1);
  assert.ok(Object.values(prefs.body.prefs).every(Boolean));
  ok('3 devices subscribed; every kind is on by default');

  const test = await bob.call('push/test');
  assert.equal(test.body.sent, 1);
  const [tn] = take('Bob');
  assert.equal(tn.title, 'Safar notifications are on ✅');
  assert.ok(tn.vapid && Number(tn.ttl) > 0);
  ok(`test push delivered, encrypted (aes128gcm) and signed (VAPID): “${tn.title}”`);

  // ── New ideas: everyone else, bundled ───────────────────────────────────
  const i1 = (await alice.call('ideas/add', { placeId: await placeId(city.q) }, q)).body.id;
  await sleep(300);
  const [b1] = take('Bob');
  assert.match(b1.title, /Alice suggested/);
  assert.equal(b1.url, `/t/${tripId}/ideas?filter=voting`);
  assert.equal(take('Cara').length, 1);
  assert.equal(take('Alice').length, 0);
  const i2 = (await alice.call('ideas/add', { placeId: await placeId(`${city.name} central station`) }, q)).body.id;
  await sleep(300);
  assert.equal(take('Bob').length, 0);
  ok(`new idea → the others get “${b1.title}” (not Alice); a second idea within 10 min is bundled (no new alert)`);

  // ── Split votes → the person not going; then the admin; then everyone ───
  await alice.call('ideas/vote', { ideaId: i1, value: 1 }, q);
  await cara.call('ideas/vote', { ideaId: i1, value: 1 }, q);
  await bob.call('ideas/vote', { ideaId: i1, value: -1, tag: 'been_before' }, q);
  const [bs] = take('Bob');
  assert.match(bs.title, /Votes are split/);
  assert.equal(bs.urgency, 'high');
  assert.equal(take('Cara').length, 0);
  ok(`votes split → only Bob (not going) gets “${bs.title}” (high urgency)`);

  await bob.call('ideas/choose', { ideaId: i1, optionId: 'free' }, q);
  const [ad] = take('Alice');
  assert.match(ad.title, /Your call/);
  ok(`everyone picked → the admin gets “${ad.title}”`);

  await alice.call('ideas/decide', { ideaId: i1, action: 'accept' }, q);
  assert.match(take('Bob')[0].title, /is in/);
  assert.equal(take('Cara').length, 1);
  assert.equal(take('Alice').length, 0);
  ok('admin accepts → everyone else hears the result');

  // ── Turned-off kinds ──────────────────────────────────────────────────────
  await bob.call('push/prefs', { prefs: { comment: false } });
  await cara.call('ideas/comment', { ideaId: i1, text: 'Bring a jacket, it gets cold up there' }, q);
  assert.equal(take('Bob').length, 0);
  const [ac] = take('Alice');
  assert.match(ac.title, /Cara on/);
  ok('comments reach the idea’s people (Alice) but not Bob, who turned comments off');

  // ── Reminders job ─────────────────────────────────────────────────────────
  const noAuth = await fetch(new URL('/api/cron/reminders', BASE));
  assert.equal(noAuth.status, 401);
  await db.doc(`trips/${tripId}/ideas/${i2}`).update({ votingEndsAt: Date.now() + 6 * 3600e3 });
  await alice.call('ideas/vote', { ideaId: i2, value: 1 }, q);
  take('Alice');
  const cron = () => fetch(new URL('/api/cron/reminders', BASE), { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } }).then((r) => r.json());
  const r1 = await cron();
  const bobR = take('Bob');
  assert.equal(bobR.length, 1);
  assert.match(bobR[0].title, /h left to vote/);
  assert.equal(take('Alice').length, 0); // already voted
  ok(`reminders job (Bearer CRON_SECRET only): “${bobR[0].title}” to people who haven't voted (${r1.trips} trips scanned)`);
  await cron();
  assert.equal(take('Bob').length, 0);
  ok('each reminder is sent once');

  await db.doc(`trips/${tripId}/ideas/${i2}`).update({ votingEndsAt: Date.now() - 1000 });
  await cron();
  assert.equal((await db.doc(`trips/${tripId}/ideas/${i2}`).get()).data().status, 'backlog');
  assert.match(take('Bob')[0].title, /is in/);
  ok('the job also closes overdue votes (non-voters abstain) and announces the result');

  // ── Dead subscriptions are cleaned up ─────────────────────────────────────
  gone = new Set(['Cara']);
  assert.equal((await cara.call('push/test')).body.sent, 0);
  const caraSubs = await db.collection(`users/${cara.uid}/pushSubs`).get();
  assert.equal(caraSubs.size, 0);
  ok('a device that answers 410 Gone is unsubscribed automatically');

  console.log(`\n${passed} checks passed.\n`);
} catch (err) {
  console.error(`\n  ❌ ${err.stack ?? err}\n`);
  process.exitCode = 1;
} finally {
  server.close();
  for (const id of created.tripIds) await db.recursiveDelete(db.doc(`trips/${id}`)).catch(() => {});
  for (const uid of created.uids) {
    await db.recursiveDelete(db.doc(`users/${uid}`)).catch(() => {});
    await adminAuth(admin).deleteUser(uid).catch(() => {});
  }
  process.exit(process.exitCode ?? 0);
}
