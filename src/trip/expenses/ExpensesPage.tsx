// Money tab: my balance, the fewest payments to settle up, my daily budget vs
// what I actually spent, spending by category, and every expense by day.
import { ArrowRight, Check, Paperclip, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  EXPENSE_CATEGORIES,
  Expense,
  Idea,
  balances,
  dailySpend,
  formatMoney,
  paths,
  settleUp,
  sharesOf,
  toMinor,
  type ExpenseCategory,
  type Transfer,
} from '../../domain';
import { api, ApiError } from '../../lib/api';
import { useQuery } from '../../lib/firestore';
import { Avatar, Button, Card, cx, ErrorBanner, Spinner } from '../../ui';
import { formatDay } from '../bookings/format';
import { useTrip } from '../TripLayout';
import { ExpenseSheet, tripToday } from './ExpenseSheet';

export function ExpensesPage() {
  const { trip, members, me } = useTrip();
  const expenses = useQuery(`expenses:${trip.id}`, () => paths.expenses(trip.id), Expense);
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const ideas = useQuery(`ideas:${trip.id}`, () => paths.ideas(trip.id), Idea);
  const stopName = (id?: string) => (id ? ideas.data.find((i) => i.id === id)?.place.name : undefined);
  const money = (minor: number) => formatMoney(minor, trip.currency);
  const nameOf = (uid: string) => (uid === me.uid ? 'You' : members.find((m) => m.uid === uid)?.displayName ?? 'Former member');

  const view = useMemo(() => {
    const list = expenses.data;
    const spending = list.filter((e) => !e.settlement);
    const net = balances(list, trip.memberIds);
    const byCategory = new Map<ExpenseCategory, number>();
    for (const e of spending) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.tripAmountMinor);
    const byDay = new Map<string, Expense[]>();
    for (const e of [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
    const paid: Record<string, number> = {};
    const share: Record<string, number> = {};
    for (const e of spending) {
      paid[e.paidBy] = (paid[e.paidBy] ?? 0) + e.tripAmountMinor;
      for (const [u, v] of Object.entries(sharesOf(e))) share[u] = (share[u] ?? 0) + v;
    }
    return {
      paid,
      share,
      net,
      transfers: settleUp(net),
      total: spending.reduce((s, e) => s + e.tripAmountMinor, 0),
      myShare: spending.reduce((s, e) => s + (sharesOf(e)[me.uid] ?? 0), 0),
      byCategory: [...byCategory].sort((a, b) => b[1] - a[1]),
      byDay: [...byDay],
      daily: dailySpend(list, me.uid),
    };
  }, [expenses.data, trip.memberIds, me.uid]);

  const mine = view.net[me.uid] ?? 0;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-[#161C23]">Money</h1>
          <p className="text-sm text-[#6D7A77]">Shared costs, who owes whom, and your budget. Everything in {trip.currency}.</p>
        </div>
        <Button onClick={() => setEditing('new')} className="shrink-0">
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      {expenses.error && <ErrorBanner>Could not load expenses: {expenses.error.message}</ErrorBanner>}

      {expenses.loading ? (
        <Spinner />
      ) : expenses.data.length === 0 ? (
        <Card className="p-6 text-center space-y-3">
          <p className="font-bold text-[#161C23]">No expenses yet</p>
          <p className="text-sm text-[#6D7A77]">Add what someone paid for the group: snap the receipt, and Safar works out who owes whom in the fewest payments.</p>
          <Button onClick={() => setEditing('new')}>
            <Plus className="w-4 h-4" /> Add the first expense
          </Button>
        </Card>
      ) : (
        <>
          <Card className="p-4 grid grid-cols-3 gap-3 text-center">
            <Stat label={mine > 0 ? "You're owed" : mine < 0 ? 'You owe' : 'Your balance'} value={mine ? money(Math.abs(mine)) : 'All square'} tone={mine > 0 ? 'good' : mine < 0 ? 'bad' : undefined} />
            <Stat label="Your share" value={money(view.myShare)} />
            <Stat label="Group spent" value={money(view.total)} />
          </Card>

          <SettleUp transfers={view.transfers} nameOf={nameOf} money={money} />

          {members.length > 1 && (
            <Card className="p-4 space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#6D7A77]">Everyone</h2>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-sm">
                <span />
                <span className="text-[11px] font-bold text-[#6D7A77] text-right">Paid</span>
                <span className="text-[11px] font-bold text-[#6D7A77] text-right">Share</span>
                <span className="text-[11px] font-bold text-[#6D7A77] text-right">Balance</span>
                {[...new Set([...trip.memberIds, ...Object.keys(view.net)])].map((u) => {
                  const n = view.net[u] ?? 0;
                  return (
                    <div key={u} className="contents">
                      <span className={cx('truncate', u === me.uid ? 'font-bold text-[#161C23]' : 'text-[#161C23]')}>{nameOf(u)}</span>
                      <span className="text-right text-[#161C23]">{money(view.paid[u] ?? 0)}</span>
                      <span className="text-right text-[#161C23]">{money(view.share[u] ?? 0)}</span>
                      <span className={cx('text-right font-semibold', n > 0 ? 'text-[#00685F]' : n < 0 ? 'text-[#B3261E]' : 'text-[#6D7A77]')}>{n ? `${n > 0 ? '+' : '−'}${money(Math.abs(n))}` : '0'}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-[#6D7A77]">+ is owed money, − owes. Balances include payments already recorded.</p>
            </Card>
          )}
          <Budget daily={view.daily} money={money} />

          {view.byCategory.length > 1 && (
            <Card className="p-4 space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#6D7A77]">By category</h2>
              {view.byCategory.map(([c, v]) => (
                <div key={c} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-[#161C23]">{EXPENSE_CATEGORIES[c]}</span>
                  <span className="flex-1 h-2 rounded-full bg-[#F3EFE9] overflow-hidden">
                    <span className="block h-full rounded-full bg-[#00685F]" style={{ width: `${Math.max(3, (v / view.total) * 100)}%` }} />
                  </span>
                  <span className="w-24 shrink-0 text-right font-semibold text-[#161C23]">{money(v)}</span>
                </div>
              ))}
            </Card>
          )}

          {view.byDay.map(([day, list]) => (
            <section key={day} className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#6D7A77]">{formatDay(day)}</h2>
              <Card className="divide-y divide-[#E7DFD5]">
                {list.map((e) => (
                  <ExpenseRow key={e.id} expense={e} nameOf={nameOf} money={money} stop={stopName(e.ideaId)} onEdit={() => setEditing(e)} />
                ))}
              </Card>
            </section>
          ))}
        </>
      )}

      {editing && <ExpenseSheet expense={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#6D7A77]">{label}</p>
      <p className={cx('font-extrabold truncate', tone === 'good' ? 'text-[#00685F]' : tone === 'bad' ? 'text-[#B3261E]' : 'text-[#161C23]')}>{value}</p>
    </div>
  );
}

function SettleUp({ transfers, nameOf, money }: { transfers: Transfer[]; nameOf: (uid: string) => string; money: (m: number) => string }) {
  const { trip, members, me } = useTrip();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState('');
  if (!transfers.length) return null;

  const record = async (t: Transfer) => {
    if (!confirm(`Confirm that ${nameOf(t.from)} paid you ${money(t.amountMinor)}? Only tick it once the money has arrived.`)) return;
    setBusy(`${t.from}>${t.to}`);
    setError('');
    try {
      await api.post('expenses/settle', { ...t, date: tripToday(trip) }, { tripId: trip.id });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not record it.');
    } finally {
      setBusy(undefined);
    }
  };

  // My own payments first.
  const sorted = [...transfers].sort((a, b) => +[b.from, b.to].includes(me.uid) - +[a.from, a.to].includes(me.uid));
  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="font-bold text-[#161C23]">Settle up</h2>
        <p className="text-xs text-[#6D7A77]">The fewest payments that make everyone square. Pay by bank transfer, DuitNow or cash — the person who receives it ticks it here.</p>
      </div>
      <ul className="space-y-2">
        {sorted.map((t) => {
          const involved = t.from === me.uid || t.to === me.uid;
          const from = members.find((m) => m.uid === t.from);
          const to = members.find((m) => m.uid === t.to);
          return (
            <li key={`${t.from}>${t.to}`} className={cx('flex items-center gap-2 rounded-xl p-2.5', involved ? 'bg-[#00685F]/5 ring-1 ring-[#00685F]/20' : 'bg-[#FAF8F5]')}>
              <Avatar name={from?.displayName ?? '?'} photoURL={from?.photoURL} size={28} />
              <span className="text-sm font-semibold text-[#161C23] truncate">{nameOf(t.from)}</span>
              <ArrowRight className="w-4 h-4 text-[#6D7A77] shrink-0" />
              <Avatar name={to?.displayName ?? '?'} photoURL={to?.photoURL} size={28} />
              <span className="text-sm font-semibold text-[#161C23] truncate flex-1">{nameOf(t.to)}</span>
              <span className="font-extrabold text-[#161C23] shrink-0">{money(t.amountMinor)}</span>
              {t.to === me.uid ? (
                <Button variant="secondary" className="!min-h-9 !px-2.5 shrink-0" loading={busy === `${t.from}>${t.to}`} onClick={() => void record(t)} aria-label={`${nameOf(t.from)} paid you — confirm`}>
                  <Check className="w-4 h-4" /> <span className="hidden sm:inline">Received</span>
                </Button>
              ) : t.from === me.uid ? (
                <span className="shrink-0 text-[11px] text-[#6D7A77] max-w-[7rem] text-right">{nameOf(t.to)} ticks it once it arrives</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <ErrorBanner>{error}</ErrorBanner>
    </Card>
  );
}

function Budget({ daily, money }: { daily: Record<string, number>; money: (m: number) => string }) {
  const { trip, me } = useTrip();
  const budget = me.prefs?.dailyBudget;
  if (!budget) {
    return (
      <Card className="p-4 text-sm text-[#6D7A77]">
        Set a <strong className="text-[#161C23]">daily budget</strong> in{' '}
        <Link to="../preferences" className="font-semibold text-[#00685F] underline">
          your preferences
        </Link>{' '}
        to see how each day compares.
      </Card>
    );
  }
  const budgetMinor = toMinor(budget, trip.currency);
  const today = tripToday(trip);
  const days = Object.keys(daily).sort();
  if (!days.length) return null;
  const spent = days.reduce((s, d) => s + daily[d], 0);
  const avg = Math.round(spent / days.length);
  const max = Math.max(budgetMinor, ...Object.values(daily));
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-bold text-[#161C23]">Your daily budget</h2>
        <span className={cx('text-sm font-semibold', avg > budgetMinor ? 'text-[#B3261E]' : 'text-[#00685F]')}>
          avg {money(avg)} / {money(budgetMinor)}
        </span>
      </div>
      <p className="text-xs text-[#6D7A77]">Your share of food, activities and shopping. Stays and transport aren't counted.</p>
      <ul className="space-y-1.5">
        {days.map((d) => {
          const v = daily[d];
          const over = v > budgetMinor;
          return (
            <li key={d} className="flex items-center gap-3 text-sm">
              <span className={cx('w-24 shrink-0', d === today ? 'font-bold text-[#161C23]' : 'text-[#6D7A77]')}>{d === today ? 'Today' : formatDay(d)}</span>
              <span className="relative flex-1 h-2 rounded-full bg-[#F3EFE9]">
                <span className={cx('absolute inset-y-0 left-0 rounded-full', over ? 'bg-[#B3261E]' : 'bg-[#00685F]')} style={{ width: `${(v / max) * 100}%` }} />
                <span className="absolute -inset-y-1 w-0.5 bg-[#161C23]/40" style={{ left: `${(budgetMinor / max) * 100}%` }} aria-hidden />
              </span>
              <span className={cx('w-24 shrink-0 text-right font-semibold', over ? 'text-[#B3261E]' : 'text-[#161C23]')}>{money(v)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ExpenseRow({ expense: e, nameOf, money, stop, onEdit }: { expense: Expense; nameOf: (uid: string) => string; money: (m: number) => string; stop?: string; onEdit: () => void }) {
  const { trip, me, isAdmin } = useTrip();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shares = sharesOf(e);
  const myShare = shares[me.uid] ?? 0;
  const iPaid = e.paidBy === me.uid;
  const owers = Object.entries(shares).filter(([u, v]) => u !== e.paidBy && v > 0);
  const [ticking, setTicking] = useState<string>();
  const tick = async (uid: string, paid: boolean) => {
    setTicking(uid);
    setError('');
    try {
      await api.post('expenses/paid-back', { id: e.id, uid, paid }, { tripId: trip.id });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setTicking(undefined);
    }
  };
  const receiver = e.settlement && e.split.mode === 'equal' && e.split.uids.includes(me.uid);
  const canEdit = e.createdBy === me.uid || e.paidBy === me.uid || isAdmin;
  const canDelete = canEdit || receiver;

  const remove = async () => {
    if (!confirm(e.settlement ? 'Undo this payment?' : `Delete “${e.title}”?`)) return;
    setBusy(true);
    try {
      await api.post('expenses/delete', { id: e.id }, { tripId: trip.id });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete.');
      setBusy(false);
    }
  };
  const openReceipt = async () => {
    // Open the tab now so phones don't block it as a pop-up.
    const tab = window.open('', '_blank');
    try {
      const { url } = await api.post<{ url: string }>('expenses/receipt-url', { id: e.id }, { tripId: trip.id });
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      setError(err instanceof ApiError ? err.message : 'Could not open the receipt.');
    }
  };

  if (e.settlement) {
    const to = e.split.mode === 'equal' ? e.split.uids[0] : '';
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="w-9 h-9 rounded-xl bg-[#00685F]/10 text-[#00685F] flex items-center justify-center shrink-0">
          <Check className="w-4 h-4" />
        </span>
        <p className="flex-1 min-w-0 text-sm text-[#161C23]">
          <strong>{nameOf(e.paidBy)}</strong> paid <strong>{nameOf(to)}</strong> {money(e.tripAmountMinor)}
        </p>
        {canDelete && (
          <button type="button" aria-label="Undo payment" onClick={remove} disabled={busy} className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-[#6D7A77] hover:bg-[#FDECEA] hover:text-[#B3261E]">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <ErrorBanner>{error}</ErrorBanner>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-[#F3EFE9] flex items-center justify-center shrink-0 text-lg" aria-hidden>
          {EXPENSE_CATEGORIES[e.category].split(' ')[0]}
        </span>
        <button type="button" onClick={canEdit ? onEdit : undefined} className={cx('flex-1 min-w-0 text-left', !canEdit && 'cursor-default')}>
          <p className="font-bold text-[#161C23] truncate">{e.title}</p>
          <p className="text-xs text-[#6D7A77]">
            {nameOf(e.paidBy)} paid {money(e.tripAmountMinor)}
            {e.currency !== trip.currency && ` (${formatMoney(e.amountMinor, e.currency)})`}
            {stop && ` · at ${stop}`}
            {e.note && ` · ${e.note}`}
          </p>
        </button>
        <div className="text-right shrink-0">
          <p className={cx('text-sm font-bold', myShare ? 'text-[#161C23]' : 'text-[#9AA5A3]')}>{myShare ? money(myShare) : '—'}</p>
          <p className="text-[11px] text-[#6D7A77]">{myShare ? 'your share' : 'not yours'}</p>
        </div>
      </div>
      {owers.length > 0 && (
        <ul className="ml-12 space-y-1">
          {owers.map(([u, v]) => {
            const back = !!e.paidBack?.[u];
            return (
              <li key={u} className="flex items-center gap-2 text-xs">
                <label className={cx('flex items-center gap-2 flex-1 min-w-0', iPaid ? 'cursor-pointer' : 'cursor-default')}>
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-[#00685F]"
                    checked={back}
                    disabled={!iPaid || ticking === u}
                    onChange={() => void tick(u, !back)}
                    aria-label={`${nameOf(u)} paid ${nameOf(e.paidBy)} back`}
                  />
                  <span className={cx('truncate', back ? 'text-[#6D7A77] line-through' : 'text-[#161C23]')}>
                    {u === me.uid ? 'You' : nameOf(u)} owe{u === me.uid ? '' : 's'} {money(v)}
                  </span>
                </label>
                <span className={cx('shrink-0', back ? 'text-[#00685F] font-semibold' : 'text-[#9AA5A3]')}>{back ? 'paid back ✓' : iPaid ? 'tick when paid' : `${nameOf(e.paidBy)} ticks it`}</span>
              </li>
            );
          })}
        </ul>
      )}
      {(e.receiptPath || canDelete) && (
        <div className="flex justify-end gap-1">
          {e.receiptPath && (
            <button type="button" onClick={() => void openReceipt()} className="h-8 px-2 rounded-lg inline-flex items-center gap-1 text-xs font-semibold text-[#6D7A77] hover:bg-[#F3EFE9]">
              <Paperclip className="w-3.5 h-3.5" /> Receipt
            </button>
          )}
          {canDelete && (
            <button type="button" aria-label="Delete expense" onClick={remove} disabled={busy} className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-[#6D7A77] hover:bg-[#FDECEA] hover:text-[#B3261E]">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      <ErrorBanner>{error}</ErrorBanner>
    </div>
  );
}
