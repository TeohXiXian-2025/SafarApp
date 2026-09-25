// End-to-end test for Emergency Resync against the REAL Firebase and Google,
// through a running API.  Usage: npm run e2e:resync
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { cert, initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFs } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';

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

async function makeUser(name) {
  const u = await adminAuth(admin).createUser({ email: `e2er-${run}-${name}@safar.test`, displayName: name });
  created.uids.push(u.uid);
  const app = initializeApp(webConfig, `${name}-${run}`);
  await signInWithCustomToken(getAuth(app), await adminAuth(admin).createCustomToken(u.uid));
  const idToken = await getAuth(app).currentUser.getIdToken();
  const call = async (path, body, query) => {
    const url = new URL(`/api/${path}`, BASE);
    Object.entries(query ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { uid: u.uid, call };
}

async function placeId(query) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_MAPS_SERVER_KEY, 'X-Goog-FieldMask': 'places.id' },
    body: JSON.stringify({ textQuery: query, pageSize: 1 }),
  });
  return (await res.json()).places[0].id;
}

try {
  console.log(`\nEmergency Resync e2e against ${BASE}`);
  const [ali, bob] = [await makeUser('Ali'), await makeUser('Bob')];
  const t = await ali.call('trips/create', {
    name: 'E2E Resync',
    destinations: [{ name: 'Kuala Lumpur', placeId: 'ChIJ5-rvAcdJzDERfSgcL1uO2fQ', location: { lat: 3.139, lng: 101.6869 }, countryCode: 'MY' }],
    startDate: '2026-12-07',
    endDate: '2026-12-09',
    currency: 'MYR',
  });
  assert.ok(t.body.tripId, JSON.stringify(t.body));
  const q = { tripId: t.body.tripId };
  created.tripIds.push(t.body.tripId);
  const inv = await ali.call('invites/create', {}, q);
  assert.equal((await bob.call('invites/accept', { token: inv.body.token })).status, 200);
  const both = [ali.uid, bob.uid];

  const book = (draft) => ali.call('bookings/create', { source: 'manual', draft: { travellerUids: both, ...draft } }, q);
  const flight = await book({ kind: 'flight', carrier: 'MH', number: '602', from: { name: 'Singapore Changi Airport', location: { lat: 1.3644, lng: 103.9915 } }, to: { name: 'Kuala Lumpur International Airport', location: { lat: 2.7456, lng: 101.7072 } }, startLocal: '2026-12-07T07:00', endLocal: '2026-12-07T08:05' });
  assert.equal(flight.status, 201, JSON.stringify(flight.body));
  await book({ kind: 'hotel', carrier: 'Hotel Stripes', to: { name: 'Hotel Stripes Kuala Lumpur', location: { lat: 3.1579, lng: 101.6995 } }, startLocal: '2026-12-07T15:00', endLocal: '2026-12-09T12:00' });
  const bus = await book({ kind: 'bus', carrier: 'Aeroline', from: { name: 'Corus Hotel KL', location: { lat: 3.1557, lng: 101.7131 } }, to: { name: 'Singapore', location: { lat: 1.3006, lng: 103.8559 } }, startLocal: '2026-12-07T23:45', endLocal: '2026-12-08T05:30' });
  assert.equal(bus.status, 201);

  const ids = [];
  for (const p of await Promise.all([placeId('Petronas Twin Towers Kuala Lumpur'), placeId('Aquaria KLCC')])) {
    const r = await ali.call('ideas/add', { placeId: p }, q);
    ids.push(r.body.id);
    for (const u of [ali, bob]) await u.call('ideas/vote', { ideaId: r.body.id, value: 1 }, q);
  }
  for (const id of ids) assert.equal((await ali.call('schedule/add', { ideaId: id, day: '2026-12-07' }, q)).status, 201);
  const before = (await db.collection(`trips/${q.tripId}/schedule`).where('day', '==', '2026-12-07').get()).docs.map((d) => d.data()).filter((i) => i.ref.kind === 'idea');
  ok(`day 1: land 08:05, then ${before.map((i) => i.start).join(' and ')}`);

  // Bob: the flight is delayed to land at 23:30. He didn't add it → preview, then report.
  const change = { type: 'delay', startLocal: '2026-12-07T22:25', endLocal: '2026-12-07T23:30' };
  const p = await bob.call('resync/preview', { bookingId: flight.body.id, change }, q);
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(p.body.canApply, false);
  const d1 = p.body.days.find((d) => d.day === '2026-12-07');
  assert.equal(d1.removed.length, 2, JSON.stringify(d1));
  assert.ok(p.body.warnings.some((w) => /Hotel Stripes.*after 23:30/.test(w)), p.body.warnings.join(' | '));
  assert.ok(p.body.warnings.some((w) => /miss Aeroline|Very tight for Aeroline/.test(w)), p.body.warnings.join(' | '));
  ok(`preview: ${d1.removed.map((r) => `${r.name} → backlog (${r.reason})`).join('; ')}`);
  console.log(`     warnings: ${p.body.warnings.join(' | ')}`);
  assert.equal((await db.collection(`trips/${q.tripId}/schedule`).where('ref.kind', '==', 'idea').get()).size, 2);
  ok('previewing changes nothing');

  assert.equal((await bob.call('resync/apply', { bookingId: flight.body.id, change }, q)).status, 403);
  const rep = await bob.call('resync/report', { bookingId: flight.body.id, change }, q);
  assert.equal(rep.status, 201);
  assert.equal((await db.doc(`trips/${q.tripId}/incidents/${rep.body.incidentId}`).get()).get('status'), 'open');
  ok('Bob can’t apply it (he didn’t add the flight) — he sends it to the admin');

  // Ali (admin) reviews the report and applies it.
  const a = await ali.call('resync/apply', { bookingId: flight.body.id, change, incidentId: rep.body.incidentId }, q);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  const fb = (await db.doc(`trips/${q.tripId}/bookings/${flight.body.id}`).get()).data();
  assert.equal(fb.endLocal, '2026-12-07T23:30');
  assert.ok(fb.endAt.startsWith('2026-12-07T23:30:00+08:00'), fb.endAt);
  const anchors = (await db.collection(`trips/${q.tripId}/schedule`).where('ref.bookingId', '==', flight.body.id).get()).docs.map((d) => d.data());
  assert.equal(anchors[0].start, '22:25');
  assert.equal((await db.collection(`trips/${q.tripId}/schedule`).where('ref.kind', '==', 'idea').get()).size, 0);
  for (const id of ids) assert.equal((await db.doc(`trips/${q.tripId}/ideas/${id}`).get()).get('status'), 'backlog');
  assert.equal((await db.doc(`trips/${q.tripId}/incidents/${rep.body.incidentId}`).get()).get('status'), 'applied');
  ok(`applied: flight now ${fb.startLocal.slice(11)} → ${fb.endLocal.slice(11)} (+08:00), timeline anchor moved, ${a.body.removed} stops back to the backlog, report closed`);

  // The bus is cancelled.
  const c = await ali.call('resync/apply', { bookingId: bus.body.id, change: { type: 'cancel' } }, q);
  assert.equal(c.status, 200);
  assert.equal((await db.doc(`trips/${q.tripId}/bookings/${bus.body.id}`).get()).exists, false);
  assert.equal((await db.collection(`trips/${q.tripId}/schedule`).where('ref.bookingId', '==', bus.body.id).get()).size, 0);
  ok('cancelled: the bus and its timeline stops are gone');

  assert.equal((await ali.call('resync/preview', { bookingId: flight.body.id, change }, q)).status, 400);
  ok('the same times again are refused');

  console.log(`\n${passed} checks passed.`);
} catch (e) {
  console.error('\n❌', e);
  process.exitCode = 1;
} finally {
  for (const id of created.tripIds) await db.recursiveDelete(db.doc(`trips/${id}`)).catch(() => {});
  for (const uid of created.uids) {
    await db.recursiveDelete(db.doc(`users/${uid}`)).catch(() => {});
    await adminAuth(admin).deleteUser(uid).catch(() => {});
  }
  process.exit(process.exitCode ?? 0);
}
