// End-to-end test for Phase 3 (bookings + preferences) against the REAL
// Firebase project, Gemini and Google Maps, through a running API
// (npm run dev, or E2E_BASE_URL=https://…). Cleans up everything it creates.
// Usage: npm run e2e:phase3
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { jsPDF } from 'jspdf';
import { cert, initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFs } from 'firebase-admin/firestore';
import { getStorage as adminStorage } from 'firebase-admin/storage';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { doc, getDoc, getFirestore, updateDoc } from 'firebase/firestore';
import { getBytes, getStorage, ref, uploadBytes } from 'firebase/storage';

config({ path: '.env.local', quiet: true });
const env = process.env;
const BASE = env.E2E_BASE_URL ?? 'http://localhost:5173';
const sa = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
const admin = initAdmin({ credential: cert(sa), storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET }, 'admin');
const webConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: env.VITE_FIREBASE_APP_ID,
};

const run = Date.now().toString(36);
const created = { uids: [], tripIds: [] };
let passed = 0;
const ok = (m) => (passed++, console.log(`  ✅ ${m}`));

async function makeUser(name, displayName) {
  const u = await adminAuth(admin).createUser({ email: `e2e3-${run}-${name}@safar.test`, displayName });
  created.uids.push(u.uid);
  const app = initializeApp(webConfig, `${name}-${run}`);
  await signInWithCustomToken(getAuth(app), await adminAuth(admin).createCustomToken(u.uid));
  const idToken = await getAuth(app).currentUser.getIdToken();
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
  return { uid: u.uid, db: getFirestore(app), storage: getStorage(app), call };
}

function ticketPdf() {
  const d = new jsPDF();
  let y = 20;
  const line = (t, size = 11) => {
    d.setFontSize(size);
    d.text(t, 15, y);
    y += size * 0.6 + 3;
  };
  line('MALAYSIA AIRLINES  -  E-TICKET ITINERARY RECEIPT', 15);
  line('Booking reference (PNR): QX7T2L');
  line('Passenger: TEOH/XI XIAN MR        Ticket: 2322145678901');
  y += 4;
  line('FLIGHT   FROM                              TO                                  ');
  line('MH 70    KUALA LUMPUR (KUL) T1             TOKYO NARITA (NRT) T2');
  line('         Depart: 01 DEC 2026  23:30         Arrive: 02 DEC 2026  07:40');
  line('         Class: Economy   Baggage: 30KG');
  y += 6;
  line('HOTEL CONFIRMATION', 13);
  line('Hotel Gracery Shinjuku, 1-19-1 Kabukicho, Shinjuku-ku, Tokyo');
  line('Check-in: 02 December 2026 from 14:00    Check-out: 05 December 2026 until 11:00');
  line('Guest: Teoh Xi Xian   Confirmation no. HG-558201');
  return new Uint8Array(d.output('arraybuffer'));
}

const denied = async (p, label) => {
  await assert.rejects(p, (e) => /unauthorized|permission/i.test(e.code ?? e.message), `${label} should be denied`);
  ok(`${label} → denied`);
};

try {
  console.log(`\nPhase 3 e2e against ${BASE}`);
  const alice = await makeUser('alice', 'Teoh Xi Xian');
  const bob = await makeUser('bob', 'Bob Tan');

  const trip = await alice.call('POST', 'trips/create', {
    body: {
      name: 'E2E Tokyo',
      destinations: [{ name: 'Tokyo', location: { lat: 35.6764, lng: 139.65 }, countryCode: 'JP' }],
      startDate: '2026-12-01',
      endDate: '2026-12-06',
      currency: 'MYR',
    },
  });
  const tripId = trip.body.tripId;
  created.tripIds.push(tripId);
  const inv = await alice.call('POST', 'invites/create', { body: {}, query: { tripId } });
  await bob.call('POST', 'invites/accept', { body: { token: inv.body.token } });
  ok('trip with 2 members');

  // ── Storage rules ──────────────────────────────────────────────────
  const path = `trips/${tripId}/users/${alice.uid}/bookings/${run}-ticket.pdf`;
  await uploadBytes(ref(alice.storage, path), ticketPdf(), { contentType: 'application/pdf' });
  ok('owner uploaded ticket PDF');
  await denied(getBytes(ref(bob.storage, path)), "reading someone else's upload");
  await denied(
    uploadBytes(ref(bob.storage, `trips/${tripId}/users/${alice.uid}/x.pdf`), new Uint8Array([1]), { contentType: 'application/pdf' }),
    "uploading into someone else's folder",
  );
  await denied(
    uploadBytes(ref(alice.storage, `trips/${tripId}/users/${alice.uid}/x.txt`), new Uint8Array([1]), { contentType: 'text/plain' }),
    'uploading a non-PDF/image',
  );

  // ── AI parse ───────────────────────────────────────────────────────
  assert.equal((await bob.call('POST', 'bookings/parse', { body: { storagePath: path }, query: { tripId } })).status, 403);
  ok("parsing someone else's upload → 403");

  const t0 = Date.now();
  const parsed = await alice.call('POST', 'bookings/parse', { body: { storagePath: path }, query: { tripId } });
  assert.equal(parsed.status, 200, JSON.stringify(parsed.body));
  const drafts = parsed.body.drafts.map((d) => d.draft);
  const flight = drafts.find((d) => d.kind === 'flight');
  const hotel = drafts.find((d) => d.kind === 'hotel');
  assert.ok(flight && hotel, `expected flight + hotel, got ${drafts.map((d) => d.kind)}`);
  assert.equal(flight.startLocal, '2026-12-01T23:30');
  assert.equal(flight.endLocal, '2026-12-02T07:40');
  assert.match(`${flight.carrier} ${flight.number}`, /MH\s*70|Malaysia/i);
  assert.equal(flight.pnr, 'QX7T2L');
  assert.match(flight.from?.name ?? '', /Kuala Lumpur/i);
  assert.match(flight.to?.name ?? '', /Narita/i);
  assert.deepEqual(flight.travellerUids, [alice.uid]);
  ok(`Gemini read the PDF in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${flight.carrier} ${flight.number} ${flight.from.name} → ${flight.to.name}, PNR ${flight.pnr}`);
  assert.equal(hotel.startLocal, '2026-12-02T14:00');
  assert.equal(hotel.endLocal, '2026-12-05T11:00');
  assert.match(hotel.to?.name ?? '', /Gracery/i);
  ok(`hotel: ${hotel.to.name} ${hotel.startLocal} → ${hotel.endLocal}; passenger matched to member`);

  const text = await alice.call('POST', 'bookings/parse', {
    query: { tripId },
    body: {
      text: 'Your JR East booking is confirmed. Hokuriku Shinkansen Kagayaki 505, Tokyo Station dep 08:24 on 4 Dec 2026, arr Kanazawa Station 11:02. Car 7 seat 12A. Passenger: Bob Tan. Reservation 88311.',
    },
  });
  assert.equal(text.status, 200, JSON.stringify(text.body));
  const train = text.body.drafts[0].draft;
  assert.equal(train.kind, 'train');
  assert.equal(train.startLocal, '2026-12-04T08:24');
  assert.deepEqual(train.travellerUids, [bob.uid]);
  ok(`pasted email → train ${train.from?.name} → ${train.to?.name}, traveller matched to Bob`);

  // ── Save: timezones + locked anchors ───────────────────────────────
  const save = await alice.call('POST', 'bookings/create', {
    query: { tripId },
    body: { draft: flight, source: 'upload', fileRef: path, parseConfidence: parsed.body.confidence },
  });
  assert.equal(save.status, 201, JSON.stringify(save.body));
  const bookingId = save.body.id;
  const b = (await getDoc(doc(bob.db, `trips/${tripId}/bookings/${bookingId}`))).data();
  assert.equal(b.startAt, '2026-12-01T23:30:00+08:00');
  assert.equal(b.endAt, '2026-12-02T07:40:00+09:00');
  assert.equal(b.from.timezone, 'Asia/Kuala_Lumpur');
  assert.equal(b.to.timezone, 'Asia/Tokyo');
  ok(`saved with real offsets: ${b.startAt} (${b.from.timezone}) → ${b.endAt} (${b.to.timezone})`);

  const anchors = await adminFs(admin).collection(`trips/${tripId}/schedule`).where('ref.bookingId', '==', bookingId).get();
  const events = anchors.docs.map((d) => `${d.data().ref.event}@${d.data().day} ${d.data().start}`).sort();
  assert.deepEqual(events, ['arrive@2026-12-02 07:40', 'depart@2026-12-01 23:30']);
  assert.ok(anchors.docs.every((d) => d.data().locked));
  ok(`locked timeline anchors: ${events.join(', ')}`);

  const hSave = await alice.call('POST', 'bookings/create', { query: { tripId }, body: { draft: hotel, source: 'upload' } });
  assert.equal(hSave.status, 201);
  const bad = await alice.call('POST', 'bookings/create', {
    query: { tripId },
    body: { draft: { ...hotel, startLocal: '2026-12-05T14:00', endLocal: '2026-12-02T11:00' } },
  });
  assert.equal(bad.status, 400);
  ok('check-out before check-in → 400');

  // ── Permissions ────────────────────────────────────────────────────
  assert.equal((await bob.call('POST', 'bookings/delete', { query: { tripId }, body: { id: bookingId } })).status, 403);
  ok("member can't delete someone else's booking (403)");
  await assert.rejects(updateDoc(doc(bob.db, `trips/${tripId}/bookings/${bookingId}`), { pnr: 'HACK' }));
  ok('clients cannot write bookings directly');

  const upd = await alice.call('POST', 'bookings/update', {
    query: { tripId },
    body: { id: bookingId, draft: { ...flight, travellerUids: [alice.uid, bob.uid] } },
  });
  assert.equal(upd.status, 200);
  ok('creator updated travellers');

  assert.equal((await alice.call('POST', 'bookings/delete', { query: { tripId }, body: { id: bookingId } })).status, 200);
  const left = await adminFs(admin).collection(`trips/${tripId}/schedule`).where('ref.bookingId', '==', bookingId).get();
  assert.equal(left.size, 0);
  ok('delete removes the booking and its anchors');

  // ── Preferences (client write, rules-checked) ──────────────────────
  await updateDoc(doc(bob.db, `trips/${tripId}/members/${bob.uid}`), {
    prefs: { hotelBudget: { min: 150, max: 300 }, halalRequired: true, halalTier: 'muslim_owned', prayerReminders: true, pace: 'relaxed', interests: ['Food'], hotelPriorities: ['near_transit'] },
  });
  ok('member saved own preferences');

  console.log(`\n${passed} checks passed ✅`);
} catch (err) {
  console.error('\n❌ FAILED:', err.message);
  process.exitCode = 1;
} finally {
  const db = adminFs(admin);
  for (const id of created.tripIds) {
    await adminStorage(admin).bucket().deleteFiles({ prefix: `trips/${id}/` }).catch(() => {});
    await db.recursiveDelete(db.doc(`trips/${id}`)).catch(() => {});
    const inv = await db.collection('inviteTokens').where('tripId', '==', id).get();
    await Promise.all(inv.docs.map((d) => d.ref.delete()));
  }
  for (const uid of created.uids) await adminAuth(admin).deleteUser(uid).catch(() => {});
  console.log(`cleaned up ${created.uids.length} users, ${created.tripIds.length} trip(s) + uploads`);
  process.exit();
}
