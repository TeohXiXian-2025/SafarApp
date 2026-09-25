// End-to-end test for the idea → vote → middle ground → admin flow (Option 3)
// and its edge cases, against the REAL Firebase + Google Places through a
// running API (npm run dev, or E2E_BASE_URL=https://…). Cleans up after itself.
// Usage: npm run e2e:voting
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
  const u = await adminAuth(admin).createUser({ email: `e2ev-${run}-${name}@safar.test`, displayName: name });
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

const idea = async (tripId, id) => (await db.doc(`trips/${tripId}/ideas/${id}`).get()).data();
const splitOf = async (tripId, i) => (i.splitId ? (await db.doc(`trips/${tripId}/splits/${i.splitId}`).get()).data() : null);
const tracks = (s) => Object.fromEntries(s.tracks.map((t) => [t.key, t.memberUids]));

try {
  console.log(`\nVoting flow e2e against ${BASE}`);
  const [alice, bob, cara, dan, eve] = await Promise.all(['Alice', 'Bob', 'Cara', 'Dan', 'Eve'].map(makeUser));
  const t = await alice.call('trips/create', {
    name: 'E2E Voting',
    destinations: [{ name: 'Kuala Lumpur', placeId: 'ChIJ5-rvAcdJzDERfSgcL1uO2fQ', location: { lat: 3.139, lng: 101.6869 }, countryCode: 'MY' }],
    startDate: '2026-12-07', endDate: '2026-12-08', currency: 'MYR',
  });
  const tripId = t.body.tripId;
  created.tripIds.push(tripId);
  const q = { tripId };
  const inv = await alice.call('invites/create', {}, q);
  for (const u of [bob, cara, dan]) assert.equal((await u.call('invites/accept', { token: inv.body.token })).status, 200);
  const base = { halalRequired: false, halalTier: 'certified', prayerReminders: false, pace: 'moderate', interests: [], hotelPriorities: [] };
  await db.doc(`trips/${tripId}/members/${alice.uid}`).update({ prefs: { ...base, halalRequired: true, prayerReminders: true } });
  for (const u of [bob, cara, dan]) await db.doc(`trips/${tripId}/members/${u.uid}`).update({ prefs: base });
  ok('trip: Alice (admin, halal, prays), Bob, Cara, Dan');

  // ── Voting rules ────────────────────────────────────────────────────────
  const towers = (await alice.call('ideas/add', { placeId: await placeId('Petronas Twin Towers') }, q)).body.id;
  const i0 = await idea(tripId, towers);
  assert.deepEqual([...i0.voters].sort(), [alice.uid, bob.uid, cara.uid, dan.uid].sort());
  assert.ok(i0.votingEndsAt - Date.now() > 23 * 3600e3);
  ok('a new idea records who must vote and closes in 24 h');

  assert.equal((await bob.call('ideas/vote', { ideaId: towers, value: -1 }, q)).status, 400);
  assert.equal((await bob.call('ideas/vote', { ideaId: towers, value: -1, tag: 'other' }, q)).status, 400);
  assert.equal((await bob.call('ideas/vote', { ideaId: towers, value: -1, tag: 'too_expensive', reason: 'RM 98 for the skybridge' }, q)).status, 200);
  ok('👎 needs a reason (typed text for "Other")');

  // Eve joins after the idea was added: not waited for.
  assert.equal((await eve.call('invites/accept', { token: inv.body.token })).status, 200);
  await db.doc(`trips/${tripId}/members/${eve.uid}`).update({ prefs: base });
  await alice.call('ideas/vote', { ideaId: towers, value: 1 }, q);
  await cara.call('ideas/vote', { ideaId: towers, value: 1 }, q);
  assert.equal((await idea(tripId, towers)).status, 'voting');
  const v = await dan.call('ideas/vote', { ideaId: towers, value: -1, tag: 'been_before' }, q);
  assert.equal(v.body.status, 'mixed');
  let i1 = await idea(tripId, towers);
  assert.ok(i1.choiceEndsAt - Date.now() > 23 * 3600e3);
  const alts = i1.options.filter((o) => o.type === 'alternative');
  assert.ok(alts.length >= 1, JSON.stringify(i1.options));
  assert.ok(i1.options.some((o) => o.type === 'join') && i1.options.some((o) => o.type === 'free_time'));
  ok(`split votes once the 4 original members voted (Eve, who joined later, isn't waited for); options: ${i1.options.map((o) => o.title).join(' | ')}`);

  // ── Choosing ────────────────────────────────────────────────────────────
  assert.equal((await alice.call('ideas/choose', { ideaId: towers, optionId: alts[0].id }, q)).status, 403);
  assert.equal((await bob.call('ideas/choose', { ideaId: towers, optionId: 'nope' }, q)).status, 400);
  assert.equal((await bob.call('ideas/choose', { ideaId: towers, optionId: alts[0].id, note: 'cheaper' }, q)).status, 200);
  assert.equal((await dan.call('ideas/choose', { ideaId: towers, optionId: 'free' }, q)).status, 200);
  ok('only people who voted 👎 choose; Bob → ' + alts[0].place.name + ', Dan → free time');

  // Suggesting your own alternative: picked for you, pickable by the others not going.
  const aquaria = { placeId: await placeId('Aquaria KLCC'), name: 'Aquaria KLCC', location: { lat: 3.1537, lng: 101.7131 } };
  assert.equal((await alice.call('ideas/propose', { ideaId: towers, place: aquaria }, q)).status, 403);
  const pr = await bob.call('ideas/propose', { ideaId: towers, place: aquaria }, q);
  assert.equal(pr.status, 201, JSON.stringify(pr.body));
  let withOwn = await idea(tripId, towers);
  assert.equal(withOwn.choices[bob.uid].optionId, pr.body.optionId);
  assert.ok(withOwn.options.some((o) => o.id === pr.body.optionId && o.proposedBy === bob.uid));
  assert.equal((await dan.call('ideas/choose', { ideaId: towers, optionId: pr.body.optionId }, q)).status, 200);
  await bob.call('ideas/choose', { ideaId: towers, optionId: alts[0].id }, q);
  await dan.call('ideas/choose', { ideaId: towers, optionId: 'free' }, q);
  ok('someone not going suggests their own place (Aquaria KLCC); it is picked for them and others can pick it too');

  // Changing votes while split: 👎 → 👍 drops the choice; 👍 → 👎 must choose again.
  await dan.call('ideas/vote', { ideaId: towers, value: 1 }, q);
  i1 = await idea(tripId, towers);
  assert.equal(i1.status, 'mixed');
  assert.equal(i1.choices[dan.uid], undefined);
  await dan.call('ideas/vote', { ideaId: towers, value: -1, tag: 'timing' }, q);
  assert.equal((await idea(tripId, towers)).choices[dan.uid], undefined);
  await dan.call('ideas/choose', { ideaId: towers, optionId: 'free' }, q);
  ok('changing a vote during split votes updates who has to choose');

  // Taking a vote back (before the deadline) means "wait for me" again; voting again settles it.
  await dan.call('ideas/vote', { ideaId: towers, value: 0 }, q);
  assert.equal((await idea(tripId, towers)).status, 'voting');
  await dan.call('ideas/vote', { ideaId: towers, value: -1, tag: 'timing' }, q);
  assert.equal((await idea(tripId, towers)).status, 'mixed');
  await dan.call('ideas/choose', { ideaId: towers, optionId: 'free' }, q);
  ok('taking a vote back waits for that person again; voting again returns to split votes');

  // Eve (late joiner) votes 👍 — her vote counts (3 👍 vs 2 👎, still split, not a majority no).
  await eve.call('ideas/vote', { ideaId: towers, value: 1 }, q);
  i1 = await idea(tripId, towers);
  assert.equal(i1.status, 'mixed');
  assert.equal(i1.votes[eve.uid].value, 1);
  ok('a later joiner who votes is counted');

  // ── Admin accepts → groups ───────────────────────────────────────────────
  assert.equal((await bob.call('ideas/decide', { ideaId: towers, action: 'accept' }, q)).status, 403);
  assert.equal((await alice.call('ideas/decide', { ideaId: towers, action: 'accept' }, q)).status, 200);
  i1 = await idea(tripId, towers);
  assert.equal(i1.status, 'backlog');
  let s1 = await splitOf(tripId, i1);
  let tr = tracks(s1);
  assert.deepEqual([...tr.A].sort(), [alice.uid, cara.uid, eve.uid].sort());
  assert.deepEqual(tr.F, [dan.uid]);
  const altUids = s1.tracks.filter((x) => x.key === 'B' || x.key === 'C').flatMap((x) => x.memberUids).sort();
  assert.deepEqual(altUids, [bob.uid]);
  for (const x of s1.tracks.filter((x) => x.ideaId && x.key !== 'A')) assert.equal((await idea(tripId, x.ideaId)).status, 'backlog');
  ok(`accepted with groups: ${s1.tracks.map((x) => `${x.key}=${x.memberUids.length}`).join(' ')} — “${s1.explanation}”`);

  assert.equal((await bob.call('ideas/vote', { ideaId: towers, value: 1 }, q)).status, 409);
  ok('votes are locked after the admin decides');

  // ── Opting out / back in after acceptance ────────────────────────────────
  await cara.call('ideas/options', { ideaId: towers }, q);
  assert.equal((await cara.call('ideas/optout', { ideaId: towers, optionId: 'free', note: 'tired' }, q)).status, 200);
  s1 = await splitOf(tripId, await idea(tripId, towers));
  assert.deepEqual([...tracks(s1).F].sort(), [cara.uid, dan.uid].sort());
  assert.deepEqual([...tracks(s1).A].sort(), [alice.uid, eve.uid].sort());
  assert.equal((await cara.call('ideas/optin', { ideaId: towers }, q)).status, 200);
  s1 = await splitOf(tripId, await idea(tripId, towers));
  assert.deepEqual([...tracks(s1).A].sort(), [alice.uid, cara.uid, eve.uid].sort());
  ok("\"I can't go\" moves Cara to free time without approval; opting back in returns her");

  // Schedule the split, then Bob leaves the trip → his group disappears everywhere.
  assert.equal((await alice.call('schedule/add', { ideaId: towers, day: '2026-12-07', start: '10:00' }, q)).status, 201);
  let items = (await db.collection(`trips/${tripId}/schedule`).get()).docs.map((d) => d.data()).filter((i) => i.track !== 'all');
  assert.equal(items.length, s1.tracks.length);
  const bobTrack = s1.tracks.find((x) => x.memberUids.includes(bob.uid));
  const bobOnly = bobTrack.memberUids.length === 1;
  assert.equal((await bob.call('members/leave', {}, q)).status, 200);
  s1 = await splitOf(tripId, await idea(tripId, towers));
  assert.ok(!s1.tracks.some((x) => x.memberUids.includes(bob.uid)));
  if (bobOnly) assert.equal(await idea(tripId, bobTrack.ideaId), undefined);
  items = (await db.collection(`trips/${tripId}/schedule`).get()).docs.map((d) => d.data());
  assert.ok(items.every((i) => !i.memberUids.includes(bob.uid)));
  assert.equal(items.filter((i) => i.track !== 'all').length, s1.tracks.length);
  ok(`Bob leaves → removed from groups and the timeline (${bobOnly ? 'his solo group and alternative are gone' : 'his group stays with the others'})`);

  // Everyone out of side groups → the split ends.
  for (const u of [dan, eve]) await u.call('ideas/optin', { ideaId: towers }, q);
  const i2 = await idea(tripId, towers);
  assert.equal(i2.splitId, undefined);
  items = (await db.collection(`trips/${tripId}/schedule`).get()).docs.map((d) => d.data()).filter((i) => i.ref.kind === 'idea' || i.ref.kind === 'custom');
  assert.ok(items.some((i) => i.id === `idea_${towers}` && i.track === 'all'));
  ok('when everyone is back in the main group the split ends and the stop is a normal one');

  // ── Most of the group says no → backup, not a split ────────────────────
  const klTower = (await alice.call('ideas/add', { placeId: await placeId('Thean Hou Temple Kuala Lumpur') }, q)).body.id;
  await alice.call('ideas/vote', { ideaId: klTower, value: 1 }, q);
  for (const u of [cara, dan, eve]) await u.call('ideas/vote', { ideaId: klTower, value: -1, tag: 'not_interested' }, q);
  assert.equal((await idea(tripId, klTower)).status, 'backup');
  ok('1 👍 vs 3 👎 → kept as a backup instead of splitting the group');

  // ── Confirm at vote time ───────────────────────────────────────────────
  const dtf = (await cara.call('ideas/add', { placeId: await placeId('Din Tai Fung Pavilion Kuala Lumpur') }, q)).body.id;
  const an = await cara.call('ideas/analyze', { ideaId: dtf }, q);
  assert.equal(an.status, 200, JSON.stringify(an.body));
  const noAck = await alice.call('ideas/vote', { ideaId: dtf, value: 1 }, q);
  assert.equal(noAck.status, 409);
  assert.equal(noAck.body.details.code, 'confirm');
  assert.ok(noAck.body.details.conflicts.length);
  assert.equal((await alice.call('ideas/vote', { ideaId: dtf, value: 1, ack: 'I will only have tea' }, q)).status, 200);
  const ack = (await idea(tripId, dtf)).votes[alice.uid].ack;
  assert.ok(/pork|halal|not_friendly/.test(ack.key), ack.key);
  ok(`a 👍 despite a conflict must be confirmed (${noAck.body.details.conflicts.map((c) => c.detail).join(' ')}) — stored with key “${ack.key}”`);
  assert.equal((await bob.call('ideas/vote', { ideaId: dtf, value: 1 }, q)).status, 403);
  ok('a member who left can no longer vote');

  // ── Deadline, backup, reopen ─────────────────────────────────────────────
  const market = (await cara.call('ideas/add', { placeId: await placeId('Central Market Kuala Lumpur') }, q)).body.id;
  await cara.call('ideas/vote', { ideaId: market, value: 1 }, q);
  await db.doc(`trips/${tripId}/ideas/${market}`).update({ votingEndsAt: Date.now() - 1000 });
  assert.equal((await dan.call('ideas/sweep', {}, q)).body.closed, 1);
  assert.equal((await idea(tripId, market)).status, 'backlog');
  ok('after 24 h, non-voters abstain: one 👍 → backlog');

  const tower = (await cara.call('ideas/add', { placeId: await placeId('KL Tower') }, q)).body.id;
  await cara.call('ideas/vote', { ideaId: tower, value: 1 }, q);
  await dan.call('ideas/vote', { ideaId: tower, value: -1, tag: 'too_far' }, q);
  assert.equal((await alice.call('ideas/decide', { ideaId: tower, action: 'close' }, q)).body.status, 'mixed');
  assert.equal((await alice.call('ideas/decide', { ideaId: tower, action: 'backup' }, q)).status, 200);
  assert.equal((await idea(tripId, tower)).status, 'backup');
  assert.equal((await alice.call('ideas/decide', { ideaId: tower, action: 'reopen' }, q)).status, 200);
  const reopened = await idea(tripId, tower);
  assert.equal(reopened.status, 'voting');
  assert.equal(reopened.options, undefined);
  ok('admin closes voting early → split votes → backup → reopen for a new vote');

  // Removing the only person still to vote settles the idea.
  const cave = (await alice.call('ideas/add', { placeId: await placeId('Batu Caves') }, q)).body.id;
  for (const u of [alice, cara]) await u.call('ideas/vote', { ideaId: cave, value: 1 }, q);
  await eve.call('ideas/vote', { ideaId: cave, value: 1 }, q);
  assert.equal((await idea(tripId, cave)).status, 'voting'); // waiting for Dan
  assert.equal((await alice.call('members/remove', { uid: dan.uid }, q)).status, 200);
  assert.equal((await idea(tripId, cave)).status, 'backlog');
  ok('removing the last person still to vote settles the idea');

  // ── Comments ────────────────────────────────────────────────────────────
  const c = await cara.call('ideas/comment', { ideaId: cave, text: 'Wear shoes you can climb 272 steps in!' }, q);
  assert.equal(c.status, 201);
  assert.equal((await eve.call('ideas/comment-delete', { ideaId: cave, commentId: c.body.id }, q)).status, 403);
  assert.equal((await cara.call('ideas/comment-delete', { ideaId: cave, commentId: c.body.id }, q)).status, 200);
  ok('comments: anyone can post, only the author (or admin) deletes');

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
