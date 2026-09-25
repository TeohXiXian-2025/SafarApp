// End-to-end test for Phase 4 (Idea Board, Halal Radar, voting) against the
// REAL Firebase, Gemini, Google Places, Foursquare and OSM, through a running
// API (npm run dev, or E2E_BASE_URL=https://…). Cleans up after itself.
// Usage: npm run e2e:phase4
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { cert, initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFs } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { doc, getDoc, getFirestore, updateDoc } from 'firebase/firestore';

config({ path: '.env.local', quiet: true });
const env = process.env;
const BASE = env.E2E_BASE_URL ?? 'http://localhost:5173';
const sa = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
const admin = initAdmin({ credential: cert(sa) }, 'admin');
const webConfig = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID };

const run = Date.now().toString(36);
const created = { uids: [], tripIds: [], placeKeys: [] };
let passed = 0;
const ok = (m) => (passed++, console.log(`  ✅ ${m}`));

async function makeUser(name) {
  const u = await adminAuth(admin).createUser({ email: `e2e4-${run}-${name}@safar.test`, displayName: name });
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
  return { uid: u.uid, db: getFirestore(app), call };
}
const idea = async (tripId, id) => (await adminFs(admin).doc(`trips/${tripId}/ideas/${id}`).get()).data();

try {
  console.log(`\nPhase 4 e2e against ${BASE}`);
  const alice = await makeUser('Alice');
  const bob = await makeUser('Bob');
  const cara = await makeUser('Cara');

  const t = await alice.call('trips/create', {
    name: 'E2E Tokyo Food',
    destinations: [{ name: 'Tokyo', placeId: 'ChIJXSModoWLGGARILWiCfeu2M0', location: { lat: 35.6764, lng: 139.65 }, countryCode: 'JP' }],
    startDate: '2026-12-01', endDate: '2026-12-06', currency: 'MYR',
  });
  const tripId = t.body.tripId;
  created.tripIds.push(tripId);
  const q = { tripId };
  const inv = await alice.call('invites/create', {}, q);
  await bob.call('invites/accept', { token: inv.body.token });
  await cara.call('invites/accept', { token: inv.body.token });
  ok('trip with 3 members');

  // ── Import ─────────────────────────────────────────────────────────
  assert.equal((await alice.call('ideas/import', { url: 'https://example.com/post' }, q)).status, 400);
  ok('non-social links rejected (no arbitrary server fetches)');

  const t0 = Date.now();
  const imp = await alice.call('ideas/import', {
    text: 'Tokyo halal food crawl 🇯🇵🍜 1) Gyumon Halal Wagyu Ramen in Kabukicho — the wagyu broth is insane 2) sunset at Shibuya Sky 3) Senso-ji temple early morning before crowds #tokyotravel #halaltokyo',
  }, q);
  assert.equal(imp.status, 200, JSON.stringify(imp.body));
  const names = imp.body.candidates.map((c) => c.place.name);
  assert.ok(imp.body.candidates.length >= 3, `got ${names}`);
  assert.ok(imp.body.candidates.every((c) => c.distanceKm < 60), 'all near Tokyo');
  ok(`caption → ${imp.body.candidates.length} places in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${names.join(' | ')}`);

  const tk = await alice.call('ideas/import', { url: 'https://www.tiktok.com/@scout2015/video/6718335390845095173' }, q);
  assert.equal(tk.status, 200);
  assert.equal(tk.body.source.type, 'tiktok');
  assert.ok(tk.body.source.caption);
  ok(`TikTok link → caption read via oEmbed (${tk.body.candidates.length} places — it's a pet video)`);

  // ── Add + dedupe ───────────────────────────────────────────────────
  const gyumon = imp.body.candidates.find((c) => /gyumon|牛門/i.test(c.place.name));
  assert.ok(gyumon, 'Gyumon found');
  const add = await bob.call('ideas/add', { placeId: gyumon.place.placeId, source: { ...imp.body.source } }, q);
  assert.equal(add.status, 201, JSON.stringify(add.body));
  const ideaId = add.body.id;
  const dup = await alice.call('ideas/add', { placeId: gyumon.place.placeId }, q);
  assert.equal(dup.body.duplicate, true);
  assert.equal(dup.body.id, ideaId);
  const i1 = await idea(tripId, ideaId);
  created.placeKeys.push(i1.placeKey);
  assert.equal(i1.place.category, 'food');
  assert.equal(i1.status, 'voting');
  ok(`added "${i1.place.name}" (${i1.place.typeLabel}, ★${i1.place.rating}); duplicate add returns the same idea`);

  // ── Halal Radar + reviews ──────────────────────────────────────────
  const t1 = Date.now();
  const an = await alice.call('ideas/analyze', { ideaId, force: true }, q);
  assert.equal(an.status, 200, JSON.stringify(an.body));
  const i2 = await idea(tripId, ideaId);
  assert.equal(i2.halal.verdict, 'friendly');
  assert.equal(i2.halal.source, 'google');
  assert.equal(i2.analysis.status, 'done');
  ok(`Halal Radar in ${((Date.now() - t1) / 1000).toFixed(1)}s: ${i2.halal.verdict}${i2.halal.tier ? ` / ${i2.halal.tier}` : ''} via ${i2.halal.source} — "${i2.halal.reasons.slice(0, 2).join('" · "')}"`);
  assert.ok(i2.sentiment?.verdict);
  ok(`reviews: ${i2.sentiment.verdict} (${i2.sentiment.basedOn}) + ${i2.sentiment.pros[0] ?? ''}`);

  const shibuya = imp.body.candidates.find((c) => /shibuya sky/i.test(c.place.name)) ?? imp.body.candidates.find((c) => c.place.placeId !== gyumon.place.placeId);
  const add2 = await alice.call('ideas/add', { placeId: shibuya.place.placeId, source: { type: 'text' } }, q);
  const idea2 = add2.body.id;
  created.placeKeys.push((await idea(tripId, idea2)).placeKey);
  const an2 = await alice.call('ideas/analyze', { ideaId: idea2 }, q);
  assert.equal(an2.status, 200);
  const i3 = await idea(tripId, idea2);
  ok(`non-food "${i3.place.name}" (${i3.place.category}): ${i3.halal.verdict} — ${i3.halal.reasons[0] ?? 'no concerns'}`);

  // ── Voting ─────────────────────────────────────────────────────────
  await alice.call('ideas/vote', { ideaId, value: 1 }, q);
  await bob.call('ideas/vote', { ideaId, value: 1 }, q);
  assert.equal((await idea(tripId, ideaId)).status, 'voting');
  const v3 = await cara.call('ideas/vote', { ideaId, value: 1 }, q);
  assert.equal(v3.body.status, 'backlog');
  ok('3/3 👍 → backlog');

  await alice.call('ideas/vote', { ideaId: idea2, value: 1 }, q);
  await bob.call('ideas/vote', { ideaId: idea2, value: -1, tag: 'too_expensive', reason: 'too expensive' }, q);
  assert.equal((await cara.call('ideas/vote', { ideaId: idea2, value: 1 }, q)).body.status, 'mixed');
  assert.equal((await idea(tripId, idea2)).votes[bob.uid].reason, 'too expensive');
  ok('2 👍 + 1 👎 → mixed (Split Track candidate), reason stored');

  await bob.call('ideas/vote', { ideaId: idea2, value: 0 }, q);
  assert.equal((await idea(tripId, idea2)).status, 'voting');
  ok('taking a vote back → voting again');

  assert.equal((await bob.call('ideas/decide', { ideaId: idea2, action: 'backlog' }, q)).status, 403);
  const dec = await alice.call('ideas/decide', { ideaId: idea2, action: 'close' }, q);
  assert.equal(dec.body.status, 'backlog');
  assert.equal((await bob.call('ideas/vote', { ideaId: idea2, value: -1, tag: 'too_expensive' }, q)).status, 409);
  ok('admin closed voting early (non-voters abstain) → backlog; members can no longer vote; non-admin decide → 403');

  // Member leaves → pending vote no longer blocks
  const senso = imp.body.candidates.find((c) => /sens[oō]/i.test(c.place.name));
  if (senso) {
    const a3 = await alice.call('ideas/add', { placeId: senso.place.placeId }, q);
    created.placeKeys.push((await idea(tripId, a3.body.id)).placeKey);
    await alice.call('ideas/vote', { ideaId: a3.body.id, value: 1 }, q);
    await bob.call('ideas/vote', { ideaId: a3.body.id, value: 1 }, q);
    await cara.call('members/leave', {}, q);
    assert.equal((await idea(tripId, a3.body.id)).status, 'backlog');
    ok('Cara left → idea waiting only on her vote is decided (backlog)');
  }

  // ── Community halal reports ────────────────────────────────────────
  await alice.call('halal/report', { ideaId, tier: 'muslim_owned', flags: { servesAlcohol: false } }, q);
  const s1 = (await getDoc(doc(bob.db, `halalSummary/${i1.placeKey}`))).data();
  assert.equal(s1.reportCount, 1);
  assert.equal(s1.tier, undefined);
  const r2 = await bob.call('halal/report', { ideaId, tier: 'muslim_owned', flags: { servesAlcohol: false }, note: 'Staff confirmed halal wagyu' }, q);
  assert.equal(r2.body.tier, 'muslim_owned');
  assert.equal(r2.body.flags.servesAlcohol, false);
  ok('2 matching community reports → consensus "muslim_owned", no alcohol (readable by any signed-in user)');
  await assert.rejects(getDoc(doc(bob.db, `halalReports/${i1.placeKey}/reports/${alice.uid}`)));
  ok("individual reports aren't readable by clients");

  // ── Permissions ────────────────────────────────────────────────────
  await assert.rejects(updateDoc(doc(bob.db, `trips/${tripId}/ideas/${ideaId}`), { status: 'backlog' }));
  ok('clients cannot write ideas directly');
  const del = await bob.call('ideas/delete', { ideaId: idea2 }, q);
  assert.equal(del.status, 403);
  assert.equal((await bob.call('ideas/delete', { ideaId }, q)).status, 200);
  ok("only the suggester or admin can delete (Bob deleted his own, not Alice's)");

  console.log(`\n${passed} checks passed ✅`);
} catch (err) {
  console.error('\n❌ FAILED:', err.message);
  process.exitCode = 1;
} finally {
  const db = adminFs(admin);
  for (const id of created.tripIds) {
    await db.recursiveDelete(db.doc(`trips/${id}`)).catch(() => {});
    const inv = await db.collection('inviteTokens').where('tripId', '==', id).get();
    await Promise.all(inv.docs.map((d) => d.ref.delete()));
  }
  for (const k of created.placeKeys) {
    await db.recursiveDelete(db.doc(`halalReports/${k}`)).catch(() => {});
    await db.doc(`halalSummary/${k}`).delete().catch(() => {});
    await db.doc(`placesCache/${k}`).delete().catch(() => {});
  }
  for (const uid of created.uids) await adminAuth(admin).deleteUser(uid).catch(() => {});
  console.log('cleaned up');
  process.exit();
}
