// End-to-end smoke test for Phase 1 against the REAL Firebase project + a
// running dev server (npm run dev). Creates two throwaway users, exercises
// the trip/invite/member API and the deployed security rules, then deletes
// everything it created.   Usage: npm run e2e:phase1
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { cert, initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFs } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { doc, getDoc, getFirestore, setDoc, updateDoc } from 'firebase/firestore';

config({ path: '.env.local', quiet: true });
const env = process.env;
const BASE = env.E2E_BASE_URL ?? 'http://localhost:5173';

const sa = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
const admin = initAdmin({ credential: cert(sa) }, 'admin');
const webConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const run = Date.now().toString(36);
const created = { uids: [], tripIds: [] };
let passed = 0;
const ok = (msg) => {
  passed++;
  console.log(`  ✅ ${msg}`);
};

async function makeUser(name) {
  const u = await adminAuth(admin).createUser({ email: `e2e-${run}-${name}@safar.test`, displayName: `E2E ${name}` });
  created.uids.push(u.uid);
  const app = initializeApp(webConfig, `${name}-${run}`);
  const auth = getAuth(app);
  await signInWithCustomToken(auth, await adminAuth(admin).createCustomToken(u.uid));
  const idToken = await auth.currentUser.getIdToken();
  const call = async (method, path, { body, query } = {}) => {
    const url = new URL(`/api/${path}`, BASE);
    Object.entries(query ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${idToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { uid: u.uid, name, db: getFirestore(app), call };
}

const denied = async (p, label) => {
  await assert.rejects(p, (e) => e.code === 'permission-denied', `${label} should be denied`);
  ok(`${label} → denied by rules`);
};

try {
  console.log(`\nPhase 1 e2e against ${BASE}`);
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  assert.equal(health.ok, true);
  ok('API reachable');

  const alice = await makeUser('alice');
  const bob = await makeUser('bob');
  const eve = await makeUser('eve'); // never joins

  // ── Profiles (client write, rules-checked) ───────────────────────────
  await setDoc(doc(alice.db, `users/${alice.uid}`), { uid: alice.uid, displayName: 'Alice', createdAt: Date.now() });
  ok('user can create own profile');
  await denied(setDoc(doc(eve.db, `users/${alice.uid}`), { uid: alice.uid, displayName: 'x', createdAt: 1 }), "writing someone else's profile");

  // ── Create trip ──────────────────────────────────────────────────────
  const bad = await alice.call('POST', 'trips/create', {
    body: { name: 'x', destinations: [], startDate: '2026-12-07', endDate: '2026-12-01', currency: 'MYR' },
  });
  assert.equal(bad.status, 400);
  ok('invalid trip rejected (400)');

  const createRes = await alice.call('POST', 'trips/create', {
    body: {
      name: 'E2E Tokyo',
      destinations: [{ name: 'Tokyo', placeId: 'ChIJXSModoWLGGARILWiCfeu2M0', location: { lat: 35.6764, lng: 139.65 }, countryCode: 'JP' }],
      startDate: '2026-12-01',
      endDate: '2026-12-07',
      currency: 'MYR',
    },
  });
  assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
  const tripId = createRes.body.tripId;
  created.tripIds.push(tripId);
  ok(`trip created (${tripId})`);

  const tripSnap = await getDoc(doc(alice.db, `trips/${tripId}`));
  assert.equal(tripSnap.data().destinations[0].timezone, 'Asia/Tokyo');
  assert.equal(tripSnap.data().adminId, alice.uid);
  ok('admin can read trip; server filled timezone Asia/Tokyo');

  await denied(getDoc(doc(eve.db, `trips/${tripId}`)), 'non-member reading trip');
  await denied(updateDoc(doc(alice.db, `trips/${tripId}`), { name: 'hacked' }), 'client writing trip doc directly');
  await denied(getDoc(doc(eve.db, `trips/${tripId}/members/${alice.uid}`)), 'non-member reading members');

  // ── Invites ──────────────────────────────────────────────────────────
  assert.equal((await bob.call('POST', 'invites/create', { body: {}, query: { tripId } })).status, 403);
  ok('non-member cannot create invite (403)');

  const inv = await alice.call('POST', 'invites/create', { body: { maxUses: 2 }, query: { tripId } });
  assert.equal(inv.status, 201);
  const token = inv.body.token;
  ok('admin created invite');

  await denied(getDoc(doc(bob.db, `inviteTokens/${token}`)), 'reading invite tokens directly');

  const preview = await bob.call('GET', 'invites/preview', { query: { token } });
  assert.equal(preview.body.name, 'E2E Tokyo');
  assert.equal(preview.body.alreadyMember, false);
  ok('invite preview works');

  const accept = await bob.call('POST', 'invites/accept', { body: { token } });
  assert.equal(accept.body.tripId, tripId);
  const again = await bob.call('POST', 'invites/accept', { body: { token } });
  assert.equal(again.status, 200);
  ok('bob joined (accept is idempotent)');

  const bobTrip = await getDoc(doc(bob.db, `trips/${tripId}`));
  assert.ok(bobTrip.data().memberIds.includes(bob.uid));
  ok('bob can now read the trip');

  // Member can edit only their own prefs
  await updateDoc(doc(bob.db, `trips/${tripId}/members/${bob.uid}`), { prefs: { halalRequired: true } });
  ok('member can update own prefs');
  await denied(updateDoc(doc(bob.db, `trips/${tripId}/members/${bob.uid}`), { role: 'admin' }), 'member promoting themselves');
  await denied(updateDoc(doc(bob.db, `trips/${tripId}/members/${alice.uid}`), { prefs: {} }), "editing another member's prefs");

  // ── Member management ────────────────────────────────────────────────
  assert.equal((await bob.call('POST', 'members/remove', { body: { uid: alice.uid }, query: { tripId } })).status, 403);
  ok('non-admin cannot remove members (403)');
  assert.equal((await alice.call('POST', 'members/leave', { body: {}, query: { tripId } })).status, 400);
  ok('admin cannot leave without transferring (400)');

  const xfer = await alice.call('POST', 'members/transfer-admin', { body: { uid: bob.uid }, query: { tripId } });
  assert.equal(xfer.status, 200);
  const t2 = (await getDoc(doc(alice.db, `trips/${tripId}`))).data();
  assert.equal(t2.adminId, bob.uid);
  ok('admin transferred to bob');

  const rm = await bob.call('POST', 'members/remove', { body: { uid: alice.uid }, query: { tripId } });
  assert.equal(rm.status, 200);
  await denied(getDoc(doc(alice.db, `trips/${tripId}`)), 'removed member reading trip');

  const act = await adminFs(admin).collection(`trips/${tripId}/activity`).get();
  assert.ok(act.size >= 4);
  ok(`activity feed has ${act.size} entries`);

  // ── Delete ───────────────────────────────────────────────────────────
  assert.equal((await bob.call('POST', 'trips/delete', { body: {}, query: { tripId } })).status, 200);
  const gone = await adminFs(admin).doc(`trips/${tripId}`).get();
  assert.equal(gone.exists, false);
  const tokenGone = await adminFs(admin).doc(`inviteTokens/${token}`).get();
  assert.equal(tokenGone.exists, false);
  ok('trip + invites deleted');

  console.log(`\n${passed} checks passed ✅`);
} catch (err) {
  console.error('\n❌ FAILED:', err.message);
  process.exitCode = 1;
} finally {
  const db = adminFs(admin);
  for (const id of created.tripIds) await db.recursiveDelete(db.doc(`trips/${id}`)).catch(() => {});
  for (const uid of created.uids) {
    await db.doc(`users/${uid}`).delete().catch(() => {});
    await adminAuth(admin).deleteUser(uid).catch(() => {});
  }
  console.log(`cleaned up ${created.uids.length} test users, ${created.tripIds.length} trip(s)`);
  process.exit();
}
