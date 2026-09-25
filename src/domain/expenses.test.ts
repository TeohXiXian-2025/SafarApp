import { describe, expect, it } from 'vitest';
import { allocate, balances, convertMinor, dailySpend, formatMoney, settleUp, sharesOf, splitProblem, toMinor } from './expenses';

const e = (paidBy: string, trip: number, split: Parameters<typeof sharesOf>[0]['split'], over = {}) => ({ paidBy, tripAmountMinor: trip, amountMinor: trip, split, date: '2026-12-07', category: 'food' as const, settlement: false, ...over });

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

  it('balances and the fewest transfers to settle up', () => {
    const all = ['ali', 'bob', 'cara', 'dan'];
    const list = [
      e('ali', 12000, { mode: 'equal', uids: all }), // dinner RM120
      e('bob', 4000, { mode: 'equal', uids: all }), // taxi RM40
      e('cara', 2000, { mode: 'equal', uids: ['cara', 'dan'] }), // snacks
    ];
    const net = balances(list, all);
    expect(net).toEqual({ ali: 8000, bob: 0, cara: -3000, dan: -5000 });
    expect(Object.values(net).reduce((s, v) => s + v, 0)).toBe(0);
    const t = settleUp(net);
    expect(t).toEqual([
      { from: 'dan', to: 'ali', amountMinor: 5000 },
      { from: 'cara', to: 'ali', amountMinor: 3000 },
    ]);
    // After paying (a settlement is an expense paid by the debtor for the creditor), everyone is square.
    const paid = [...list, ...t.map((x) => e(x.from, x.amountMinor, { mode: 'equal', uids: [x.to] }, { settlement: true }))];
    expect(Object.values(balances(paid, all)).every((v) => v === 0)).toBe(true);
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
