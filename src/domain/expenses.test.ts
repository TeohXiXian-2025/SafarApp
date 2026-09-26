import { describe, expect, it } from 'vitest';
import { allocate, balances, convertMinor, dailySpend, formatMoney, sharesOf, splitProblem, stillOwed, toMinor } from './expenses';

let n = 0;
const e = (paidBy: string, trip: number, split: Parameters<typeof sharesOf>[0]['split'], over = {}) => ({ id: `e${++n}`, title: `Bill ${n}`, paidBy, tripAmountMinor: trip, amountMinor: trip, split, date: '2026-12-07', category: 'food' as const, settlement: false, ...over });

describe('money maths', () => {
  it('splits cents so parts always add up', () => {
    expect(allocate(1000, [['a', 1], ['b', 1], ['c', 1]])).toEqual({ a: 334, b: 333, c: 333 });
    expect(Object.values(allocate(99_99, [['a', 2], ['b', 1], ['c', 1]])).reduce((s, v) => s + v, 0)).toBe(9999);
  });

  it('handles currencies without cents', () => {
    expect(toMinor(12.5, 'MYR')).toBe(1250);
    expect(toMinor(12500, 'KRW')).toBe(12500);
    // 50,000 KRW at 0.0032 MYR/KRW = RM 160.00
    expect(convertMinor(50_000, 'KRW', 'MYR', 0.0032)).toBe(16000);
    expect(formatMoney(16000, 'MYR', 'en-MY')).toMatch(/160\.00/);
  });

  it('shares: equal, exact (scaled to trip currency) and weights', () => {
    expect(sharesOf(e('a', 900, { mode: 'equal', uids: ['a', 'b', 'c'] }))).toEqual({ a: 300, b: 300, c: 300 });
    expect(sharesOf({ ...e('a', 1000, { mode: 'exact', parts: { a: 20, b: 80 } }), amountMinor: 100 })).toEqual({ a: 200, b: 800 });
    expect(sharesOf(e('a', 900, { mode: 'shares', parts: { a: 2, b: 1 } }))).toEqual({ a: 600, b: 300 });
  });

  it('checks splits before saving', () => {
    expect(splitProblem({ mode: 'exact', parts: { a: 40, b: 50 } }, 100)).toBe('The amounts add up to 90, not 100');
    expect(splitProblem({ mode: 'equal', uids: [] }, 100)).toBe('Pick at least one person');
    expect(splitProblem({ mode: 'shares', parts: { a: 1 } }, 100)).toBeNull();
  });

  it('who owes whom, bill by bill — no netting, so every person who shares a bill shows', () => {
    const all = ['ali', 'bob', 'cara', 'dan'];
    const list = [
      e('ali', 12000, { mode: 'equal', uids: all }), // dinner RM120
      e('bob', 4000, { mode: 'equal', uids: all }), // taxi RM40
      e('cara', 2000, { mode: 'equal', uids: ['cara', 'dan'] }), // snacks
    ];
    const owed = stillOwed(list);
    // Bob paid the taxi, but he still owes Ali for dinner (and Ali owes him for the taxi) — both shown.
    expect(owed.filter((o) => o.to === 'ali').map((o) => [o.from, o.amountMinor])).toEqual([['bob', 3000], ['cara', 3000], ['dan', 3000]]);
    expect(owed.filter((o) => o.to === 'bob').map((o) => o.from)).toEqual(['ali', 'cara', 'dan']);
    expect(owed.find((o) => o.to === 'cara')).toMatchObject({ from: 'dan', amountMinor: 1000, title: list[2].title, date: '2026-12-07' });
    const net = balances(list, all);
    expect(net).toEqual({ ali: 8000, bob: 0, cara: -3000, dan: -5000 });
    expect(Object.values(net).reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('the payer ticks someone off → that share is no longer owed', () => {
    const bill = e('ali', 900, { mode: 'equal', uids: ['ali', 'bob', 'cara'] });
    expect(stillOwed([bill]).map((o) => o.from)).toEqual(['bob', 'cara']);
    expect(stillOwed([{ ...bill, paidBack: { bob: 1 } }]).map((o) => o.from)).toEqual(['cara']);
    expect(balances([{ ...bill, paidBack: { bob: 1, cara: 2 } }], ['ali', 'bob', 'cara'])).toEqual({ ali: 0, bob: 0, cara: 0 });
  });

  it('an older recorded payment (X paid Y) pays off X’s oldest shares on Y’s bills', () => {
    const list = [e('ali', 1000, { mode: 'equal', uids: ['ali', 'bob'] }), e('ali', 2000, { mode: 'equal', uids: ['ali', 'bob'] }, { date: '2026-12-08' }), e('bob', 700, { mode: 'equal', uids: ['ali'] }, { settlement: true, date: '2026-12-09' })];
    expect(stillOwed(list).map((o) => [o.expenseId, o.amountMinor])).toEqual([[list[1].id, 800]]);
  });

  it('daily spend counts my share of food/activities only', () => {
    const list = [
      e('ali', 3000, { mode: 'equal', uids: ['ali', 'bob'] }),
      e('bob', 50000, { mode: 'equal', uids: ['ali', 'bob'] }, { category: 'lodging' }),
      e('ali', 1000, { mode: 'equal', uids: ['bob'] }, { settlement: true }),
      e('bob', 2000, { mode: 'equal', uids: ['ali'] }, { date: '2026-12-08', category: 'activity' }),
    ];
    expect(dailySpend(list, 'ali')).toEqual({ '2026-12-07': 1500, '2026-12-08': 2000 });
  });
});

describe('currency choices', () => {
  it("puts the trip's and destinations' currencies first", async () => {
    const { currencyChoices } = await import('./expenses');
    const list = currencyChoices('MYR', ['KR', 'jp', undefined]);
    expect(list.slice(0, 3)).toEqual(['MYR', 'KRW', 'JPY']);
    expect(new Set(list).size).toBe(list.length);
  });
});

describe('split amount — by item', () => {
  it('each item is shared by who had it; tax / service is shared by what each had', async () => {
    const { itemShares, sharesOf, splitProblem } = await import('./expenses');
    // Nasi lemak 12 (Ali), 2 teh tarik 8 (Ali + Bob), satay 20 (everyone) + 4 service charge = 44.
    const items = [
      { name: 'Nasi lemak', amountMinor: 1200, uids: ['ali'] },
      { name: '2× Teh tarik', amountMinor: 800, uids: ['ali', 'bob'] },
      { name: 'Satay', amountMinor: 2000, uids: ['ali', 'bob', 'cara'] },
    ];
    const had = itemShares(items, 400);
    expect(Object.values(had).reduce((a, b) => a + b, 0)).toBe(4400);
    expect(had.ali).toBeGreaterThan(had.bob);
    expect(had.bob).toBeGreaterThan(had.cara);
    const split = { mode: 'items' as const, items, extraMinor: 400 };
    expect(splitProblem(split, 4400)).toBeNull();
    expect(splitProblem({ ...split, items: [...items, { name: 'Cendol', amountMinor: 500, uids: [] }] }, 4900)).toMatch(/Tick who had/);
    const shares = sharesOf({ split, amountMinor: 4400, tripAmountMinor: 4400 });
    expect(shares.ali + shares.bob + shares.cara).toBe(4400);
  });
});
