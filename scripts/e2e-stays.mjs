// End-to-end test for Hotels (stays) against the REAL Google Hotels (SerpApi),
// Google Places and Firebase, through a running API. Uses ~2 SerpApi searches.
// Usage: npm run e2e:stays
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
  const u = await adminAuth(admin).createUser({ email: `e2eh-${run}-${name}@safar.test`, displayName: name });
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

try {
  console.log(`\nHotels e2e against ${BASE}`);
  const [ali, bob] = [await makeUser('Ali'), await makeUser('Bob')];
  const t = await ali.call('trips/create', {
    name: 'E2E Hotels',
    destinations: [
      { name: 'Kuala Lumpur', placeId: 'ChIJ5-rvAcdJzDERfSgcL1uO2fQ', location: { lat: 3.139, lng: 101.6869 }, countryCode: 'MY' },
      { name: 'Penang', placeId: 'ChIJvYTZ5oXDSjARs7lOuhLJlys', location: { lat: 5.4141, lng: 100.3288 }, countryCode: 'MY' },
    ],
    startDate: '2026-12-07',
    endDate: '2026-12-11',
    currency: 'MYR',
  });
  assert.ok(t.body.tripId, JSON.stringify(t.body));
  const q = { tripId: t.body.tripId };
  created.tripIds.push(t.body.tripId);
  const inv = await ali.call('invites/create', {}, q);
  assert.equal((await bob.call('invites/accept', { token: inv.body.token })).status, 200);
  // Preferences: budgets overlap at RM 200–350; Ali needs halal food.
  await db.doc(`trips/${q.tripId}/members/${ali.uid}`).update({ prefs: { hotelBudget: { min: 150, max: 350 }, dailyBudget: 100, halalRequired: true, halalTier: 'certified', prayerReminders: true, pace: 'moderate', interests: [], hotelPriorities: ['near_transit'] } });
  await db.doc(`trips/${q.tripId}/members/${bob.uid}`).update({ prefs: { hotelBudget: { min: 200, max: 500 }, halalRequired: false, halalTier: 'certified', prayerReminders: false, pace: 'moderate', interests: [], hotelPriorities: ['breakfast_included'] } });

  // Plan
  assert.equal((await bob.call('stays/plan', {}, q)).status, 200);
  const stays = (await db.collection(`trips/${q.tripId}/stays`).get()).docs.map((d) => d.data()).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  assert.deepEqual(stays.map((s) => [s.city, s.checkIn, s.checkOut]), [['Kuala Lumpur', '2026-12-07', '2026-12-09'], ['Penang', '2026-12-09', '2026-12-11']]);
  assert.equal((await bob.call('stays/plan', {}, q)).body.created, 0);
  ok(`stays proposed once: ${stays.map((s) => `${s.city} ${s.checkIn}→${s.checkOut}`).join(', ')}`);
  assert.equal((await bob.call('stays/add', { destIdx: 0, checkIn: '2026-12-07', checkOut: '2026-12-08' }, q)).status, 403);
  assert.equal((await ali.call('stays/update', { id: stays[0].id, checkIn: '2026-12-06', checkOut: '2026-12-09', perRoom: 2 }, q)).status, 400);
  ok('only the admin edits stays; dates must be inside the trip');

  // Search
  const kl = stays[0];
  const before = (await db.doc(`apiUsage/serpapi_${new Date().toISOString().slice(0, 7)}`).get()).get('count') ?? 0;
  const t0 = Date.now();
  const s1 = await bob.call('stays/search', { id: kl.id }, q);
  assert.equal(s1.status, 200, JSON.stringify(s1.body));
  const hotels = (await db.collection(`trips/${q.tripId}/stays/${kl.id}/hotels`).get()).docs.map((d) => d.data()).sort((a, b) => a.rank - b.rank);
  assert.ok(hotels.length >= 5, `${hotels.length} hotels`);
  assert.equal(s1.body.source, 'google');
  assert.deepEqual(s1.body.budget, { min: 200, max: 350, overlap: true, people: 2 });
  assert.ok(hotels.every((h, i) => i === 0 || hotels[i - 1].score >= h.score), 'best first');
  assert.ok(hotels.filter((h) => h.nightlyMinor).length >= hotels.length / 2, 'most have live prices');
  assert.ok(hotels.slice(0, 8).some((h) => h.mosqueM !== undefined), 'mosque checked for the top ones');
  ok(`${hotels.length} hotels with live prices in ${((Date.now() - t0) / 1000).toFixed(1)}s (SerpApi ${s1.body.usage.used}/${s1.body.usage.cap} this month)`);
  for (const h of hotels.slice(0, 3)) console.log(`     ${h.score}  ${h.name} — RM ${(h.nightlyMinor ?? 0) / 100}/night · ${h.why.join(' · ')}${h.note ? `
         ✨ ${h.note}` : ''}`);
  assert.ok(hotels.slice(0, 5).some((h) => h.note), 'AI notes on the top hotels');
  ok('the top hotels have a one-line “why it fits your group”');

  // Cached: a second search doesn't spend another SerpApi search.
  const mid = (await db.doc(`apiUsage/serpapi_${new Date().toISOString().slice(0, 7)}`).get()).get('count');
  // The first search spends one (or none, if these dates were searched in the last 24 h).
  assert.ok(mid === before + 1 || mid === before, `${before} → ${mid}`);
  assert.equal((await ali.call('stays/search', { id: kl.id }, q)).status, 200);
  assert.equal((await db.doc(`apiUsage/serpapi_${new Date().toISOString().slice(0, 7)}`).get()).get('count'), mid);
  ok('searching again uses the 24 h cache (no extra SerpApi search)');

  // Vote, pick, offers, booked
  const top = hotels[0];
  assert.equal((await bob.call('stays/vote', { id: kl.id, key: top.key, vote: 'up' }, q)).status, 200);
  assert.equal((await bob.call('stays/choose', { id: kl.id, key: top.key }, q)).status, 403);
  assert.equal((await ali.call('stays/choose', { id: kl.id, key: top.key }, q)).status, 200);
  ok(`Bob 👍, the admin picks ${top.name} (Bob can't pick)`);

  const o = await bob.call('stays/offers', { id: kl.id, key: top.key }, q);
  assert.equal(o.status, 200, JSON.stringify(o.body));
  assert.ok(o.body.offers.every((x) => /^https?:\/\//.test(x.link)));
  ok(`booking sites: ${o.body.offers.slice(0, 4).map((x) => `${x.source}${x.nightlyMinor ? ` RM ${x.nightlyMinor / 100}` : ''}`).join(', ') || '(none listed — the hotel link is shown instead)'}`);

  // A re-search keeps the voted & picked hotel.
  assert.equal((await ali.call('stays/search', { id: kl.id }, q)).status, 200);
  const kept = (await db.doc(`trips/${q.tripId}/stays/${kl.id}/hotels/${top.key}`).get()).data();
  assert.equal(kept.votes[bob.uid], 'up');
  ok('searching again keeps votes and the pick');

  const b = await bob.call('stays/booked', { id: kl.id, pnr: 'HB12345' }, q);
  assert.equal(b.status, 201, JSON.stringify(b.body));
  const booking = (await db.doc(`trips/${q.tripId}/bookings/${b.body.bookingId}`).get()).data();
  assert.equal(booking.kind, 'hotel');
  assert.equal(booking.startLocal.slice(0, 10), '2026-12-07');
  assert.equal(booking.endLocal.slice(0, 10), '2026-12-09');
  assert.equal(booking.to.timezone, 'Asia/Kuala_Lumpur');
  const anchors = (await db.collection(`trips/${q.tripId}/schedule`).where('ref.bookingId', '==', b.body.bookingId).get()).docs.map((d) => d.data().ref.event).sort();
  assert.deepEqual(anchors, ['checkin', 'checkout']);
  ok(`“I booked it” → hotel booking ${booking.startLocal} → ${booking.endLocal} with check-in/out on the timeline`);
  assert.equal((await bob.call('stays/booked', { id: kl.id }, q)).status, 409);
  ok('tapping it twice does not book twice');

  // Room size change → needs a new search.
  const u = await ali.call('stays/update', { id: kl.id, checkIn: '2026-12-07', checkOut: '2026-12-09', perRoom: 3 }, q);
  assert.equal(u.body.research, true);
  assert.equal((await db.doc(`trips/${q.tripId}/stays/${kl.id}`).get()).get('search'), undefined);
  ok('changing people per room clears the old prices (search again)');

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
