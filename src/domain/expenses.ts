// Group expenses: who paid, who shares, balances and the fewest transfers to
// settle up. Money is kept in minor units (cents/sen) — integers, so totals
// always add up. Each expense keeps its own currency plus the exchange rate
// into the trip currency on the day it was added.
import { z } from 'zod';
import { CurrencyCode, Id, LocalDate, Millis } from './common.js';

export const EXPENSE_CATEGORIES = {
  food: '🍜 Food',
  transport: '🚆 Transport',
  lodging: '🏨 Stay',
  activity: '🎟️ Activities',
  shopping: '🛍️ Shopping',
  other: '📦 Other',
} as const;
export const ExpenseCategory = z.enum(['food', 'transport', 'lodging', 'activity', 'shopping', 'other']);
export type ExpenseCategory = z.infer<typeof ExpenseCategory>;

/** Categories the per-person daily budget covers ("food + activities"). */
export const DAILY_BUDGET_CATEGORIES: ExpenseCategory[] = ['food', 'activity', 'shopping', 'other'];

export const ExpenseSplit = z.discriminatedUnion('mode', [
  /** Equal among these people. */
  z.object({ mode: z.literal('equal'), uids: z.array(Id).min(1).max(50) }),
  /** Exact amounts (minor units, expense currency) — must add up to the total. */
  z.object({ mode: z.literal('exact'), parts: z.record(z.string(), z.number().int().nonnegative()) }),
  /** Weights, e.g. 2 for a couple, 1 for a single. (Older expenses; not offered any more.) */
  z.object({ mode: z.literal('shares'), parts: z.record(z.string(), z.number().positive().max(100)) }),
  /**
   * By item (from the receipt, or typed): each item is shared equally by the
   * people ticked for it; `extraMinor` (tax, service charge — negative for a
   * discount) is shared in proportion to what each person had. Items + extra
   * = the total. Minor units of the expense currency.
   */
  z.object({
    mode: z.literal('items'),
    items: z
      .array(z.object({ name: z.string().trim().min(1).max(80), amountMinor: z.number().int().nonnegative(), uids: z.array(Id).min(1).max(50) }))
      .min(1)
      .max(80),
    extraMinor: z.number().int(),
  }),
]);
export type ExpenseSplit = z.infer<typeof ExpenseSplit>;

export const Expense = z.object({
  id: Id,
  title: z.string().min(1).max(120),
  /** In the expense's own currency, minor units. */
  amountMinor: z.number().int().positive().max(1_000_000_000_00),
  currency: CurrencyCode,
  /** 1 unit of `currency` = `rate` units of the trip currency. */
  rate: z.number().positive(),
  /** In the trip currency, minor units (amountMinor × rate, rounded). */
  tripAmountMinor: z.number().int().nonnegative(),
  paidBy: Id,
  split: ExpenseSplit,
  category: ExpenseCategory,
  date: LocalDate,
  /** A stop on the timeline it belongs to. */
  ideaId: Id.optional(),
  /** A settle-up payment: paidBy → the one person in split. */
  settlement: z.boolean().default(false),
  receiptPath: z.string().max(300).optional(),
  note: z.string().max(300).optional(),
  /**
   * Old per-bill "paid back" ticks. No longer counted: paying back is recorded
   * once, in Settle up, by the person who receives it — two places to tick
   * made the same money count twice. Kept so older expenses still parse.
   */
  paidBack: z.record(z.string(), Millis).default({}),
  createdBy: Id,
  createdAt: Millis,
  updatedAt: Millis,
});
export type Expense = z.infer<typeof Expense>;

/** Minor units per major unit (JPY, KRW, IDR, VND have none). */
export const minorUnits = (currency: string) => (['JPY', 'KRW', 'IDR', 'VND', 'CLP', 'ISK', 'HUF', 'TWD'].includes(currency) ? 1 : 100);

export const toMinor = (amount: number, currency: string) => Math.round(amount * minorUnits(currency));
export const formatMoney = (minor: number, currency: string, locale?: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: minorUnits(currency) === 1 ? 0 : 2 }).format(minor / minorUnits(currency));

/** Converts between currencies' minor units with a major-unit rate. */
export const convertMinor = (minor: number, from: string, to: string, rate: number) => Math.round(((minor / minorUnits(from)) * rate) * minorUnits(to));

/**
 * Splits `total` by weights so the parts are integers that add up exactly
 * (largest remainder; ties go to the earlier person).
 */
export function allocate(total: number, weights: [string, number][]): Record<string, number> {
  const sum = weights.reduce((s, [, w]) => s + w, 0);
  if (!sum) return {};
  const raw = weights.map(([u, w]) => ({ u, exact: (total * w) / sum }));
  const out = Object.fromEntries(raw.map((r) => [r.u, Math.floor(r.exact)]));
  let left = total - Object.values(out).reduce((s, v) => s + v, 0);
  for (const r of [...raw].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)))) {
    if (left <= 0) break;
    out[r.u]++;
    left--;
  }
  return out;
}

/** What each person had, by item (expense currency, minor units): items split equally, extra in proportion. */
export function itemShares(items: { amountMinor: number; uids: string[] }[], extraMinor: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    for (const [u, v] of Object.entries(allocate(it.amountMinor, it.uids.map((x) => [x, 1])))) out[u] = (out[u] ?? 0) + v;
  }
  const weights = Object.entries(out).filter(([, v]) => v > 0) as [string, number][];
  if (extraMinor && weights.length) {
    const extra = allocate(Math.abs(extraMinor), weights);
    for (const [u, v] of Object.entries(extra)) out[u] = (out[u] ?? 0) + Math.sign(extraMinor) * v;
  }
  return out;
}

/** Each person's share of an expense, in trip-currency minor units (adds up to tripAmountMinor). */
export function sharesOf(e: Pick<Expense, 'split' | 'tripAmountMinor' | 'amountMinor'>): Record<string, number> {
  const s = e.split;
  if (s.mode === 'equal') return allocate(e.tripAmountMinor, s.uids.map((u) => [u, 1]));
  if (s.mode === 'items') return allocate(e.tripAmountMinor, Object.entries(itemShares(s.items, s.extraMinor)).filter(([, v]) => v > 0));
  // Exact amounts are in the expense currency — scale them to the trip total.
  return allocate(e.tripAmountMinor, Object.entries(s.parts));
}

/** Problems with a split before saving (null = fine). */
export function splitProblem(split: ExpenseSplit, amountMinor: number): string | null {
  if (split.mode === 'equal') return split.uids.length ? null : 'Pick at least one person';
  if (split.mode === 'items') {
    if (!split.items.length) return 'Add at least one item';
    const missing = split.items.find((i) => !i.uids.length);
    if (missing) return `Tick who had “${missing.name}”`;
    const sum = split.items.reduce((a, i) => a + i.amountMinor, 0) + split.extraMinor;
    return sum === amountMinor ? null : `The items (with tax / service / discount) add up to ${sum}, not ${amountMinor}`;
  }
  const parts = Object.values(split.parts);
  if (!parts.length || parts.every((p) => p === 0)) return 'Give at least one person a share';
  if (split.mode === 'exact') {
    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum !== amountMinor) return `The amounts add up to ${sum}, not ${amountMinor}`;
  }
  return null;
}

/**
 * Net per person in trip-currency minor units: + = is owed money, − = owes.
 * Paying back is a settle-up payment (an expense with `settlement`), so it
 * counts here like any other — the only record of money changing hands.
 */
export function balances(expenses: Pick<Expense, 'paidBy' | 'split' | 'tripAmountMinor' | 'amountMinor'>[], memberIds: string[]): Record<string, number> {
  const net: Record<string, number> = Object.fromEntries(memberIds.map((u) => [u, 0]));
  for (const e of expenses) {
    net[e.paidBy] = (net[e.paidBy] ?? 0) + e.tripAmountMinor;
    for (const [u, share] of Object.entries(sharesOf(e))) net[u] = (net[u] ?? 0) - share;
  }
  return net;
}

export interface Transfer {
  from: string;
  to: string;
  amountMinor: number;
}

/** The fewest transfers (greedy: biggest debtor pays biggest creditor) — at most n−1. */
export function settleUp(net: Record<string, number>): Transfer[] {
  const debt = Object.entries(net).filter(([, v]) => v < 0).map(([u, v]) => ({ u, v: -v })).sort((a, b) => b.v - a.v);
  const cred = Object.entries(net).filter(([, v]) => v > 0).map(([u, v]) => ({ u, v })).sort((a, b) => b.v - a.v);
  const out: Transfer[] = [];
  while (debt.length && cred.length) {
    const d = debt[0];
    const c = cred[0];
    const amt = Math.min(d.v, c.v);
    if (amt > 0) out.push({ from: d.u, to: c.u, amountMinor: amt });
    d.v -= amt;
    c.v -= amt;
    if (!d.v) debt.shift();
    if (!c.v) cred.shift();
    debt.sort((a, b) => b.v - a.v);
    cred.sort((a, b) => b.v - a.v);
  }
  return out;
}

/** One person's spend per day on what the daily budget covers (their shares, not what they paid). */
export function dailySpend(expenses: Pick<Expense, 'split' | 'tripAmountMinor' | 'amountMinor' | 'date' | 'category' | 'settlement'>[], uid: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of expenses) {
    if (e.settlement || !DAILY_BUDGET_CATEGORIES.includes(e.category)) continue;
    const mine = sharesOf(e)[uid] ?? 0;
    if (mine) out[e.date] = (out[e.date] ?? 0) + mine;
  }
  return out;
}

/** Local currency for a destination's country (for the currency picker's shortcuts). */
export const COUNTRY_CURRENCY: Record<string, string> = {
  MY: 'MYR', SG: 'SGD', TH: 'THB', ID: 'IDR', JP: 'JPY', KR: 'KRW', CN: 'CNY', HK: 'HKD', TW: 'TWD', VN: 'VND',
  PH: 'PHP', BN: 'BND', IN: 'INR', AU: 'AUD', NZ: 'NZD', US: 'USD', GB: 'GBP', TR: 'TRY', SA: 'SAR', AE: 'AED',
  QA: 'QAR', EG: 'EGP', MA: 'MAD', CH: 'CHF', ...Object.fromEntries(['DE', 'FR', 'IT', 'ES', 'NL', 'AT', 'BE', 'PT', 'GR', 'FI', 'IE'].map((c) => [c, 'EUR'])),
};

export const COMMON_CURRENCIES = ['MYR', 'SGD', 'THB', 'IDR', 'JPY', 'KRW', 'CNY', 'HKD', 'TWD', 'VND', 'PHP', 'USD', 'EUR', 'GBP', 'AUD', 'SAR', 'AED', 'TRY'];

/** Currencies to offer first: the trip's, then each destination's local one, then the common ones. */
export function currencyChoices(tripCurrency: string, countryCodes: (string | undefined)[]): string[] {
  const local = countryCodes.map((c) => (c ? COUNTRY_CURRENCY[c.toUpperCase()] : undefined)).filter((c): c is string => !!c);
  return [...new Set([tripCurrency, ...local, ...COMMON_CURRENCIES])];
}
