// Deploys firestore.rules + storage.rules using the service account in
// .env.local — no `firebase login` needed.  Usage: npm run deploy:rules
import fs from 'node:fs';
import { config } from 'dotenv';
import { cert, initializeApp } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';

config({ path: '.env.local', quiet: true });
const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT ?? '', 'base64').toString('utf8'));
const bucket = process.env.VITE_FIREBASE_STORAGE_BUCKET;
const app = initializeApp({ credential: cert(sa), storageBucket: bucket });
const rules = getSecurityRules(app);

const fsRules = await rules.releaseFirestoreRulesetFromSource(fs.readFileSync('firestore.rules', 'utf8'));
console.log(`✅ Firestore rules released to ${sa.project_id} (ruleset ${fsRules.name})`);

const stRules = await rules.releaseStorageRulesetFromSource(fs.readFileSync('storage.rules', 'utf8'), bucket);
console.log(`✅ Storage rules released to ${bucket} (ruleset ${stRules.name})`);
