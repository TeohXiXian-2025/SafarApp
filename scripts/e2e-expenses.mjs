// End-to-end test for the Money tab (group expenses) against the REAL Firebase,
// exchange-rate APIs and Gemini, through a running API.
// Usage: npm run e2e:expenses
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { cert, initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFs } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';

config({ path: '.env.local', quiet: true });
const env = process.env;
const BASE = env.E2E_BASE_URL ?? 'http://localhost:5173';
const sa = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
const admin = initAdmin({ credential: cert(sa), storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${sa.project_id}.firebasestorage.app` }, 'admin');
const db = adminFs(admin);
const bucket = getStorage(admin).bucket();
const webConfig = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID };
const run = Date.now().toString(36);
const created = { uids: [], tripIds: [] };
let passed = 0;
const ok = (m) => (passed++, console.log(`  ✅ ${m}`));

async function makeUser(name) {
  const u = await adminAuth(admin).createUser({ email: `e2ex-${run}-${name}@safar.test`, displayName: name });
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

/** A one-page PDF receipt with plain text lines. */
function receiptPdf(lines) {
  const text = lines.map((l, i) => `BT /F1 14 Tf 60 ${760 - i * 22} Td (${l}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

try {
  console.log(`\nMoney tab e2e against ${BASE}`);
  const [ali, bob, cara] = [await makeUser('Ali'), await makeUser('Bob'), await makeUser('Cara')];
  const t = await ali.call('trips/create', {
    name: 'E2E Money',
    destinations: [{ name: 'Seoul', placeId: 'ChIJzWXFYYuifDUR64Pq5LTtioU', location: { lat: 37.5665, lng: 126.978 }, countryCode: 'KR' }],
    startDate: '2026-12-07',
    endDate: '2026-12-10',
    currency: 'MYR',
  });
  assert.ok(t.body.tripId, JSON.stringify(t.body));
  const q = { tripId: t.body.tripId };
  created.tripIds.push(t.body.tripId);
  const inv = await ali.call('invites/create', {}, q);
  for (const u of [bob, cara]) assert.equal((await u.call('invites/accept', { token: inv.body.token })).status, 200);
  const all = [ali.uid, bob.uid, cara.uid];

  // Rates
  const r = await ali.call('expenses/rate', { from: 'KRW', to: 'MYR' }, q);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.rate > 0.001 && r.body.rate < 0.01, `KRW→MYR ${r.body.rate}`);
  ok(`today's rate: 1 KRW = ${r.body.rate} MYR (${r.body.source})`);
  const vnd = await ali.call('expenses/rate', { from: 'VND', to: 'MYR' }, q);
  assert.equal(vnd.status, 200, JSON.stringify(vnd.body));
  ok(`a currency the ECB doesn't publish still works: 1 VND = ${vnd.body.rate} MYR (${vnd.body.source})`);

  // Expenses
  const base = { category: 'food', date: '2026-12-07', rate: 1 };
  const add = (who, body) => who.call('expenses/create', { ...base, ...body }, q);
  // Ali pays ₩90,000 dinner for all three, at the live rate.
  const d = await add(ali, { title: 'Korean BBQ', amountMinor: 90_000, currency: 'KRW', rate: r.body.rate, paidBy: ali.uid, split: { mode: 'equal', uids: all } });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const dinner = (await db.doc(`trips/${q.tripId}/expenses/${d.body.id}`).get()).data();
  assert.equal(dinner.tripAmountMinor, Math.round(90_000 * r.body.rate * 100));
  ok(`₩90,000 dinner saved as RM ${(dinner.tripAmountMinor / 100).toFixed(2)} for the group`);
  // Bob pays RM 60 taxi, split by amounts (Bob 20, Cara 40).
  assert.equal((await add(bob, { title: 'Taxi', amountMinor: 6000, currency: 'MYR', paidBy: bob.uid, split: { mode: 'exact', parts: { [bob.uid]: 2000, [cara.uid]: 4000 } }, category: 'transport' })).status, 201);

  // Validation
  const bad = await add(bob, { title: 'Wrong sum', amountMinor: 6000, currency: 'MYR', paidBy: bob.uid, split: { mode: 'exact', parts: { [bob.uid]: 2000 } } });
  assert.equal(bad.status, 400);
  const stranger = await add(bob, { title: 'Outsider', amountMinor: 100, currency: 'MYR', paidBy: bob.uid, split: { mode: 'equal', uids: ['notAMember123'] } });
  assert.equal(stranger.status, 400);
  const foreignStop = await add(bob, { title: 'Stop', amountMinor: 100, currency: 'MYR', paidBy: bob.uid, split: { mode: 'equal', uids: all }, ideaId: 'notAnIdeaHere1' });
  assert.equal(foreignStop.status, 400);
  ok(`amounts that don't add up, people outside the trip and unknown stops are refused (“${bad.body.error}”)`);

  // Only creator / payer / admin can edit.
  const taxi = (await db.collection(`trips/${q.tripId}/expenses`).where('title', '==', 'Taxi').get()).docs[0].data();
  const edit = { id: taxi.id, title: 'Taxi to Myeongdong', amountMinor: 6000, currency: 'MYR', rate: 1, paidBy: bob.uid, split: taxi.split, category: 'transport', date: '2026-12-07' };
  assert.equal((await cara.call('expenses/update', edit, q)).status, 403);
  assert.equal((await ali.call('expenses/update', edit, q)).status, 200); // admin
  ok('Cara (not payer, not admin) can’t edit Bob’s taxi; the admin can');

  // Balances & settle up, recomputed from Firestore the way the page does.
  const net = () => db.collection(`trips/${q.tripId}/expenses`).get().then((s) => {
    const out = Object.fromEntries(all.map((u) => [u, 0]));
    for (const e of s.docs.map((x) => x.data())) {
      out[e.paidBy] += e.tripAmountMinor;
      const ws = e.split.mode === 'equal' ? e.split.uids.map((u) => [u, 1]) : Object.entries(e.split.parts);
      const sum = ws.reduce((a, [, w]) => a + w, 0);
      // Same largest-remainder rounding as the app.
      const raw = ws.map(([u, w]) => [u, (e.tripAmountMinor * w) / sum]);
      const fl = Object.fromEntries(raw.map(([u, x]) => [u, Math.floor(x)]));
      let left = e.tripAmountMinor - Object.values(fl).reduce((a, b) => a + b, 0);
      for (const [u] of [...raw].sort((a, b) => b[1] - Math.floor(b[1]) - (a[1] - Math.floor(a[1])))) if (left-- > 0) fl[u]++;
      for (const [u, v] of Object.entries(fl)) out[u] -= v;
    }
    return out;
  });
  const n1 = await net();
  assert.equal(Object.values(n1).reduce((a, b) => a + b, 0), 0);
  assert.ok(n1[ali.uid] > 0 && n1[cara.uid] < 0, JSON.stringify(n1));
  ok(`balances add up to zero: Ali ${(n1[ali.uid] / 100).toFixed(2)}, Bob ${(n1[bob.uid] / 100).toFixed(2)}, Cara ${(n1[cara.uid] / 100).toFixed(2)}`);

  // Cara pays Ali what she owes. Only Ali — who receives it — can tick it: not Bob, not Cara herself.
  assert.equal((await bob.call('expenses/settle', { from: cara.uid, to: ali.uid, amountMinor: 1000, date: '2026-12-08' }, q)).status, 403);
  assert.equal((await cara.call('expenses/settle', { from: cara.uid, to: ali.uid, amountMinor: -n1[cara.uid], date: '2026-12-08' }, q)).status, 403);
  const s = await ali.call('expenses/settle', { from: cara.uid, to: ali.uid, amountMinor: -n1[cara.uid], date: '2026-12-08' }, q);
  assert.equal(s.status, 201, JSON.stringify(s.body));
  const n2 = await net();
  assert.equal(n2[cara.uid], 0);
  ok('only Ali (who received the money) can confirm Cara paid him → Cara is square; Cara and Bob can’t tick it');
  // The receiver can undo it.
  assert.equal((await ali.call('expenses/delete', { id: s.body.id }, q)).status, 200);
  assert.equal((await net())[cara.uid], n1[cara.uid]);
  ok('Ali (who received it) can undo the payment');

  // Receipt: upload into Bob's own folder, AI reads it, anyone in the trip can view it.
  const path = `trips/${q.tripId}/users/${bob.uid}/receipts/${run}.pdf`;
  await bucket.file(path).save(receiptPdf(['NASI KANDAR PELITA', 'Jalan Ampang, Kuala Lumpur', 'Date: 08/12/2026', '2x Nasi Kandar      RM 24.00', '2x Teh Tarik        RM  6.40', 'Service 10%         RM  3.04', 'TOTAL               RM 33.44', 'Thank you!']), { contentType: 'application/pdf' });
  assert.equal((await cara.call('expenses/receipt', { storagePath: path }, q)).status, 403);
  const rc = await bob.call('expenses/receipt', { storagePath: path }, q);
  assert.equal(rc.status, 200, JSON.stringify(rc.body));
  assert.equal(rc.body.total, 33.44);
  assert.equal(rc.body.currency, 'MYR');
  assert.equal(rc.body.category, 'food');
  assert.ok(rc.body.items?.length >= 2, JSON.stringify(rc.body.items));
  const itemsSum = rc.body.items.reduce((a, i) => a + i.amount, 0);
  assert.ok(Math.abs(itemsSum + (rc.body.extra ?? 0) - 33.44) < 0.02, `${itemsSum} + ${rc.body.extra}`);
  ok(`receipt read: “${rc.body.title}” ${rc.body.currency} ${rc.body.total} — items ${rc.body.items.map((i) => `${i.name} ${i.amount}`).join(', ')} + ${rc.body.extra} service; others can’t read Bob’s upload`);

  // Split amount by item: Bob ticks who had what; the service charge is shared by what each had.
  const byItem = await add(bob, {
    title: 'Nasi Kandar Pelita (by item)',
    amountMinor: 3344,
    currency: 'MYR',
    paidBy: bob.uid,
    split: { mode: 'items', items: [{ name: '2x Nasi Kandar', amountMinor: 2400, uids: [bob.uid, cara.uid] }, { name: '2x Teh Tarik', amountMinor: 640, uids: [cara.uid] }], extraMinor: 304 },
    date: '2026-12-08',
  });
  assert.equal(byItem.status, 201, JSON.stringify(byItem.body));
  const saved = (await db.doc(`trips/${q.tripId}/expenses/${byItem.body.id}`).get()).data();
  assert.equal(saved.split.mode, 'items');
  const badItems = await add(bob, { title: 'x', amountMinor: 3344, currency: 'MYR', paidBy: bob.uid, split: { mode: 'items', items: [{ name: 'A', amountMinor: 3000, uids: [] }], extraMinor: 344 }, date: '2026-12-08' });
  assert.equal(badItems.status, 400);
  ok('split amount by item saved (Cara: her Nasi Kandar half + both teh tarik + her part of the service); an item nobody had is refused');

  // Paid back: only Bob (who paid the bill) ticks Cara off — Cara can't tick herself.
  assert.equal((await cara.call('expenses/paid-back', { id: byItem.body.id, uid: cara.uid, paid: true }, q)).status, 403);
  assert.equal((await bob.call('expenses/paid-back', { id: byItem.body.id, uid: cara.uid, paid: true }, q)).status, 200);
  const ticked = (await db.doc(`trips/${q.tripId}/expenses/${byItem.body.id}`).get()).data();
  assert.ok(ticked.paidBack[cara.uid] > 0);
  assert.equal((await bob.call('expenses/paid-back', { id: byItem.body.id, uid: cara.uid, paid: false }, q)).status, 200);
  assert.equal((await bob.call('expenses/delete', { id: byItem.body.id }, q)).status, 200);
  ok('only the bill’s payer can tick “paid back” (Cara can’t tick herself); it can be un-ticked');
  const withReceipt = await add(bob, { title: rc.body.title, amountMinor: 3344, currency: 'MYR', paidBy: bob.uid, split: { mode: 'equal', uids: all }, receiptPath: path, date: '2026-12-08' });
  assert.equal(withReceipt.status, 201);
  const link = await cara.call('expenses/receipt-url', { id: withReceipt.body.id }, q);
  assert.equal(link.status, 200, JSON.stringify(link.body));
  assert.equal((await fetch(link.body.url)).status, 200);
  ok('Cara opens Bob’s receipt through a 10-minute link');

  // Deleting removes the receipt file too.
  assert.equal((await bob.call('expenses/delete', { id: withReceipt.body.id }, q)).status, 200);
  const [exists] = await bucket.file(path).exists();
  assert.equal(exists, false);
  ok('deleting the expense deletes its receipt');

  console.log(`\n${passed} checks passed.`);
} catch (e) {
  console.error('\n❌', e);
  process.exitCode = 1;
} finally {
  for (const id of created.tripIds) {
    await db.recursiveDelete(db.doc(`trips/${id}`)).catch(() => {});
    await bucket.deleteFiles({ prefix: `trips/${id}/` }).catch(() => {});
  }
  for (const uid of created.uids) {
    await db.recursiveDelete(db.doc(`users/${uid}`)).catch(() => {});
    await adminAuth(admin).deleteUser(uid).catch(() => {});
  }
  process.exit(process.exitCode ?? 0);
}
