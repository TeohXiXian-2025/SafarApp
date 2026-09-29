// End-to-end test for Phases 6–7 (AI Arrange, prayer breaks, Split Tracks)
// against the REAL Firebase, Gemini, Google Places and Routes API, through a
// running API (npm run dev, or E2E_BASE_URL=https://…). Cleans up after itself.
// Usage: npm run e2e:phase6
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
const DAYS = ['2026-12-07', '2026-12-08'];

async function makeUser(name) {
  const u = await adminAuth(admin).createUser({ email: `e2e6-${run}-${name}@safar.test`, displayName: name });
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

const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const schedule = async (tripId) => (await db.collection(`trips/${tripId}/schedule`).get()).docs.map((d) => d.data());
// Prayer places, travel legs and re-timing are worked out in the background after the API
// answers: poll until `ready(items)` holds (or give up after `ms` and return the last read).
const overlapFree = (items) => { try { noOverlap(items); return true; } catch { return false; } };
const scheduleWhen = async (tripId, ready, ms = 30000) => {
  const until = Date.now() + ms;
  for (;;) {
    const items = await schedule(tripId);
    if (ready(items) || Date.now() > until) return items;
    await new Promise((r) => setTimeout(r, 1000));
  }
};
const ideaDoc = async (tripId, id) => (await db.doc(`trips/${tripId}/ideas/${id}`).get()).data();
// Stops never overlap each other. A prayer may fall inside a visit (prayed there — a prayer space on
// site or a short walk: A → pray → back to A), but no stop starts while a prayer is going on.
const noOverlap = (items) => {
  const main = items.filter((i) => !i.track.endsWith(':B') && !i.prayer).sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < main.length; i++) assert.ok(toMin(main[i].start) >= toMin(main[i - 1].end), `${main[i - 1].id} ${main[i - 1].start}-${main[i - 1].end} overlaps ${main[i].id} ${main[i].start}`);
  for (const p of items.filter((i) => i.prayer)) for (const m of main) assert.ok(!(toMin(m.start) > toMin(p.start) && toMin(m.start) < toMin(p.end)), `${m.id} starts ${m.start}, during ${p.id} ${p.start}-${p.end}`);
};

try {
  console.log(`\nPhases 6–7 e2e against ${BASE}`);
  const alice = await makeUser('Alice'); // admin, prays, needs certified halal
  const bob = await makeUser('Bob');
  const t = await alice.call('trips/create', {
    name: 'E2E KL Arrange',
    destinations: [{ name: 'Kuala Lumpur', placeId: 'ChIJ5-rvAcdJzDERfSgcL1uO2fQ', location: { lat: 3.139, lng: 101.6869 }, countryCode: 'MY' }],
    startDate: DAYS[0], endDate: DAYS[1], currency: 'MYR',
  });
  assert.equal(t.status, 201, JSON.stringify(t.body));
  const tripId = t.body.tripId;
  created.tripIds.push(tripId);
  const q = { tripId };
  const inv = await alice.call('invites/create', {}, q);
  assert.equal((await bob.call('invites/accept', { token: inv.body.token })).status, 200);
  const prefs = { halalRequired: true, halalTier: 'certified', prayerReminders: true, pace: 'moderate', interests: [], hotelPriorities: [] };
  await db.doc(`trips/${tripId}/members/${alice.uid}`).update({ prefs });
  await db.doc(`trips/${tripId}/members/${bob.uid}`).update({ prefs: { ...prefs, halalRequired: false, prayerReminders: false } });
  ok('trip: Alice (admin, prays, certified halal) + Bob');

  await alice.call('bookings/create', {
    source: 'manual',
    draft: { kind: 'hotel', carrier: 'E2E Hotel', travellerUids: [alice.uid, bob.uid], to: { name: 'Hotel Stripes Kuala Lumpur', location: { lat: 3.1579, lng: 101.6995 } }, startLocal: '2026-12-07T15:00', endLocal: '2026-12-08T12:00' },
  }, q);

  const queries = ['Petronas Twin Towers', 'Aquaria KLCC', 'Central Market Kuala Lumpur', 'KL Tower', 'Batu Caves', 'Thean Hou Temple Kuala Lumpur'];
  const ids = {};
  for (const name of queries) {
    const r = await alice.call('ideas/add', { placeId: await placeId(name) }, q);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    ids[name] = r.body.id;
    await alice.call('ideas/vote', { ideaId: r.body.id, value: 1 }, q);
    assert.equal((await bob.call('ideas/vote', { ideaId: r.body.id, value: 1 }, q)).body.status, 'backlog');
  }
  ok(`${queries.length} places approved → backlog`);

  // ── Split: a pork restaurant everyone likes, but Alice can't eat there ───────
  const dtf = await alice.call('ideas/add', { placeId: await placeId('Din Tai Fung Pavilion Kuala Lumpur') }, q);
  const dtfId = dtf.body.id;
  const an = await alice.call('ideas/analyze', { ideaId: dtfId }, q);
  assert.equal(an.status, 200, JSON.stringify(an.body));
  assert.ok(an.body.halal.flags.servesPork || an.body.halal.tier === 'not_halal', `radar: ${JSON.stringify(an.body.halal.flags)} ${an.body.halal.tier}`);
  ok(`Halal Radar: Din Tai Fung → ${an.body.halal.tier ?? 'no tier'}${an.body.halal.flags.servesPork ? ', serves pork' : ''}`);

  // Bob likes it; Alice can't eat there → 👎 (halal) → split votes → middle grounds.
  await bob.call('ideas/vote', { ideaId: dtfId, value: 1 }, q);
  assert.equal((await alice.call('ideas/vote', { ideaId: dtfId, value: -1, tag: 'halal' }, q)).body.status, 'mixed');
  let dIdea = await ideaDoc(tripId, dtfId);
  const halalAlts = dIdea.options.filter((o) => o.type === 'alternative');
  assert.ok(halalAlts.length >= 1 && halalAlts.every((o) => o.place.halalListed), JSON.stringify(dIdea.options.map((o) => o.title)));
  ok(`split votes → halal middle grounds for Alice: ${halalAlts.map((o) => `${o.place.name} (${o.place.walkMin} min)`).join(', ')}`);

  // "More options" swaps alternatives nobody picked.
  const more = await alice.call('ideas/options', { ideaId: dtfId, more: true }, q);
  assert.equal(more.status, 200);
  const moreAlts = more.body.options.filter((o) => o.type === 'alternative');
  assert.ok(moreAlts.every((o) => !halalAlts.some((h) => h.place.placeId === o.place.placeId)) || !moreAlts.length);
  const pick = moreAlts[0] ?? halalAlts[0];
  ok(`“more options” shows different places → ${moreAlts.map((o) => o.place.name).join(', ') || '(none left nearby)'}`);
  assert.equal((await alice.call('ideas/choose', { ideaId: dtfId, optionId: pick.id }, q)).status, 200);

  assert.equal((await bob.call('ideas/decide', { ideaId: dtfId, action: 'accept' }, q)).status, 403);
  assert.equal((await alice.call('ideas/decide', { ideaId: dtfId, action: 'accept' }, q)).status, 200);
  dIdea = await ideaDoc(tripId, dtfId);
  const split = (await db.doc(`trips/${tripId}/splits/${dIdea.splitId}`).get()).data();
  const trackB = split.tracks.find((t) => t.key === 'B');
  assert.deepEqual(split.tracks.find((t) => t.key === 'A').memberUids, [bob.uid]);
  assert.deepEqual(trackB.memberUids, [alice.uid]);
  const altId = trackB.ideaId;
  assert.equal((await ideaDoc(tripId, altId)).status, 'backlog');
  assert.equal(dIdea.status, 'backlog');
  ok(`admin accepted: Bob → Din Tai Fung, Alice → ${trackB.label} (${trackB.walkMin} min walk), meet after ${split.reunion.afterMinutes} min`);
  console.log(`     “${split.explanation}”`);

  // ── AI Arrange ────────────────────────────────────────────────────────────
  // Anyone may ask for a plan preview; only the admin applies it.
  const bobPlan = await bob.call('schedule/arrange', {}, q);
  assert.equal(bobPlan.status, 200, JSON.stringify(bobPlan.body));
  assert.equal((await bob.call('schedule/apply', { jobId: bobPlan.body.id }, q)).status, 403);
  const t0 = Date.now();
  const ar = await alice.call('schedule/arrange', {}, q);
  assert.equal(ar.status, 200, JSON.stringify(ar.body));
  const plan = ar.body.plan;
  const planned = plan.days.flatMap((d) => d.stops.map((s) => s.ideaId));
  assert.equal(planned.length + plan.unplaced.length, queries.length + 1, 'every stop placed or explained (pair counts once)');
  assert.ok(!planned.includes(altId), 'the alternative is planned with its original');
  assert.ok(plan.days.some((d) => d.prayers.length), 'prayer breaks for Alice');
  for (const d of plan.days) {
    // Stops and meals never overlap each other. A visit may hold a prayer (a prayer space on site /
    // a short walk: A → pray → back to A, the visit lengthened to fit), but never starts inside one.
    const all = [...d.stops.map((s) => [s.start, s.end, s.ideaId]), ...(d.meals ?? []).map((m) => [m.start, m.end, m.key])].sort();
    for (let i = 1; i < all.length; i++) assert.ok(toMin(all[i][0]) >= toMin(all[i - 1][1]), `${d.day}: ${all[i - 1]} overlaps ${all[i]}`);
    for (const [s, , id] of all) for (const p of d.prayers) assert.ok(!(toMin(s) > toMin(p.start) && toMin(s) < toMin(p.end)), `${d.day}: ${id} starts during ${p.key} ${p.start}-${p.end}`);
  }
  ok(`preview in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${plan.days.map((d) => `${d.day}: ${d.stops.length} stops + ${d.prayers.map((p) => `${p.key} ${p.start}`).join(', ')}${(d.meals ?? []).map((m) => ` + ${m.key} ${m.start} ${m.place?.name ?? '(no place)'}`).join('')}`).join(' | ')}; unplaced ${plan.unplaced.length}`);
  plan.days.forEach((d) => d.note && console.log(`     ${d.day}: ${d.note}`));
  assert.equal((await schedule(tripId)).filter((i) => !i.locked && !i.prayer).length, 0);
  ok('preview changes nothing');

  const ap = await alice.call('schedule/apply', { jobId: ar.body.id }, q);
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  let items = await scheduleWhen(tripId, (l) => l.some((i) => i.prayer?.facility) && l.filter((i) => i.transitFromPrev).length >= 2);
  const pair = items.filter((i) => i.track !== 'all');
  assert.equal(pair.length, split.tracks.length, 'split groups on the timeline');
  const a = pair.find((i) => i.track.endsWith(':A'));
  const b = pair.find((i) => i.track.endsWith(':B'));
  assert.deepEqual(b.memberUids, [alice.uid]);
  assert.equal(toMin(b.start) - toMin(a.start), trackB.walkMin);
  const prayers = items.filter((i) => i.prayer);
  assert.ok(prayers.length >= 1);
  assert.ok(prayers.every((p) => p.memberUids.length === 1 && p.memberUids[0] === alice.uid));
  assert.ok(prayers.some((p) => p.prayer.facility), 'a mosque / prayer room found');
  for (const day of DAYS) {
    try {
      noOverlap(items.filter((i) => i.day === day && !i.locked));
    } catch (err) {
      console.log('  DEBUG', day, items.filter((i) => i.day === day).sort((x, y) => x.start.localeCompare(y.start)).map((i) => `${i.id.slice(0, 14)} ${i.track.slice(-2)} ${i.start}-${i.end}${i.transitFromPrev ? ` leg${i.transitFromPrev.minutes}` : ''}`).join(' | '));
      throw err;
    }
  }
  assert.equal((await ideaDoc(tripId, dtfId)).status, 'scheduled');
  assert.equal((await ideaDoc(tripId, altId)).status, 'scheduled');
  ok(`applied: pair A ${a.start}–${a.end} / B ${b.start}–${b.end}; prayers ${prayers.map((p) => `${p.prayer.prayer} ${p.start} @ ${p.prayer.facility?.name ?? '?'} (${p.prayer.facility?.walkMin ?? '?'} min)`).join(', ')}`);
  const legs = items.filter((i) => i.transitFromPrev);
  assert.ok(legs.length >= 2);
  // Walks to prayer places are measured too (the prayer card shows them); track B walks with its pair.
  assert.ok(!legs.some((i) => i.track.endsWith(':B')));
  ok(`${legs.length} travel legs from the Routes API (${legs.filter((i) => i.prayer).length} to prayer places, none for track B)`);

  // ── Manual edits keep prayers + pairs consistent ──────────────────────────
  const pr = prayers[0];
  assert.equal((await alice.call('schedule/remove', { id: pr.id }, q)).status, 409);
  ok('prayer breaks can’t be removed by hand');

  const day = a.day;
  const dayStops = items.filter((i) => i.day === day && !i.locked && !i.prayer && !i.track.endsWith(':B')).sort((x, y) => x.start.localeCompare(y.start));
  const reversed = dayStops.map((i) => i.id).reverse();
  const ro = await alice.call('schedule/reorder', { day, order: reversed }, q);
  assert.equal(ro.status, 200, JSON.stringify(ro.body));
  items = await scheduleWhen(tripId, (l) => overlapFree(l.filter((i) => i.day === day && !i.locked)));
  noOverlap(items.filter((i) => i.day === day && !i.locked));
  const a2 = items.find((i) => i.id === a.id);
  const b2 = items.find((i) => i.id === b.id);
  assert.equal(toMin(b2.start) - toMin(a2.start), toMin(b.start) - toMin(a.start));
  ok(`reordered ${day} → ${items.filter((i) => i.day === day && !i.track.endsWith(':B')).sort((x, y) => x.start.localeCompare(y.start)).map((i) => `${i.start}${i.prayer ? '🕌' : i.locked ? '🔒' : ''}`).join(' ')}; pair moved together; no overlaps`);

  const mv = await alice.call('schedule/update', { id: b.id, day: DAYS.find((d) => d !== day), start: '10:00' }, q);
  assert.equal(mv.status, 200, JSON.stringify(mv.body));
  const toDay = DAYS.find((d) => d !== day);
  items = await scheduleWhen(tripId, (l) => overlapFree(l.filter((i) => i.day === toDay && !i.locked)));
  assert.equal(items.find((i) => i.id === a.id).day, items.find((i) => i.id === b.id).day);
  // B asked for 10:00; on a busy day the pair may move later (it can't overlap the stop before it) — never earlier.
  const [a3, b3] = [items.find((i) => i.id === a.id), items.find((i) => i.id === b.id)];
  assert.equal(toMin(b3.start) - toMin(a3.start), trackB.walkMin);
  assert.ok(toMin(b3.start) >= 10 * 60, b3.start);
  noOverlap(items.filter((i) => i.day === a3.day && !i.locked));
  ok(`moving track B moves the pair (A now ${items.find((i) => i.id === a.id).day} ${items.find((i) => i.id === a.id).start})`);

  // ── Undo ──────────────────────────────────────────────────────────────────
  const un = await alice.call('schedule/undo', { jobId: ar.body.id }, q);
  assert.equal(un.status, 200, JSON.stringify(un.body));
  items = await schedule(tripId);
  assert.equal(items.filter((i) => !i.locked && !i.prayer).length, 0);
  assert.equal((await ideaDoc(tripId, dtfId)).status, 'backlog');
  ok('undo restores the timeline as it was (empty) and the ideas to the backlog');

  // ── Alice rejoins the main group → the split ends ──────────────────────────
  assert.equal((await alice.call('ideas/optin', { ideaId: dtfId }, q)).status, 200);
  assert.equal(await ideaDoc(tripId, altId), undefined);
  const orig = await ideaDoc(tripId, dtfId);
  assert.equal(orig.status, 'backlog');
  assert.equal(orig.splitId, undefined);
  ok('when Alice rejoins the group the alternative goes and the split ends');

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
