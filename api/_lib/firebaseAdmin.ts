import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { requireEnv } from './env.js';

let app: App | undefined;

function adminApp(): App {
  if (app) return app;
  if (getApps().length) return (app = getApps()[0]);
  // FIREBASE_SERVICE_ACCOUNT is the service-account JSON, base64-encoded.
  const sa = JSON.parse(Buffer.from(requireEnv('FIREBASE_SERVICE_ACCOUNT'), 'base64').toString('utf8'));
  app = initializeApp({
    credential: cert(sa),
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || `${sa.project_id}.firebasestorage.app`,
  });
  return app;
}

export const adminAuth = () => getAuth(adminApp());
let db: Firestore | undefined;
export const adminDb = (): Firestore => {
  if (db) return db;
  db = getFirestore(adminApp());
  // Optional schema fields are often `undefined`; drop them instead of throwing.
  // (settings() throws if already applied, e.g. after a dev-server module reload.)
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {}
  return db;
};
export const adminBucket = () => getStorage(adminApp()).bucket();
