// End-to-end test for the Food tab (Halal Radar near you) against the REAL
// Google Places, OpenStreetMap, Gemini and Firebase, through a running API.
// Usage: npm run e2e:food
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
const created = { uids: [], tripIds: [], waitKeys: [] };
let passed = 0;
const ok = (m) => (passed++, console.log(`  ✅ ${m}`));

async function makeUser(name) {
  const u = await adminAuth(admin).createUser({ email: `e2ef-${run}-${name}@safar.test`, displayName: name });
  created.uids.push(u.uid);
  const app = initializeApp(webConfig, `${name}-${run}`);
  await signInWithCustomToken(getAuth(app), await adminAuth(admin).createCustomToken(u.uid));
  const idToken = await getAuth(app).currentUser.getIdToken();
  return async (path, body, query) => {
    const url = new URL(`/api/${path}`, BASE);
    Object.entries(query ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
}

try {
  console.log(`\nFood tab e2e against ${BASE}`);
  const call = await makeUser('Aisha');
  const t = await call('trips/create', { name: 'E2E Food', destinations: [{ name: 'Kuala Lumpur', placeId: 'ChIJ5-rvAcdJzDERfSgcL1uO2fQ', location: { lat: 3.139, lng: 101.6869 }, countryCode: 'MY' }], startDate: '2026-12-07', endDate: '2026-12-08', currency: 'MYR' });
  const q = { tripId: t.body.tripId };
  created.tripIds.push(t.body.tripId);

  // Bukit Bintang — lots of halal and non-halal food.
  const t0 = Date.now();
  const r = await call('food/nearby', { lat: 3.1466, lng: 101.7101 }, q);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const items = r.body.items;
  const by = (b) => items.filter((i) => i.verdict.bucket === b);
  assert.ok(items.length >= 15, `${items.length} places`);
  assert.ok(by('certified').length + by('halal').length >= 3, 'some halal places');
  assert.ok(items.every((i, k) => k === 0 || items[k - 1].distanceM <= i.distanceM), 'nearest first');
  assert.ok(items.every((i) => i.verdict.basis && i.walkMin >= 0));
  ok(`${items.length} places in ${((Date.now() - t0) / 1000).toFixed(1)}s — halal ${by('certified').length + by('halal').length}, pork-free ${by('pork_free').length}, not checked ${by('unknown').length}, not halal ${by('not_halal').length}`);
  const sample = [...by('halal'), ...by('certified')].slice(0, 3).map((i) => `${i.name} (${i.verdict.text} · ${i.verdict.basis}, ${i.walkMin} min${i.openNow === undefined ? '' : i.openNow ? ', open' : ', closed'})`);
  console.log(`     ${sample.join('\n     ')}`);

  const unknown = by('unknown')[0];
  if (unknown) {
    const c = await call('food/check', { placeId: unknown.placeId }, q);
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.ok(c.body.verdict.bucket);
    ok(`Check on “${unknown.name}” → ${c.body.verdict.text} (${c.body.verdict.basis})${c.body.halal.evidence?.[0] ? ` — ${c.body.halal.evidence[0].text}` : ''}`);
    const again = await call('food/nearby', { lat: 3.1466, lng: 101.7101 }, q);
    assert.ok(again.body.items.find((i) => i.placeId === unknown.placeId).checked);
    ok('the result is cached and shows up for everyone in the next search');
  }

  const place = items[0];
  created.waitKeys.push(place.placeKey);
  assert.equal((await call('food/wait', { placeId: place.placeId, minutes: 15 }, q)).status, 200);
  const w = (await call('food/nearby', { lat: 3.1466, lng: 101.7101 }, q)).body.items.find((i) => i.placeId === place.placeId);
  assert.equal(w.wait.minutes, 15);
  ok(`queue report shows for others: ${place.name} ~${w.wait.minutes} min`);

  const add = await call('ideas/add', { placeId: place.placeId, source: { type: 'radar' } }, q);
  assert.equal(add.status, 201);
  const w2 = (await call('food/nearby', { lat: 3.1466, lng: 101.7101 }, q)).body.items.find((i) => i.placeId === place.placeId);
  assert.equal(w2.ideaId, add.body.id);
  ok('“Add to Idea Board” works and the card shows it’s on the board');

  console.log(`\n${passed} checks passed.\n`);
} catch (err) {
  console.error(`\n  ❌ ${err.stack ?? err}\n`);
  process.exitCode = 1;
} finally {
  for (const id of created.tripIds) await db.recursiveDelete(db.doc(`trips/${id}`)).catch(() => {});
  for (const k of created.waitKeys) await db.recursiveDelete(db.doc(`waitReports/${k}`)).catch(() => {});
  for (const uid of created.uids) {
    await db.recursiveDelete(db.doc(`users/${uid}`)).catch(() => {});
    await adminAuth(admin).deleteUser(uid).catch(() => {});
  }
  process.exit(process.exitCode ?? 0);
}
