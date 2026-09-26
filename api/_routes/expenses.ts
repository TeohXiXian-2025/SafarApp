// Group expenses:
//   expenses/rate        today's exchange rate (Frankfurter, then open.er-api for
//                        currencies the ECB doesn't publish), cached 12 h
//   expenses/receipt     AI reads a receipt photo → title, amount, currency, date
//   expenses/receipt-url a short-lived link so the whole group can see a receipt
//   expenses/create|update|delete, expenses/settle (record a payment)
import { Type } from '@google/genai';
import { z } from 'zod';
import {
  CurrencyCode,
  Expense,
  ExpenseCategory,
  ExpenseSplit,
  Id,
  LocalDate,
  convertMinor,
  formatMoney,
  paths,
  sharesOf,
  splitProblem,
} from '../../src/domain/index.js';
import { FieldValue } from 'firebase-admin/firestore';
import { withTrip } from '../_lib/auth.js';
import { adminBucket, adminDb } from '../_lib/firebaseAdmin.js';
import { extractJson } from '../_lib/gemini.js';
import { HttpError, json, readJson } from '../_lib/http.js';
import { useDailyQuota } from '../_lib/quota.js';
import type { RouteTable } from '../_lib/routes.js';
import { loadTrip, logActivity } from '../_lib/trip.js';

const RATE_TTL_MS = 12 * 3_600_000;
const RECEIPT_TYPES = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/;

// ─── Exchange rates ──────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 1 `from` = rate `to`. Null if no source knows the pair. */
export async function exchangeRate(from: string, to: string): Promise<{ rate: number; source: string; at: number } | null> {
  if (from === to) return { rate: 1, source: 'same', at: Date.now() };
  const ref = adminDb().doc(`fxRates/${from}_${to}`);
  const cached = (await ref.get()).data();
  if (cached && Date.now() - Number(cached.at) < RATE_TTL_MS) return cached as { rate: number; source: string; at: number };

  let found: { rate: number; source: string } | null = null;
  const ecb = await fetchJson(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
  const ecbRate = Number((ecb?.rates as Record<string, number> | undefined)?.[to]);
  if (ecbRate > 0) found = { rate: ecbRate, source: 'European Central Bank (Frankfurter)' };
  else {
    const er = await fetchJson(`https://open.er-api.com/v6/latest/${from}`);
    const erRate = Number((er?.rates as Record<string, number> | undefined)?.[to]);
    if (er?.result === 'success' && erRate > 0) found = { rate: erRate, source: 'ExchangeRate-API' };
  }
  if (!found) return cached ? (cached as { rate: number; source: string; at: number }) : null; // stale beats nothing
  const out = { ...found, at: Date.now() };
  await ref.set(out);
  return out;
}

// ─── Receipt reading ─────────────────────────────────────────────────────────

const RECEIPT_SYSTEM = `You read shop, restaurant, taxi and ticket receipts for a travel expense app.
Rules:
- total: the final amount paid (after tax, service charge and discounts), as a plain number in the receipt's currency.
- currency: ISO 4217 code (RM → MYR, ₩ → KRW, ¥ → JPY unless the receipt is clearly Chinese → CNY, S$ → SGD, ฿ → THB, Rp → IDR). Empty if unsure.
- title: short, e.g. the shop or restaurant name ("Nando's KLCC", "Grab to airport").
- date: YYYY-MM-DD if printed, else empty.
- category: food, transport, lodging, activity, shopping or other.
- items: every line item as printed (name, quantity, and the LINE amount = quantity × unit price, a plain number). Skip subtotal / total / payment / change lines.
- extra: tax + service charge + rounding − discounts, as ONE plain number (negative if the discounts are bigger), so that items + extra = total. 0 if none.
- confidence: 0..1. If this isn't a receipt, return total 0 and confidence 0.`;

const receiptSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    total: { type: Type.NUMBER },
    currency: { type: Type.STRING },
    date: { type: Type.STRING },
    category: { type: Type.STRING, enum: ExpenseCategory.options },
    items: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, qty: { type: Type.NUMBER }, amount: { type: Type.NUMBER } }, required: ['name', 'amount'] } },
    extra: { type: Type.NUMBER },
    confidence: { type: Type.NUMBER },
  },
  required: ['title', 'total', 'currency', 'category', 'confidence'],
};

const Receipt = z.object({
  title: z.string().default(''),
  total: z.number().nonnegative(),
  currency: z.string().default(''),
  date: z.string().optional(),
  category: ExpenseCategory.catch('other'),
  items: z.array(z.object({ name: z.string().catch(''), qty: z.number().optional().catch(undefined), amount: z.number().catch(0) })).max(80).catch([]),
  extra: z.number().catch(0),
  confidence: z.number().min(0).max(1).catch(0),
});

// ─── Saving ──────────────────────────────────────────────────────────────────

const ExpenseBody = z.object({
  title: z.string().trim().min(1).max(120),
  amountMinor: Expense.shape.amountMinor,
  currency: CurrencyCode,
  /** The rate the person saw (they may have typed their bank's rate). Ignored for the trip currency. */
  rate: z.number().positive().max(1_000_000),
  paidBy: Id,
  split: ExpenseSplit,
  category: ExpenseCategory,
  date: LocalDate,
  ideaId: Id.optional(),
  receiptPath: z.string().max(300).optional(),
  note: z.string().trim().max(300).optional(),
});
type ExpenseBody = z.infer<typeof ExpenseBody>;

function uidsIn(split: ExpenseSplit): string[] {
  if (split.mode === 'equal') return split.uids;
  if (split.mode === 'items') return [...new Set(split.items.flatMap((i) => i.uids))];
  return Object.entries(split.parts).filter(([, v]) => v > 0).map(([u]) => u);
}

/** Validates and fills the derived fields (rate, trip amount). */
async function build(tripId: string, body: ExpenseBody, uploaderUid: string) {
  const trip = await loadTrip(tripId);
  const everyone = new Set(trip.memberIds);
  const involved = [body.paidBy, ...uidsIn(body.split)];
  if (involved.some((u) => !everyone.has(u))) throw new HttpError(400, 'Everyone paying or sharing must be in the trip');
  const problem = splitProblem(body.split, body.amountMinor);
  if (problem) {
    if (body.split.mode !== 'exact') throw new HttpError(400, problem.replace(/add up to (-?\d+), not (\d+)/, (_m, a, b) => `add up to ${formatMoney(Number(a), body.currency)}, not ${formatMoney(Number(b), body.currency)}`));
    const sum = Object.values(body.split.parts).reduce((x, y) => x + y, 0);
    throw new HttpError(400, `The amounts add up to ${formatMoney(sum, body.currency)}, not ${formatMoney(body.amountMinor, body.currency)}`);
  }
  // Drop zero shares so the saved split only lists people who actually share.
  const split: ExpenseSplit =
    body.split.mode === 'equal' || body.split.mode === 'items' ? body.split : ({ ...body.split, parts: Object.fromEntries(Object.entries(body.split.parts).filter(([, v]) => v > 0)) } as ExpenseSplit);
  if (body.receiptPath && (!body.receiptPath.startsWith(`trips/${tripId}/users/${uploaderUid}/`) || body.receiptPath.includes('..'))) {
    throw new HttpError(403, 'Invalid receipt');
  }
  if (body.ideaId && !(await adminDb().doc(paths.idea(tripId, body.ideaId)).get()).exists) throw new HttpError(400, 'That stop is no longer on the trip');
  const rate = body.currency === trip.currency ? 1 : body.rate;
  return { trip, split, rate, tripAmountMinor: convertMinor(body.amountMinor, body.currency, trip.currency, rate) };
}

async function loadExpense(tripId: string, id: string): Promise<Expense> {
  const snap = await adminDb().doc(`${paths.expenses(tripId)}/${id}`).get();
  if (!snap.exists) throw new HttpError(404, 'Expense not found');
  return Expense.parse(snap.data());
}

/** Whoever added it, whoever paid, or the admin. */
function assertCanEdit(e: Expense, member: { uid: string; role: string }) {
  if (e.createdBy !== member.uid && e.paidBy !== member.uid && member.role !== 'admin') {
    throw new HttpError(403, 'Only the person who added or paid this, or the admin, can change it');
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export const expenseRoutes: RouteTable = {
  'POST expenses/rate': withTrip(
    async (req) => {
      const { from, to } = await readJson(req, z.object({ from: CurrencyCode, to: CurrencyCode }));
      const r = await exchangeRate(from, to);
      if (!r) throw new HttpError(502, `No exchange rate for ${from} → ${to} right now. Type the rate from your bank or card app.`);
      return json(r);
    },
    { perMinute: 30 },
  ),

  'POST expenses/receipt': withTrip(
    async (req, { tripId, member }) => {
      const { storagePath } = await readJson(req, z.object({ storagePath: z.string().max(300) }));
      if (!storagePath.startsWith(`trips/${tripId}/users/${member.uid}/`) || storagePath.includes('..')) {
        throw new HttpError(403, 'You can only read your own uploads for this trip');
      }
      await useDailyQuota(member.uid, 'receipt');
      const file = adminBucket().file(storagePath);
      const [meta] = await file.getMetadata().catch(() => {
        throw new HttpError(404, 'Upload not found — please upload it again');
      });
      const type = String(meta.contentType ?? '');
      if (!RECEIPT_TYPES.test(type)) throw new HttpError(415, 'Upload a photo or PDF of the receipt');
      const [buf] = await file.download();
      const r = await extractJson({
        system: RECEIPT_SYSTEM,
        parts: [{ inlineData: { mimeType: type, data: buf.toString('base64') } }, { text: 'Read this receipt.' }],
        responseSchema: receiptSchema,
        validate: Receipt,
      });
      const currency = /^[A-Z]{3}$/.test(r.currency.toUpperCase()) ? r.currency.toUpperCase() : '';
      return json({
        title: r.title.slice(0, 120),
        total: r.total,
        currency,
        ...(r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? { date: r.date } : {}),
        category: r.category,
        items: r.items.filter((i) => i.name.trim() && i.amount >= 0).map((i) => ({ name: `${i.qty && i.qty > 1 ? `${i.qty}× ` : ''}${i.name.trim()}`.slice(0, 80), amount: i.amount })),
        extra: r.extra,
        confidence: r.confidence,
      });
    },
    { perMinute: 6 },
  ),

  /** Receipts live in the uploader's private folder — members get a 10-minute link. */
  'POST expenses/receipt-url': withTrip(
    async (req, { tripId }) => {
      const { id } = await readJson(req, z.object({ id: Id }));
      const e = await loadExpense(tripId, id);
      if (!e.receiptPath) throw new HttpError(404, 'No receipt on this expense');
      const [url] = await adminBucket().file(e.receiptPath).getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60_000 });
      return json({ url });
    },
    { perMinute: 30 },
  ),

  'POST expenses/create': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, ExpenseBody);
      const { trip, split, rate, tripAmountMinor } = await build(tripId, body, member.uid);
      const db = adminDb();
      const ref = db.collection(paths.expenses(tripId)).doc();
      const now = Date.now();
      const expense: Expense = { ...body, split, id: ref.id, rate, tripAmountMinor, settlement: false, paidBack: {}, createdBy: member.uid, createdAt: now, updatedAt: now };
      const batch = db.batch();
      batch.set(ref, Expense.parse(expense));
      logActivity(batch, tripId, member.uid, `${member.displayName} added “${body.title}” (${formatMoney(tripAmountMinor, trip.currency)})`);
      await batch.commit();
      return json({ id: ref.id }, { status: 201 });
    },
    { perMinute: 30 },
  ),

  'POST expenses/update': withTrip(
    async (req, { tripId, member }) => {
      const { id, ...body } = await readJson(req, ExpenseBody.extend({ id: Id }));
      const current = await loadExpense(tripId, id);
      assertCanEdit(current, member);
      if (current.settlement) throw new HttpError(400, 'Payments can only be deleted, not edited');
      // Keep an existing receipt uploaded by someone else.
      const receiptPath = body.receiptPath === current.receiptPath ? undefined : body.receiptPath;
      const { split, rate, tripAmountMinor } = await build(tripId, { ...body, receiptPath }, member.uid);
      const next: Expense = {
        ...current,
        ...body,
        ...(body.receiptPath ? { receiptPath: body.receiptPath } : {}),
        split,
        rate,
        tripAmountMinor,
        updatedAt: Date.now(),
      };
      if (!body.receiptPath) delete next.receiptPath;
      if (!body.note) delete next.note;
      if (!body.ideaId) delete next.ideaId;
      await adminDb().doc(`${paths.expenses(tripId)}/${id}`).set(Expense.parse(next));
      return json({ ok: true });
    },
    { perMinute: 30 },
  ),

  'POST expenses/delete': withTrip(
    async (req, { tripId, member }) => {
      const { id } = await readJson(req, z.object({ id: Id }));
      const current = await loadExpense(tripId, id);
      // A payment can also be undone by the person who received it.
      const receiver = current.settlement && current.split.mode === 'equal' && current.split.uids.includes(member.uid);
      if (!receiver) assertCanEdit(current, member);
      const db = adminDb();
      const batch = db.batch();
      batch.delete(db.doc(`${paths.expenses(tripId)}/${id}`));
      logActivity(batch, tripId, member.uid, `${member.displayName} removed “${current.title}”`);
      await batch.commit();
      if (current.receiptPath) await adminBucket().file(current.receiptPath).delete().catch(() => {});
      return json({ ok: true });
    },
    { perMinute: 30 },
  ),

  /**
   * "X paid me back for this bill": only the person who paid the bill ticks it
   * (or un-ticks it). That share is then settled in the balances.
   */
  'POST expenses/paid-back': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ id: Id, uid: Id, paid: z.boolean() }));
      const e = await loadExpense(tripId, body.id);
      if (e.paidBy !== member.uid) throw new HttpError(403, 'Only the person who paid this bill can tick who paid them back');
      if (body.uid === e.paidBy || !(body.uid in sharesOf(e))) throw new HttpError(400, 'That person has no share in this bill');
      await adminDb()
        .doc(`${paths.expenses(tripId)}/${body.id}`)
        .update({ [`paidBack.${body.uid}`]: body.paid ? Date.now() : FieldValue.delete(), updatedAt: Date.now() });
      return json({ ok: true });
    },
    { perMinute: 60 },
  ),

  /** Record "from paid to" — confirmed by the person who received it. Amount in trip-currency minor units. */
  'POST expenses/settle': withTrip(
    async (req, { tripId, member }) => {
      const body = await readJson(req, z.object({ from: Id, to: Id, amountMinor: z.number().int().positive(), date: LocalDate }));
      if (body.from === body.to) throw new HttpError(400, 'Pick two different people');
      // Only the person who gets the money confirms it arrived — nobody can tick a payment they didn't receive.
      if (member.uid !== body.to) throw new HttpError(403, `Only ${body.to === member.uid ? 'you' : 'the person being paid'} can confirm this payment arrived`);
      const trip = await loadTrip(tripId);
      if (![body.from, body.to].every((u) => trip.memberIds.includes(u))) throw new HttpError(400, 'Both people must be in the trip');
      const db = adminDb();
      const ref = db.collection(paths.expenses(tripId)).doc();
      const now = Date.now();
      const expense: Expense = {
        id: ref.id,
        title: 'Payment',
        amountMinor: body.amountMinor,
        currency: trip.currency,
        rate: 1,
        tripAmountMinor: body.amountMinor,
        paidBy: body.from,
        split: { mode: 'equal', uids: [body.to] },
        category: 'other',
        date: body.date,
        settlement: true,
        paidBack: {},
        createdBy: member.uid,
        createdAt: now,
        updatedAt: now,
      };
      const batch = db.batch();
      batch.set(ref, expense);
      logActivity(batch, tripId, member.uid, `${member.displayName} recorded a payment of ${formatMoney(body.amountMinor, trip.currency)}`);
      await batch.commit();
      return json({ id: ref.id }, { status: 201 });
    },
    { perMinute: 30 },
  ),
};
