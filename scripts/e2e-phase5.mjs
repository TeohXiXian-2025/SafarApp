// End-to-end test for Phase 5 (timeline + manual arrange) against the REAL
// Firebase, Google Places and Routes API, through a running API
// (npm run dev, or E2E_BASE_URL=https://…). Cleans up after itself.
// Usage: npm run e2e:phase5
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
  const u = await adminAuth(admin).createUser({ email: `e2e5-${run}-${name}@safar.test`, displayName: name });
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

const item = async (tripId, id) => (await db.doc(`trips/${tripId}/schedule/${id}`).get()).data();
const ideaDoc = async (tripId, id) => (await db.doc(`trips/${tripId}/ideas/${id}`).get()).data();
const dayItems = async (tripId, day) =>
  (await db.collection(`trips/${tripId}/schedule`).where('day', '==', day).get()).docs.map((d) => d.data()).sort((a, b) => a.start.localeCompare(b.start));

try {
  console.log(`\nPhase 5 e2e against ${BASE}`);
  const alice = await makeUser('Alice');
  const t = await alice.call('trips/create', {
    name: 'E2E KL Timeline',
    destinations: [{ name: 'Kuala Lumpur', placeId: 'ChIJ5-rvAcdJzDERfSgcL1uO2fQ', location: { lat: 3.139, lng: 101.6869 }, countryCode: 'MY' }],
    startDate: '2026-12-07', endDate: '2026-12-09', currency: 'MYR',
  });
  assert.equal(t.status, 201, JSON.stringify(t.body));
  const tripId = t.body.tripId;
  created.tripIds.push(tripId);
  const q = { tripId };
  ok('trip created (one member, so one 👍 approves)');

  // Hotel check-in at 15:00 on day 1 → a locked anchor.
  const hotel = await alice.call('bookings/create', {
    source: 'manual',
    draft: {
      kind: 'hotel', carrier: 'E2E Hotel', travellerUids: [alice.uid],
      to: { name: 'Hotel Stripes Kuala Lumpur', location: { lat: 3.1579, lng: 101.6995 } },
      startLocal: '2026-12-07T15:00', endLocal: '2026-12-09T12:00',
    },
  }, q);
  assert.equal(hotel.status, 201, JSON.stringify(hotel.body));
  const checkinId = `bk_${hotel.body.id}_0`;
  assert.equal((await item(tripId, checkinId)).locked, true);
  ok('hotel booking → locked check-in anchor');

  const [towers, aquaria, market] = await Promise.all([
    placeId('Petronas Twin Towers Kuala Lumpur'),
    placeId('Aquaria KLCC'),
    placeId('Central Market Kuala Lumpur'),
  ]);
  const ids = [];
  for (const p of [towers, aquaria, market]) {
    const r = await alice.call('ideas/add', { placeId: p }, q);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    ids.push(r.body.id);
  }
  const [A, B, C] = ids;

  const early = await alice.call('schedule/add', { ideaId: A, day: '2026-12-07' }, q);
  assert.equal(early.status, 409);
  ok('ideas still being voted on can’t go on the timeline');

  for (const id of ids) assert.equal((await alice.call('ideas/vote', { ideaId: id, value: 1 }, q)).body.status, 'backlog');
  ok('3 ideas approved → backlog');

  assert.equal((await alice.call('schedule/add', { ideaId: A, day: '2026-12-10' }, q)).status, 400);
  ok('days outside the trip rejected');

  assert.equal((await alice.call('schedule/add', { ideaId: A, day: '2026-12-07' }, q)).status, 201);
  assert.equal((await alice.call('schedule/add', { ideaId: B, day: '2026-12-07' }, q)).status, 201);
  const a1 = await item(tripId, `idea_${A}`);
  const b1 = await item(tripId, `idea_${B}`);
  assert.equal(a1.start, '09:00');
  assert.ok(b1.start >= a1.end, `${b1.start} after ${a1.end}`);
  assert.equal((await ideaDoc(tripId, A)).status, 'scheduled');
  ok(`added without a time → packed: ${a1.start}–${a1.end}, then ${b1.start}–${b1.end}; idea marked scheduled`);

  assert.equal((await alice.call('schedule/add', { ideaId: A, day: '2026-12-08' }, q)).status, 409);
  ok('an idea can only be on the timeline once');

  assert.equal(b1.transitFromPrev.fromId, `idea_${A}`);
  assert.equal(b1.transitFromPrev.mode, 'walk'); // Aquaria is next to the towers
  assert.ok(b1.transitFromPrev.minutes > 0 && b1.transitFromPrev.minutes < 20);
  ok(`Routes API leg Petronas → Aquaria: ${b1.transitFromPrev.minutes} min ${b1.transitFromPrev.mode}, ${b1.transitFromPrev.meters} m`);

  const c = await alice.call('schedule/add', { ideaId: C, day: '2026-12-07', start: '14:30' }, q);
  assert.equal(c.status, 201);
  const checkin = await item(tripId, checkinId);
  assert.ok(checkin.transitFromPrev, 'leg into the hotel check-in');
  ok(`explicit start time kept; leg Central Market → hotel: ${checkin.transitFromPrev.minutes} min ${checkin.transitFromPrev.mode}`);

  const re = await alice.call('schedule/reorder', { day: '2026-12-07', order: [`idea_${B}`, `idea_${A}`, `idea_${C}`] }, q);
  assert.equal(re.status, 200, JSON.stringify(re.body));
  const day1 = await dayItems(tripId, '2026-12-07');
  const order = day1.filter((i) => !i.locked && !i.prayer).map((i) => i.id);
  assert.deepEqual(order, [`idea_${B}`, `idea_${A}`, `idea_${C}`]);
  // Packed from the day's first start, but never before a place opens (Aquaria opens at 10:00).
  const b2 = day1.find((i) => i.id === `idea_${B}`);
  assert.ok(b2.start >= '09:00' && b2.start <= '10:00', b2.start);
  assert.ok(day1.find((i) => i.id === `idea_${A}`).start >= b2.end);
  assert.equal((await item(tripId, checkinId)).start, '15:00');
  const a2 = await item(tripId, `idea_${A}`);
  // Its travel leg comes from whatever is right before it (a stop that can't overlap a prayer or the
  // hotel check-in moves past them — prayer and check-in come before sightseeing).
  const chain1 = day1.filter((i) => !i.prayer);
  assert.equal(a2.transitFromPrev.fromId, chain1[chain1.findIndex((i) => i.id === `idea_${A}`) - 1].id);
  ok(`reorder re-times the day (${day1.map((i) => `${i.start}${i.locked ? '🔒' : ''}`).join(', ')}); booking untouched; legs follow the new order`);

  assert.equal((await alice.call('schedule/update', { id: checkinId, start: '10:00' }, q)).status, 409);
  ok('bookings can’t be moved from the timeline');

  const mv = await alice.call('schedule/update', { id: `idea_${C}`, day: '2026-12-08' }, q);
  assert.equal(mv.status, 200, JSON.stringify(mv.body));
  const c2 = await item(tripId, `idea_${C}`);
  assert.equal(c2.day, '2026-12-08');
  assert.equal(c2.start, '09:00');
  assert.equal(c2.transitFromPrev, undefined);
  const ck = await item(tripId, checkinId);
  const chainNow = (await dayItems(tripId, '2026-12-07')).filter((i) => !i.prayer);
  assert.equal(ck.transitFromPrev.fromId, chainNow[chainNow.findIndex((i) => i.id === checkinId) - 1].id);
  ok('moved to another day → first stop there; the old day’s legs are recomputed');

  const dur = await alice.call('schedule/update', { id: `idea_${C}`, start: '10:15', durationMin: 45 }, q);
  assert.equal(dur.status, 200);
  const c3 = await item(tripId, `idea_${C}`);
  assert.deepEqual([c3.start, c3.end], ['10:15', '11:00']);
  ok('re-timed and shortened');

  // A conflict on purpose: Central Market opens at 10:00 — put it at 07:00 (clear of Subuh), then "Fix this day".
  await alice.call('schedule/update', { id: `idea_${C}`, start: '07:00' }, q);
  const preview = await alice.call('schedule/fixday', { day: '2026-12-08' }, q);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal((await item(tripId, `idea_${C}`)).start, '07:00'); // a typed time stays; preview changes nothing
  const fixed = await alice.call('schedule/fixday', { day: '2026-12-08', apply: true }, q);
  const c4 = await item(tripId, `idea_${C}`);
  assert.ok(c4.start >= '10:00', `now ${c4.start}`);
  ok(`"Fix this day" moves a stop out of closed hours: 07:00 → ${c4.start} (preview first; ${fixed.body.removed.length} removed)`);

  assert.equal((await alice.call('ideas/decide', { ideaId: A, action: 'reject' }, q)).status, 409);
  ok('admin can’t reject an idea that’s on the timeline');

  assert.equal((await alice.call('schedule/remove', { id: `idea_${A}` }, q)).status, 200);
  assert.equal(await item(tripId, `idea_${A}`), undefined);
  assert.equal((await ideaDoc(tripId, A)).status, 'backlog');
  ok('taken off the timeline → back in the backlog');

  assert.equal((await alice.call('ideas/delete', { ideaId: B }, q)).status, 200);
  assert.equal(await item(tripId, `idea_${B}`), undefined);
  ok('deleting an idea also removes its timeline slot');

  // ── A flight changes, is cancelled and replaced: the server alone keeps the timeline right ──
  const prayerIds = async (day) => (await dayItems(tripId, day)).filter((i) => i.prayer).map((i) => i.prayer.prayer);
  const flight = (startLocal, endLocal, from = { name: 'Kuala Lumpur International Airport', location: { lat: 2.7456, lng: 101.7072 } }) => ({
    kind: 'flight', carrier: 'MH', number: '603', travellerUids: [alice.uid], from, to: { name: 'Singapore Changi Airport', location: { lat: 1.3644, lng: 103.9915 } }, startLocal, endLocal,
  });
  const f1 = await alice.call('bookings/create', { source: 'manual', draft: flight('2026-12-09T14:00', '2026-12-09T15:05') }, q);
  assert.equal(f1.status, 201, JSON.stringify(f1.body));
  let pr = await prayerIds('2026-12-09');
  // Zuhur (~13:08) starts too close to boarding → on the flight card, not the timeline; Asar is after leaving.
  assert.ok(!pr.includes('Dhuhr') && !pr.includes('Asr'), pr.join());
  const anchors1 = (await dayItems(tripId, '2026-12-09')).filter((i) => i.ref.kind === 'booking' && i.ref.bookingId === f1.body.id);
  assert.deepEqual(anchors1.map((a) => a.start), ['14:00']);
  ok(`flight home at 14:00 → prayer blocks that day: ${pr.join(', ') || 'none'} (Zuhur goes on the flight card)`);

  const f1b = await alice.call('bookings/update', { id: f1.body.id, draft: flight('2026-12-09T18:30', '2026-12-09T19:35') }, q);
  assert.equal(f1b.status, 200, JSON.stringify(f1b.body));
  pr = await prayerIds('2026-12-09');
  assert.ok(pr.includes('Dhuhr') && pr.includes('Asr'), pr.join());
  assert.deepEqual((await dayItems(tripId, '2026-12-09')).filter((i) => i.ref.bookingId === f1.body.id).map((a) => a.start), ['18:30']);
  ok(`flight moved to 18:30 → anchor moved; Zuhur and Asar back on the timeline without opening the app (${pr.join(', ')})`);

  assert.equal((await alice.call('bookings/delete', { id: f1.body.id }, q)).status, 200);
  const subang = { name: 'Sultan Abdul Aziz Shah Airport', location: { lat: 3.1306, lng: 101.5494 } };
  const f2 = await alice.call('bookings/create', { source: 'manual', draft: flight('2026-12-09T10:00', '2026-12-09T11:00', subang) }, q);
  assert.equal(f2.status, 201, JSON.stringify(f2.body));
  const day3 = await dayItems(tripId, '2026-12-09');
  assert.equal(day3.filter((i) => i.ref.kind === 'booking' && i.ref.bookingId === f1.body.id).length, 0, 'old flight anchors gone');
  assert.deepEqual(day3.filter((i) => i.ref.kind === 'booking' && i.ref.bookingId === f2.body.id).map((a) => a.start), ['10:00']);
  pr = await prayerIds('2026-12-09');
  assert.ok(!pr.includes('Dhuhr') && !pr.includes('Asr'), pr.join());
  ok(`cancelled + new flight from another airport (Subang 10:00) → old anchors gone, new ones in, prayers re-planned (${pr.join(', ') || 'none after leaving'})`);

  console.log(`\n${passed} checks passed.\n`);
} catch (err) {
  console.error(`\n  ❌ ${err.stack ?? err}\n`);
  process.exitCode = 1;
} finally {
  for (const id of created.tripIds) await db.recursiveDelete(db.doc(`trips/${id}`)).catch(() => {});
  for (const uid of created.uids) {
    await db.doc(`users/${uid}`).delete().catch(() => {});
    await adminAuth(admin).deleteUser(uid).catch(() => {});
  }
  process.exit(process.exitCode ?? 0);
}
