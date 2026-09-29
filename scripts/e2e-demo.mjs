// End-to-end test of the demo trip, against a running API (npm run dev) and
// the REAL Firebase: a guest starts the demo and plays the whole Trip Quest
// through the API with the demo kit files, while the server's travel mates
// answer. Then the guest and the trip are deleted.
//
// Recording the demo kit's AI answers (api/_lib/demoAnswers.ts): run the API
// with DEMO_RECORD=1 and run this once. Later runs replay them (no AI calls).
// Usage: npm run e2e:demo
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { cert, initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';

config({ path: '.env.local', quiet: true });
const env = process.env;
const BASE = env.E2E_BASE_URL ?? 'http://localhost:5173';
const sa = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
const admin = initAdmin({ credential: cert(sa), storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET }, 'admin');
const db = getFirestore(admin);
const bucket = getStorage(admin).bucket();
const webConfig = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID };

let passed = 0;
const ok = (m) => (passed++, console.log(`  ✅ ${m}`));
const note = (m) => console.log(`  ·  ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KIT = 'public/demo-kit/';
const TYPES = { pdf: 'application/pdf', png: 'image/png' };

let guest = null;
let tripId = null;

async function until(what, read, ready, ms = 60000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await read();
    if (ready(v)) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(1500);
  }
}

try {
  console.log(`\nDemo trip e2e against ${BASE}`);

  // ── Start ────────────────────────────────────────────────────────────────
  const start = await fetch(new URL('/api/demo/start', BASE), { method: 'POST' });
  const started = await start.json();
  assert.equal(start.status, 201, JSON.stringify(started));
  tripId = started.tripId;
  assert.ok(tripId.startsWith('demo_'));
  const app = initializeApp(webConfig, `guest-${Date.now()}`);
  const cred = await signInWithCustomToken(getAuth(app), started.token);
  guest = cred.user.uid;
  const idToken = await cred.user.getIdToken();
  const call = async (path, body = {}) => {
    const url = new URL(`/api/${path}`, BASE);
    url.searchParams.set('tripId', tripId);
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const upload = async (file, folder) => {
    const path = `trips/${tripId}/users/${guest}/${folder}/${Date.now()}-${file}`;
    await bucket.file(path).save(readFileSync(KIT + file), { contentType: TYPES[file.split('.').pop()] });
    return path;
  };
  const trip = (await db.doc(`trips/${tripId}`).get()).data();
  assert.equal(trip.adminId, guest);
  assert.equal(trip.status, 'planning');
  assert.ok(trip.demo.expiresAt > Date.now() + 47 * 3600_000);
  const members = (await db.collection(`trips/${tripId}/members`).get()).docs.map((d) => d.data());
  assert.deepEqual(members.map((m) => m.displayName).sort(), ['Aisyah', 'Aminah', 'Daniel', 'Farid']);
  const ideas0 = (await db.collection(`trips/${tripId}/ideas`).get()).docs.map((d) => d.data());
  const ichiran = ideas0.find((i) => /ichiran/i.test(i.place.name));
  assert.equal(ichiran?.status, 'voting');
  assert.ok(ichiran.votingEndsAt > Date.now(), 'the vote is open (times moved to now)');
  ok(`guest ${guest} + own copy ${tripId}: 4 people, ${ideas0.length} ideas (Tower Records in the Reserve), Ichiran waiting for Aisyah's vote`);

  // ── Bookings: flight e-ticket, two hotels, the Shinkansen ─────────────────
  const addBooking = async (file) => {
    const path = await upload(file, 'bookings');
    const t0 = Date.now();
    const parsed = await call('bookings/parse', { storagePath: path });
    assert.equal(parsed.status, 200, JSON.stringify(parsed.body));
    for (const d of parsed.body.drafts) {
      const saved = await call('bookings/create', { draft: d.draft ?? d, source: 'upload', fileRef: path, parseConfidence: parsed.body.confidence });
      assert.ok(saved.status < 300, `${file}: ${JSON.stringify(saved.body)}`);
    }
    return { n: parsed.body.drafts.length, ms: Date.now() - t0, drafts: parsed.body.drafts.map((d) => d.draft ?? d) };
  };
  const flight = await addBooking('01-flight-e-ticket-MH-6KQ2PX.pdf');
  assert.equal(flight.n, 2, 'a return ticket is two flights');
  const [out, back] = flight.drafts.sort((a, b) => a.startLocal.localeCompare(b.startLocal));
  assert.equal(out.startLocal, '2026-12-07T09:25');
  assert.equal(out.endLocal, '2026-12-07T17:30');
  assert.equal(back.startLocal, '2026-12-13T17:15');
  assert.equal(out.travellerUids?.length, 4, 'all four travellers matched by name');
  ok(`flight e-ticket → 2 flights (MH 88 09:25→17:30, MH 53 17:15), 4 travellers matched (${flight.ms} ms)`);
  for (const f of ['02-hotel-Richmond-Asakusa.pdf', '03-shinkansen-Nozomi-21.png', '04-hotel-Granvia-Kyoto.pdf']) {
    const r = await addBooking(f);
    note(`${f}: ${r.drafts.map((d) => `${d.kind} ${d.startLocal}→${d.endLocal}`).join(', ')} (${r.ms} ms)`);
  }
  const bookings = (await db.collection(`trips/${tripId}/bookings`).get()).docs.map((d) => d.data());
  const train = bookings.find((b) => b.kind === 'train');
  assert.equal(bookings.filter((b) => b.kind === 'hotel').length, 2);
  assert.equal(train.startLocal, '2026-12-10T09:00');
  assert.equal(train.endLocal, '2026-12-10T11:15');
  ok('2 hotels + Nozomi 21 (09:00→11:15) saved as fixed times');

  // ── The Instagram reel (a real link) → ideas; the mates vote ─────────────
  const imported = await call('ideas/import', { url: 'https://www.instagram.com/morgane_bblt/reel/C7bkjq_xL5M/?igsh=demo' });
  assert.equal(imported.status, 200, JSON.stringify(imported.body));
  const found = imported.body.candidates.map((c) => c.place.name);
  if (!found.length) console.log('  import:', JSON.stringify(imported.body).slice(0, 1500));
  assert.ok(imported.body.candidates.length >= 3, `found: ${found.join(', ')}`);
  const newIds = [];
  for (const c of imported.body.candidates) {
    const r = await call('ideas/add', { ...(c.place.placeId ? { placeId: c.place.placeId } : {}), place: { name: c.place.name, location: c.place.location, ...(c.place.osmId ? { osmId: c.place.osmId } : {}) }, source: imported.body.source });
    assert.ok(r.status < 300, JSON.stringify(r.body));
    if (!r.body.duplicate) newIds.push(r.body.id);
  }
  for (const id of newIds) await call('ideas/analyze', { ideaId: id });
  const voted = await until(
    'the mates to vote on the new ideas',
    async () => (await db.getAll(...newIds.map((id) => db.doc(`trips/${tripId}/ideas/${id}`)))).map((d) => d.data()),
    (list) => list.every((i) => ['safar-demo-aminah', 'safar-demo-farid', 'safar-demo-daniel'].every((u) => i.votes[u] || i.analysis?.status === 'pending')),
    90000,
  );
  for (const id of newIds) {
    const up = await call('ideas/vote', { ideaId: id, value: 1 });
    if (up.status === 409) await call('ideas/vote', { ideaId: id, value: 1, ack: "I'll only eat at the halal stalls." });
  }
  assert.equal(imported.body.source.type, 'instagram');
  ok(`reel → ${found.join(', ')}; the mates voted: ${voted.map((i) => `${i.place.name} ${Object.values(i.votes).map((v) => (v.value > 0 ? '👍' : '👎')).join('')}`).join(' · ')}`);

  // ── Ichiran: vote, split, decide ─────────────────────────────────────────
  // Aisyah keeps Daniel company: a 👍 despite the conflict has to be confirmed.
  const first = await call('ideas/vote', { ideaId: ichiran.id, value: 1 });
  assert.equal(first.status, 409, 'a 👍 on a place that isn’t halal for you asks for a confirmation');
  const v = await call('ideas/vote', { ideaId: ichiran.id, value: 1, ack: "I'll keep Daniel company and just have tea." });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  assert.equal(v.body.status, 'mixed', '2 for, 2 against → needs a decision');
  {
    const opts = await until('middle grounds', async () => (await db.doc(`trips/${tripId}/ideas/${ichiran.id}`).get()).data(), (i) => i.options?.length > 0, 90000);
    // Every mate who isn't going (voted 👎) picks a middle ground.
    const notGoing = Object.entries(opts.votes).filter(([u, x]) => u.startsWith('safar-demo-') && x.value === -1).map(([u]) => u);
    await until('the mates to choose', async () => (await db.doc(`trips/${tripId}/ideas/${ichiran.id}`).get()).data(), (i) => notGoing.every((u) => i.choices[u]), 60000);
    assert.deepEqual(notGoing.sort(), ['safar-demo-aminah', 'safar-demo-farid']);
    const chosen = (await db.doc(`trips/${tripId}/ideas/${ichiran.id}`).get()).data();
    const picks = notGoing.map((u) => opts.options.find((o) => o.id === chosen.choices[u].optionId)?.title);
    const d = await call('ideas/decide', { ideaId: ichiran.id, action: 'accept' });
    assert.equal(d.status, 200, JSON.stringify(d.body));
    ok(`Ichiran: 2 for, 2 against → Mum and Farid picked ${[...new Set(picks)].join(' / ')} (options: ${opts.options.map((o) => o.title).join(' · ')}) → accepted as a split`);
  }

  // ── Auto-plan ─────────────────────────────────────────────────────────────
  const ar = await call('schedule/arrange', {});
  assert.equal(ar.status, 200, JSON.stringify(ar.body));
  const ap = await call('schedule/apply', { jobId: ar.body.id });
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  const plan = ar.body.plan;
  const names = Object.fromEntries((await db.collection(`trips/${tripId}/ideas`).get()).docs.map((d) => [d.id, d.get('place.name')]));
  for (const d of plan.days) console.log(`     ${d.day}: ${d.stops.map((x) => `${x.start} ${names[x.ideaId]}`).join(' → ') || '—'}${(d.meals ?? []).map((m) => ` | ${m.key} ${m.start} ${m.place?.name ?? ''}`).join('')}`);
  console.log('     unplaced:', plan.unplaced.map((u) => `${names[u.ideaId]} (${u.reason})`).join(', '));
  plan.days.forEach((d) => d.note && console.log(`     ${d.day}: ${d.note}`));
  ok(`auto-plan applied: ${plan.days.map((d) => `${d.day.slice(8)}: ${d.stops.length} stops${d.prayers.length ? ` + ${d.prayers.length} prayers` : ''}`).join(' | ')}; unplaced ${plan.unplaced.length}`);

  // ── While the others pray: Daniel picks the record shop Aisyah marked ────
  const tower = (await db.collection(`trips/${tripId}/ideas`).get()).docs.map((d) => d.data()).find((i) => /tower records/i.test(i.place.name));
  assert.equal(tower?.status, 'backup', 'Tower Records waits in the Reserve');
  assert.equal((await call('ideas/while-praying', { ideaId: tower.id, on: true })).status, 200);
  const breakWithPick = await until(
    'Daniel to pick Tower Records for a prayer break',
    async () => (await db.collection(`trips/${tripId}/schedule`).get()).docs.map((d) => d.data()).find((i) => i.prayer?.fillerPicks?.['safar-demo-daniel']),
    (x) => !!x,
    90000,
  );
  const dPick = breakWithPick.prayer.fillerPicks['safar-demo-daniel'];
  assert.equal(dPick.ideaId, tower.id);
  ok(`${breakWithPick.day} ${breakWithPick.prayer.prayer} ${breakWithPick.start}: you, Mum and Farid pray at ${breakWithPick.prayer.facility?.name ?? 'the prayer spot'} · Daniel → ${dPick.title}${dPick.meet ? `, meets back ${dPick.meet.kind === 'prayer' ? 'at the prayer place' : `at ${dPick.meet.name}`} ${dPick.meet.at}` : ''}`);

  // ── Passport ─────────────────────────────────────────────────────────────
  assert.equal((await call('vault/consent', { share: false })).status, 200);
  const pp = await upload('06-passport-SPECIMEN-Aisyah.png', 'vault');
  const read = await call('vault/read', { storagePath: pp });
  assert.equal(read.status, 200, JSON.stringify(read.body));
  console.log('  passport read:', JSON.stringify(read.body));
  assert.equal(read.body.kind, 'passport');
  assert.equal(read.body.fields.validUntil, '2027-04-20');
  assert.equal((await call('vault/save', { kind: 'passport', fields: read.body.fields, storagePath: pp, keepFile: false, confidence: read.body.confidence })).status < 300, true);
  const list = await call('vault/list');
  const passportCheck = list.body.checks.find((c) => /passport/i.test(JSON.stringify(c)));
  ok(`passport read (${read.body.fields.fullName}, expires ${read.body.fields.validUntil}) → ${passportCheck ? JSON.stringify(passportCheck).slice(0, 140) : 'no passport warning?'}`);

  // ── Receipt ──────────────────────────────────────────────────────────────
  const rp = await upload('07-receipt-Panga-dinner.png', 'receipts');
  const receipt = await call('expenses/receipt', { storagePath: rp });
  assert.equal(receipt.status, 200, JSON.stringify(receipt.body));
  assert.equal(receipt.body.total, 38720);
  assert.equal(receipt.body.currency, 'JPY');
  const rate = await call('expenses/rate', { from: 'JPY', to: 'MYR' });
  const everyone = members.map((m) => m.uid.replace('safar-demo-aisyah', guest));
  const ex = await call('expenses/create', { title: receipt.body.title, amountMinor: 38720, currency: 'JPY', rate: rate.body.rate ?? 0.029, paidBy: guest, split: { mode: 'equal', uids: everyone }, category: receipt.body.category ?? 'food', date: '2026-12-08', receiptPath: rp });
  assert.ok(ex.status < 300, JSON.stringify(ex.body));
  ok(`receipt read: ${receipt.body.title} ¥${receipt.body.total} → split 4 ways (rate ${rate.body.rate ?? 'typed'})`);

  // ── The delay ────────────────────────────────────────────────────────────
  const dp = await upload('08-train-delay-notice.png', 'disruptions');
  const delay = await call('resync/read', { bookingId: train.id, storagePath: dp });
  assert.equal(delay.status, 200, JSON.stringify(delay.body));
  assert.equal(delay.body.endLocal, '2026-12-10T12:45');
  const change = { type: 'delay', startLocal: delay.body.startLocal, endLocal: delay.body.endLocal };
  assert.equal((await call('resync/preview', { bookingId: train.id, change })).status, 200);
  const applied = await call('resync/apply', { bookingId: train.id, change });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const trainAfter = (await db.doc(`trips/${tripId}/bookings/${train.id}`).get()).data();
  assert.equal(trainAfter.endLocal, '2026-12-10T12:45');
  ok(`delay message read (${delay.body.startLocal} → ${delay.body.endLocal}) and applied: the train now arrives 12:45`);
  // The day follows the train: after the re-plan settles, every stop that day is after arriving and before midnight.
  const dec10 = await until(
    'Thursday to be re-planned',
    async () => (await db.collection(`trips/${tripId}/schedule`).where('day', '==', '2026-12-10').get()).docs.map((d) => d.data()),
    (items) => items.filter((i) => i.ref.kind === 'idea' || i.ref.meal).every((i) => i.start >= '12:45'),
    60000,
  );
  const stops = dec10.filter((i) => i.ref.kind === 'idea' || i.ref.meal).sort((a, b) => a.start.localeCompare(b.start));
  assert.ok(stops.every((i) => i.end > i.start), `a stop runs past midnight: ${JSON.stringify(stops.map((i) => [i.start, i.end]))}`);
  const checkout = dec10.find((i) => i.ref.event === 'checkout');
  assert.ok(!checkout || checkout.start < '09:00', `check-out ${checkout?.start} is after the 09:00 train`);
  ok(`Thursday after the delay: check-out ${checkout?.start ?? '—'}, ${stops.map((i) => `${i.start}–${i.end}`).join(', ') || 'no stops'}`);

  console.log(`\n${passed} checks passed.\n`);
} catch (err) {
  console.error(`\n  ❌ ${err.stack ?? err}\n`);
  process.exitCode = 1;
} finally {
  if (tripId && !process.env.KEEP) await db.recursiveDelete(db.doc(`trips/${tripId}`)).catch(() => {});
  if (guest && !process.env.KEEP) {
    await bucket.deleteFiles({ prefix: `trips/${tripId}/` }).catch(() => {});
    await db.recursiveDelete(db.doc(`users/${guest}`)).catch(() => {});
    await adminAuth(admin).deleteUser(guest).catch(() => {});
  }
  if (process.env.KEEP) console.log(`Kept: trip ${tripId}, guest ${guest}`);
  process.exit();
}
