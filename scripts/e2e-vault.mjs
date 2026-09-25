// End-to-end test for the Document Vault against the REAL Firebase (incl.
// security rules) and Gemini, through a running API.
// Usage: npm run e2e:vault
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { cert, initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFs } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';

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
  return { uid: u.uid, call, fs: getFirestore(app) };
}

function textPdf(lines) {
  const text = lines.map((l, i) => `BT /F1 13 Tf 50 ${780 - i * 20} Td (${l}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
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
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

try {
  console.log(`\nDocument Vault e2e against ${BASE}`);
  const [ali, bob] = [await makeUser('Ali'), await makeUser('Bob')];
  const t = await ali.call('trips/create', {
    name: 'E2E Vault',
    destinations: [{ name: 'Tokyo', placeId: 'ChIJ51cu8IcbXWARiRtXIothAS4', location: { lat: 35.6764, lng: 139.65 }, countryCode: 'JP' }],
    startDate: '2026-12-07',
    endDate: '2026-12-12',
    currency: 'MYR',
  });
  assert.ok(t.body.tripId, JSON.stringify(t.body));
  const q = { tripId: t.body.tripId };
  created.tripIds.push(t.body.tripId);
  const inv = await ali.call('invites/create', {}, q);
  assert.equal((await bob.call('invites/accept', { token: inv.body.token })).status, 200);

  // Consent first.
  const path = `trips/${q.tripId}/users/${bob.uid}/vault/${run}-passport.pdf`;
  await bucket.file(path).save(
    textPdf([
      'MALAYSIA          PASSPORT / PASPORT',
      'Type: P     Country code: MYS     Passport No: A12345678',
      'Surname: BIN ABDULLAH',
      'Given names: AHMAD FARIS',
      'Nationality: MALAYSIA',
      'Date of birth: 14 MAR 1999',
      'Date of issue: 01 FEB 2022',
      'Date of expiry: 01 FEB 2027',
      'P<MYSBIN<ABDULLAH<<AHMAD<FARIS<<<<<<<<<<<<<<<<<',
      'A123456785MYS9903145M2702012<<<<<<<<<<<<<<04',
    ]),
    { contentType: 'application/pdf' },
  );
  assert.equal((await bob.call('vault/read', { storagePath: path }, q)).status, 412);
  ok('nothing is read before the person agrees');
  assert.equal((await bob.call('vault/consent', { share: true }, q)).status, 200);
  assert.equal((await ali.call('vault/read', { storagePath: path }, q)).status, 403);
  ok("the admin can't read Bob's upload");

  const r = await bob.call('vault/read', { storagePath: path }, q);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.kind, 'passport');
  assert.equal(r.body.fields.validUntil, '2027-02-01');
  assert.equal(r.body.fields.nationality, 'MY');
  assert.match(r.body.fields.number ?? '', /A12345678/);
  ok(`AI read the passport: ${r.body.fields.fullName}, ${r.body.fields.nationality}, expires ${r.body.fields.validUntil} (confidence ${r.body.confidence})`);

  // Extract only: the file is deleted.
  const s = await bob.call('vault/save', { kind: 'passport', fields: r.body.fields, storagePath: path, keepFile: false, confidence: r.body.confidence }, q);
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal((await bucket.file(path).exists())[0], false);
  const saved = (await db.doc(`vault/${q.tripId}_${bob.uid}/docs/${s.body.id}`).get()).data();
  assert.equal(saved.storagePath, undefined);
  ok('“keep just the details”: the file is deleted, the fields are kept');

  const pass = s.body.checks.find((c) => c.key === 'passport');
  assert.equal(pass.level, 'bad');
  assert.ok(s.body.checks.some((c) => c.key === 'visa:JP' && c.level === 'todo' && c.link));
  ok(`checks: “${pass.text}” + visa checklist for Japan`);

  // What the group sees.
  const shared = (await db.doc(`trips/${q.tripId}/readiness/${bob.uid}`).get()).data();
  assert.equal(shared.status, 'problem');
  const blob = JSON.stringify(shared);
  assert.ok(!/A12345678|2027|AHMAD|ABDULLAH/.test(blob), blob);
  const viaRules = await getDoc(doc(ali.fs, `trips/${q.tripId}/readiness/${bob.uid}`));
  assert.equal(viaRules.exists(), true);
  ok(`the group sees only labels: ${shared.items.map((i) => i.label).join(' · ')}`);

  // Security rules: the vault itself is closed to every client, even its owner.
  await assert.rejects(getDoc(doc(ali.fs, `vault/${q.tripId}_${bob.uid}/docs/${s.body.id}`)), /permission/i);
  await assert.rejects(getDoc(doc(bob.fs, `vault/${q.tripId}_${bob.uid}/docs/${s.body.id}`)), /permission/i);
  const aliList = await ali.call('vault/list', {}, q);
  assert.equal(aliList.body.docs.length, 0);
  ok("Firestore rules block direct reads; Ali's vault/list shows only Ali's (empty) vault");

  // Sharing off → the status disappears.
  await bob.call('vault/consent', { share: false }, q);
  assert.equal((await db.doc(`trips/${q.tripId}/readiness/${bob.uid}`).get()).exists, false);
  await bob.call('vault/consent', { share: true }, q);
  ok('turning sharing off removes the status from the group');

  // Leaving the trip deletes the vault.
  assert.equal((await bob.call('members/leave', {}, q)).status, 200);
  assert.equal((await db.collection(`vault/${q.tripId}_${bob.uid}/docs`).get()).size, 0);
  assert.equal((await db.doc(`vault/${q.tripId}_${bob.uid}`).get()).exists, false);
  assert.equal((await db.doc(`trips/${q.tripId}/readiness/${bob.uid}`).get()).exists, false);
  ok('leaving the trip deletes the vault and the shared status');

  console.log(`\n${passed} checks passed.`);
} catch (e) {
  console.error('\n❌', e);
  process.exitCode = 1;
} finally {
  for (const id of created.tripIds) {
    await db.recursiveDelete(db.doc(`trips/${id}`)).catch(() => {});
    await bucket.deleteFiles({ prefix: `trips/${id}/` }).catch(() => {});
    for (const uid of created.uids) await db.recursiveDelete(db.doc(`vault/${id}_${uid}`)).catch(() => {});
  }
  for (const uid of created.uids) {
    await db.recursiveDelete(db.doc(`users/${uid}`)).catch(() => {});
    await adminAuth(admin).deleteUser(uid).catch(() => {});
  }
  process.exit(process.exitCode ?? 0);
}
