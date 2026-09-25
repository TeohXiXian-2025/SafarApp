// Document Vault — every route acts on the CALLER's own vault only:
//   vault/list      my documents, my checks, my uploaded tickets
//   vault/consent   agree (and choose whether the group sees my status)
//   vault/read      AI reads an upload → fields to confirm (nothing saved)
//   vault/save      save a document (optionally deleting the image: "extract only")
//   vault/delete    delete a document and its file;  vault/forget  delete everything
//   vault/file      a 5-minute link to my own file
import { Type } from '@google/genai';
import { z } from 'zod';
import { Booking, Id, paths, toCountryCode, toIsoDate, VaultDoc, VaultFields, VaultKind } from '../../src/domain/index.js';
import { withTrip } from '../_lib/auth.js';
import { adminBucket, adminDb } from '../_lib/firebaseAdmin.js';
import { extractJson } from '../_lib/gemini.js';
import { HttpError, json, readJson } from '../_lib/http.js';
import { useDailyQuota } from '../_lib/quota.js';
import type { RouteTable } from '../_lib/routes.js';
import { deleteVault, loadVault, refreshReadiness, vaultDocs, vaultRef } from '../_lib/vault.js';

const TYPES = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/;
const myFolder = (tripId: string, uid: string) => `trips/${tripId}/users/${uid}/vault/`;

const SYSTEM = `You read travel documents for their owner: passports (the photo page / MRZ), visas and e-visas, and travel insurance certificates.
Return only what is printed. Dates as YYYY-MM-DD. Countries as ISO 3166-1 alpha-2 (MYS → MY, IDN → ID, JPN → JP, GBR → GB).
- passport: fullName (given names + surname as printed), number, nationality, issuingCountry, dateOfBirth, validUntil (expiry).
- visa: fullName, number, country (the country the visa is FOR), validFrom, validUntil, provider (visa type, e.g. "Tourist, single entry").
- insurance: fullName (insured person), number (policy number), provider (insurer), validFrom, validUntil (cover period).
kind: what the document is. confidence 0..1. If it isn't one of these, kind "other" and confidence 0.`;

const str = (description: string) => ({ type: Type.STRING, description });
const date = (what: string) => str(`${what}, as YYYY-MM-DD`);
const schema = {
  type: Type.OBJECT,
  properties: {
    kind: { type: Type.STRING, enum: ['passport', 'visa', 'insurance', 'other'] },
    fullName: str('Holder / insured person, given names then surname'),
    number: str('Passport, visa or policy number'),
    nationality: str("Holder's nationality, ISO alpha-2 (e.g. MY)"),
    issuingCountry: str('Country that issued the document, ISO alpha-2'),
    dateOfBirth: date('Date of birth'),
    country: str('Visas only: the country the visa lets you enter, ISO alpha-2'),
    validFrom: date('Visa valid from / insurance cover start'),
    validUntil: date('Passport expiry / visa valid until / insurance cover end'),
    provider: str('Insurance: the insurer. Visa: the visa type. Passports: empty'),
    confidence: { type: Type.NUMBER },
  },
  required: ['kind', 'confidence'],
};
const Read = z.object({ kind: z.string(), confidence: z.number().catch(0) }).catchall(z.unknown());

/** Keeps only fields that pass validation (a misread date is dropped, not saved). */
function cleanFields(raw: Record<string, unknown>): VaultFields {
  const out: Record<string, string> = {};
  for (const [k, shape] of Object.entries(VaultFields.shape)) {
    const v = typeof raw[k] === 'string' ? (raw[k] as string).trim() : '';
    if (!v) continue;
    const value = ['nationality', 'issuingCountry', 'country'].includes(k) ? toCountryCode(v) : ['dateOfBirth', 'validFrom', 'validUntil'].includes(k) ? toIsoDate(v) : v;
    if (!value) continue;
    if (shape.safeParse(value).success) out[k] = value;
  }
  return out as VaultFields;
}

const assertMine = (path: string, tripId: string, uid: string) => {
  if (!path.startsWith(myFolder(tripId, uid)) || path.includes('..')) throw new HttpError(403, 'You can only use your own vault uploads');
};

async function requireConsent(tripId: string, uid: string) {
  if (!(await vaultRef(tripId, uid).get()).get('consentAt')) throw new HttpError(412, 'Please read and agree to how the vault works first');
}

export const vaultRoutes: RouteTable = {
  'POST vault/list': withTrip(
    async (_req, { tripId, member }) => {
      const vault = await loadVault(tripId, member.uid);
      const checks = vault.consentAt ? await refreshReadiness(tripId, member.uid) : [];
      // My uploaded tickets/confirmations (their files are already private to me).
      const tickets = (await adminDb().collection(paths.bookings(tripId)).where('createdBy', '==', member.uid).get()).docs
        .map((d) => Booking.safeParse(d.data()))
        .flatMap((r) => (r.success && r.data.fileRef ? [{ id: r.data.id, kind: r.data.kind, title: [r.data.carrier, r.data.number].filter(Boolean).join(' ') || r.data.to.name, fileRef: r.data.fileRef }] : []));
      return json({ ...vault, checks, tickets });
    },
    { perMinute: 30 },
  ),

  'POST vault/consent': withTrip(
    async (req, { tripId, member }) => {
      const { share } = await readJson(req, z.object({ share: z.boolean() }));
      await vaultRef(tripId, member.uid).set({ tripId, uid: member.uid, consentAt: Date.now(), share }, { merge: true });
      await refreshReadiness(tripId, member.uid);
      return json({ ok: true });
    },
    { perMinute: 20 },
  ),

  'POST vault/read': withTrip(
    async (req, { tripId, member }) => {
      const { storagePath } = await readJson(req, z.object({ storagePath: z.string().max(300) }));
      assertMine(storagePath, tripId, member.uid);
      await requireConsent(tripId, member.uid);
      await useDailyQuota(member.uid, 'bookingParse');
      const file = adminBucket().file(storagePath);
      const [meta] = await file.getMetadata().catch(() => {
        throw new HttpError(404, 'Upload not found — please upload it again');
      });
      const type = String(meta.contentType ?? '');
      if (!TYPES.test(type)) throw new HttpError(415, 'Upload a photo or PDF');
      const [buf] = await file.download();
      const r = await extractJson({
        system: SYSTEM,
        parts: [{ inlineData: { mimeType: type, data: buf.toString('base64') } }, { text: 'Read this document.' }],
        responseSchema: schema,
        validate: Read,
      });
      const kind = VaultKind.safeParse(r.kind);
      return json({ kind: kind.success ? kind.data : null, fields: cleanFields(r), confidence: Math.max(0, Math.min(1, r.confidence)) });
    },
    { perMinute: 6 },
  ),

  'POST vault/save': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(
        req,
        z.object({ id: Id.optional(), kind: VaultKind, fields: VaultFields, storagePath: z.string().max(300).optional(), keepFile: z.boolean(), confidence: z.number().min(0).max(1).optional() }),
      );
      await requireConsent(tripId, member.uid);
      const col = vaultDocs(tripId, member.uid);
      const prev = body.id ? VaultDoc.safeParse((await col.doc(body.id).get()).data()) : null;
      if (body.id && !prev?.success) throw new HttpError(404, 'Document not found');
      const old = prev?.success ? prev.data : undefined;
      if (body.storagePath && body.storagePath !== old?.storagePath) assertMine(body.storagePath, tripId, member.uid);

      const path = body.storagePath ?? old?.storagePath;
      const drop = [old?.storagePath !== path ? old?.storagePath : undefined, !body.keepFile ? path : undefined].filter((p): p is string => !!p);
      const ref = body.id ? col.doc(body.id) : col.doc();
      const now = Date.now();
      const doc: VaultDoc = {
        id: ref.id,
        kind: body.kind,
        fields: body.fields,
        ...(body.keepFile && path ? { storagePath: path } : {}),
        ...(body.confidence !== undefined ? { confidence: body.confidence } : {}),
        uploadedAt: old?.uploadedAt ?? now,
        updatedAt: now,
      };
      await ref.set(VaultDoc.parse(doc));
      await Promise.all(drop.map((p) => adminBucket().file(p).delete().catch(() => {})));
      const checks = await refreshReadiness(tripId, member.uid);
      return json({ id: ref.id, checks });
    },
    { perMinute: 20 },
  ),

  'POST vault/delete': withTrip(
    async (req, { tripId, member }) => {
      const { id } = await readJson(req, z.object({ id: Id }));
      const ref = vaultDocs(tripId, member.uid).doc(id);
      const path = (await ref.get()).get('storagePath') as string | undefined;
      await ref.delete();
      if (path) await adminBucket().file(path).delete().catch(() => {});
      await refreshReadiness(tripId, member.uid);
      return json({ ok: true });
    },
    { perMinute: 20 },
  ),

  /** Delete my whole vault for this trip (documents, files, consent, shared status). */
  'POST vault/forget': withTrip(
    async (_req, { tripId, member }) => {
      await deleteVault(tripId, member.uid);
      return json({ ok: true });
    },
    { perMinute: 5 },
  ),

  'POST vault/file': withTrip(
    async (req, { tripId, member }) => {
      const { id } = await readJson(req, z.object({ id: Id }));
      const path = (await vaultDocs(tripId, member.uid).doc(id).get()).get('storagePath') as string | undefined;
      if (!path) throw new HttpError(404, 'No file kept for this document');
      const [url] = await adminBucket().file(path).getSignedUrl({ action: 'read', expires: Date.now() + 5 * 60_000 });
      return json({ url });
    },
    { perMinute: 30 },
  ),
};
