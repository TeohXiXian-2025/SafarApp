// Add or edit an expense: optional receipt scan (AI fills it in), amount in any
// currency (today's rate, editable), who paid, and how it's split.
import { Camera, Loader2, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EXPENSE_CATEGORIES,
  Idea,
  ScheduleItem,
  allocate,
  convertMinor,
  itemShares,
  fmtClock,
  paths,
  toMin,
  currencyChoices,
  formatMoney,
  minorUnits,
  splitProblem,
  toMinor,
  type Expense,
  type ExpenseCategory,
  type ExpenseSplit,
} from '../../domain';
import { api, ApiError } from '../../lib/api';
import { useQuery } from '../../lib/firestore';
import { deleteFile, UPLOAD_ACCEPT, uploadTripFile } from '../../lib/storage';
import { Avatar, Button, Chip, cx, ErrorBanner, Field, Input, Select, Sheet } from '../../ui';
import { useTrip } from '../TripLayout';

/** Share equally, or split the amount item by item (who had what). */
type Mode = 'equal' | 'items';

interface ReceiptResult {
  title: string;
  total: number;
  currency: string;
  date?: string;
  category: ExpenseCategory;
  items?: { name: string; amount: number }[];
  extra?: number;
  confidence: number;
}

interface ItemRow {
  key: number;
  name: string;
  /** Major units, as typed. */
  amount: string;
  uids: string[];
}
let itemKey = 0;
const newItem = (name = '', amount = '', uids: string[] = []): ItemRow => ({ key: ++itemKey, name, amount, uids });

/** An older expense split by exact amounts or shares, shown as one item per person. */
function itemsFrom(e: Expense | undefined, names: (uid: string) => string): ItemRow[] {
  if (!e) return [];
  const s = e.split;
  if (s.mode === 'items') return s.items.map((i) => newItem(i.name, String(i.amountMinor / minorUnits(e.currency)), i.uids));
  if (s.mode === 'equal') return [];
  const parts = s.mode === 'exact' ? s.parts : allocate(e.amountMinor, Object.entries(s.parts));
  return Object.entries(parts).map(([u, v]) => newItem(`${names(u)}'s part`, String(v / minorUnits(e.currency)), [u]));
}

/** Today in the trip's first destination, kept within the trip dates. */
export function tripToday(trip: { startDate: string; endDate: string; destinations: { timezone: string }[] }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: trip.destinations[0]?.timezone }).format(new Date());
  return today < trip.startDate ? trip.startDate : today > trip.endDate ? trip.endDate : today;
}

const LAST_CURRENCY = (tripId: string) => `safar:lastCurrency:${tripId}`;
const major = (minor: number, currency: string) => String(minor / minorUnits(currency));

/** Starting values for a new expense (e.g. an extra cost from Emergency Resync). */
export interface ExpensePreset {
  title?: string;
  category?: ExpenseCategory;
  date?: string;
  note?: string;
}

export function ExpenseSheet({ expense, preset, onClose }: { expense?: Expense; preset?: ExpensePreset; onClose: () => void }) {
  const { trip, members, me } = useTrip();
  const choices = useMemo(
    () => [...new Set([...currencyChoices(trip.currency, trip.destinations.map((d) => d.countryCode)), ...(expense ? [expense.currency] : [])])],
    [trip, expense],
  );
  const everyone = members.map((m) => m.uid);

  const [title, setTitle] = useState(expense?.title ?? preset?.title ?? '');
  const [currency, setCurrency] = useState(() => {
    if (expense) return expense.currency;
    try {
      return localStorage.getItem(LAST_CURRENCY(trip.id)) || trip.currency;
    } catch {
      return trip.currency;
    }
  });
  const [amount, setAmount] = useState(expense ? major(expense.amountMinor, expense.currency) : '');
  const [rate, setRate] = useState(expense && expense.currency !== trip.currency ? String(expense.rate) : '');
  const [rateInfo, setRateInfo] = useState<{ loading?: boolean; source?: string; error?: string }>({});
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? me.uid);
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? preset?.category ?? 'food');
  const [date, setDate] = useState(expense?.date ?? (preset?.date && preset.date >= trip.startDate && preset.date <= trip.endDate ? preset.date : tripToday(trip)));
  const [note, setNote] = useState(expense?.note ?? preset?.note ?? '');
  const [ideaId, setIdeaId] = useState(expense?.ideaId ?? '');
  const schedule = useQuery(`schedule:${trip.id}`, () => paths.schedule(trip.id), ScheduleItem);
  const ideas = useQuery(`ideas:${trip.id}`, () => paths.ideas(trip.id), Idea);
  // Stops on the timeline that day (to link the cost to one).
  const stops = schedule.data
    .filter((s) => s.day === date && s.ref.kind === 'idea')
    .sort((a, b) => a.start.localeCompare(b.start))
    .flatMap((s) => {
      const ref = s.ref;
      const idea = ref.kind === 'idea' ? ideas.data.find((i) => i.id === ref.ideaId) : undefined;
      return idea ? [{ id: idea.id, label: `${fmtClock(toMin(s.start))} · ${idea.place.name}` }] : [];
    });
  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.displayName ?? 'Someone';
  const [mode, setMode] = useState<Mode>(!expense || expense.split.mode === 'equal' ? 'equal' : 'items');
  const [equalUids, setEqualUids] = useState<string[]>(expense?.split.mode === 'equal' ? expense.split.uids : everyone);
  // Split amount: the receipt's items (or typed ones), each with the people who had it.
  const [items, setItems] = useState<ItemRow[]>(() => {
    const from = itemsFrom(expense, nameOf);
    return from.length ? from : [newItem()];
  });
  const [receiptPath, setReceiptPath] = useState(expense?.receiptPath);
  const [scan, setScan] = useState<{ busy: boolean; note?: string }>({ busy: false });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadedHere = useRef<string | undefined>(undefined);

  // Today's rate whenever the currency changes (not for an edit that already has one).
  const initialRate = useRef(!!rate);
  useEffect(() => {
    if (currency === trip.currency) return setRateInfo({});
    if (initialRate.current) {
      initialRate.current = false;
      return;
    }
    let live = true;
    setRateInfo({ loading: true });
    api
      .post<{ rate: number; source: string }>('expenses/rate', { from: currency, to: trip.currency }, { tripId: trip.id })
      .then((r) => live && (setRate(String(+r.rate.toPrecision(6))), setRateInfo({ source: r.source })))
      .catch((e) => live && (setRate(''), setRateInfo({ error: e instanceof ApiError ? e.message : 'No rate right now — type it in.' })));
    return () => {
      live = false;
    };
  }, [currency, trip.currency, trip.id]);

  const amountMinor = toMinor(Number(amount) || 0, currency);
  const rateNum = currency === trip.currency ? 1 : Number(rate);
  const tripMinor = rateNum > 0 ? convertMinor(amountMinor, currency, trip.currency, rateNum) : 0;

  const typedItems = items.filter((i) => i.name.trim() || Number(i.amount) > 0).map((i) => ({ name: i.name.trim() || 'Item', amountMinor: toMinor(Number(i.amount) || 0, currency), uids: i.uids }));
  const itemsSum = typedItems.reduce((a, i) => a + i.amountMinor, 0);
  // Whatever the items don't cover: tax / service charge (or a discount if negative), shared by what each person had.
  const extraMinor = amountMinor - itemsSum;
  const split: ExpenseSplit = mode === 'equal' ? { mode, uids: equalUids } : { mode: 'items', items: typedItems, extraMinor };
  const perPerson = mode === 'items' ? itemShares(typedItems.filter((i) => i.uids.length), extraMinor) : {};
  const setItem = (key: number, patch: Partial<ItemRow>) => setItems((l) => l.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const toggleItemUid = (key: number, uid: string) => setItems((l) => l.map((i) => (i.key === key ? { ...i, uids: i.uids.includes(uid) ? i.uids.filter((u) => u !== uid) : [...i.uids, uid] } : i)));

  const close = () => {
    // A receipt uploaded in this sheet but never saved shouldn't linger.
    if (uploadedHere.current && uploadedHere.current !== expense?.receiptPath && !saving) void deleteFile(uploadedHere.current);
    onClose();
  };

  const onReceipt = async (file: File) => {
    setScan({ busy: true, note: 'Uploading…' });
    setError('');
    try {
      const path = await uploadTripFile(trip.id, me.uid, 'receipts', file);
      if (uploadedHere.current) void deleteFile(uploadedHere.current);
      uploadedHere.current = path;
      setReceiptPath(path);
      setScan({ busy: true, note: 'Reading the receipt…' });
      const r = await api.post<ReceiptResult>('expenses/receipt', { storagePath: path }, { tripId: trip.id });
      if (!r.total || r.confidence < 0.3) {
        setScan({ busy: false, note: "Couldn't read a total. The photo is attached; type the amount." });
        return;
      }
      if (r.title && !title) setTitle(r.title);
      setAmount(String(r.total));
      // Items on the receipt → split by item; whoever paid ticks who had what.
      if (r.items?.length) {
        setItems(r.items.map((i) => newItem(i.name, String(i.amount), [])));
        setMode('items');
      }
      if (r.currency && choices.includes(r.currency)) setCurrency(r.currency);
      if (r.date && r.date >= trip.startDate && r.date <= trip.endDate) setDate(r.date);
      setCategory(r.category);
      setScan({ busy: false, note: r.confidence < 0.7 ? 'Filled in from the receipt — please double-check.' : 'Filled in from the receipt.' });
    } catch (e) {
      setScan({ busy: false, note: e instanceof Error ? e.message : 'Could not read it.' });
    }
  };

  const save = async () => {
    if (!title.trim()) return setError('Add a short title, e.g. "Dinner at Nasi Kandar".');
    if (amountMinor <= 0) return setError('Enter the amount.');
    if (!(rateNum > 0)) return setError(`Enter the exchange rate: 1 ${currency} = ? ${trip.currency}.`);
    const problem = splitProblem(split, amountMinor);
    if (problem) return setError(problem.includes('add up to') ? `The items come to ${formatMoney(itemsSum, currency)} — more than the ${formatMoney(amountMinor, currency)} total by too much. Check the amounts.` : problem);
    if (mode === 'items' && extraMinor < 0 && -extraMinor > itemsSum * 0.5) return setError(`The items come to ${formatMoney(itemsSum, currency)}, far more than the ${formatMoney(amountMinor, currency)} total — check the amounts.`);
    setSaving(true);
    const body = {
      title: title.trim(),
      amountMinor,
      currency,
      rate: rateNum,
      paidBy,
      split,
      category,
      date,
      ...(receiptPath ? { receiptPath } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(ideaId ? { ideaId } : {}),
    };
    try {
      if (expense) await api.post('expenses/update', { id: expense.id, ...body }, { tripId: trip.id });
      else await api.post('expenses/create', body, { tripId: trip.id });
      try {
        localStorage.setItem(LAST_CURRENCY(trip.id), currency);
      } catch {
        /* private mode */
      }
      uploadedHere.current = undefined;
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
      setSaving(false);
    }
  };

  const toggleEqual = (uid: string) => setEqualUids((l) => (l.includes(uid) ? l.filter((u) => u !== uid) : [...l, uid]));

  return (
    <Sheet open onClose={close} title={expense ? 'Edit expense' : 'Add expense'}>
      <div className="space-y-4">
        <input ref={fileInput} type="file" accept={UPLOAD_ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && void onReceipt(e.target.files[0])} />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={scan.busy}
          className="w-full flex items-center gap-3 rounded-xl border border-dashed border-[#00685F]/40 bg-white px-4 py-3 text-left hover:bg-[#00685F]/5 disabled:opacity-60"
        >
          {scan.busy ? <Loader2 className="w-5 h-5 text-[#00685F] animate-spin" /> : <Camera className="w-5 h-5 text-[#00685F]" />}
          <span className="min-w-0">
            <span className="block text-sm font-bold text-[#161C23]">{receiptPath ? 'Replace receipt photo' : 'Scan a receipt'}</span>
            <span className="block text-xs text-[#6D7A77] truncate">{scan.note ?? 'AI fills in the items, amount, currency and date'}</span>
          </span>
        </button>

        <Field label="What for">
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Dinner at Nasi Kandar Pelita" />
        </Field>

        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Amount">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" />
          </Field>
          <Field label="Currency">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {choices.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>

        {currency !== trip.currency && (
          <Field
            label={`Rate: 1 ${currency} = ? ${trip.currency}`}
            hint={
              rateInfo.loading
                ? "Getting today's rate…"
                : rateInfo.error ?? (tripMinor ? `= ${formatMoney(tripMinor, trip.currency)}${rateInfo.source ? ` · ${rateInfo.source}. Change it to your card's rate if you like.` : ''}` : undefined)
            }
          >
            <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 0.0032" />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid by">
            <Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {members.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.uid === me.uid ? `${m.displayName} (you)` : m.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={date} min={trip.startDate} max={trip.endDate} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
        </div>

        <Field label="Category" group>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((c) => (
              <Chip key={c} selected={category === c} onClick={() => setCategory(c)}>
                {EXPENSE_CATEGORIES[c]}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Split" group>
          <div className="grid grid-cols-2 rounded-xl bg-[#F3EFE9] p-1 text-sm font-semibold">
            {(
              [
                ['equal', 'Share equally'],
                ['items', 'Split amount'],
              ] as const
            ).map(([m, label]) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={cx('min-h-9 rounded-lg', mode === m ? 'bg-white text-[#00685F] shadow-xs' : 'text-[#6D7A77]')}>
                {label}
              </button>
            ))}
          </div>
          {mode === 'equal' ? (
            <>
              <ul className="divide-y divide-[#E7DFD5] rounded-xl border border-[#E7DFD5] bg-white">
                {members.map((m) => (
                  <li key={m.uid} className="flex items-center gap-3 px-3 py-2">
                    <Avatar name={m.displayName} photoURL={m.photoURL} size={28} />
                    <span className="flex-1 min-w-0 truncate text-sm text-[#161C23]">{m.uid === me.uid ? `${m.displayName} (you)` : m.displayName}</span>
                    <input type="checkbox" aria-label={`${m.displayName} shares this`} className="w-5 h-5 accent-[#00685F]" checked={equalUids.includes(m.uid)} onChange={() => toggleEqual(m.uid)} />
                  </li>
                ))}
              </ul>
              {equalUids.length > 0 && amountMinor > 0 && <p className="text-xs text-[#6D7A77]">≈ {formatMoney(Math.round(amountMinor / equalUids.length), currency)} each</p>}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[#6D7A77]">Tick who had each item — people who shared one split it equally. Tax, service charge or a discount is shared by what each person had.</p>
              {items.map((it) => (
                <div key={it.key} className="rounded-xl border border-[#E7DFD5] bg-white p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input aria-label="Item" className="flex-1 !min-h-9" value={it.name} maxLength={80} placeholder="Item, e.g. Nasi lemak" onChange={(e) => setItem(it.key, { name: e.target.value })} />
                    <Input aria-label="Price" inputMode="decimal" className="!w-24 !min-h-9 text-right" value={it.amount} placeholder="0.00" onChange={(e) => setItem(it.key, { amount: e.target.value.replace(/[^\d.]/g, '') })} />
                    <button type="button" aria-label="Remove item" onClick={() => setItems((l) => (l.length > 1 ? l.filter((x) => x.key !== it.key) : [newItem()]))} className="w-8 h-8 shrink-0 flex items-center justify-center text-[#9AA5A3] hover:text-[#B3261E]">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {members.map((m) => {
                      const on = it.uids.includes(m.uid);
                      return (
                        <button
                          key={m.uid}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => toggleItemUid(it.key, m.uid)}
                          className={cx('inline-flex items-center gap-1.5 rounded-lg border px-2 min-h-8 text-xs font-semibold', on ? 'border-[#00685F] bg-[#00685F] text-white' : 'border-[#E7DFD5] bg-white text-[#161C23]')}
                        >
                          <span className={cx('w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px]', on ? 'border-white' : 'border-[#9AA5A3]')}>{on ? '✓' : ''}</span>
                          {m.uid === me.uid ? 'Me' : m.displayName.split(' ')[0]}
                        </button>
                      );
                    })}
                    <button type="button" onClick={() => setItem(it.key, { uids: it.uids.length === everyone.length ? [] : everyone })} className="rounded-lg px-2 min-h-8 text-xs font-semibold text-[#00685F]">
                      {it.uids.length === everyone.length ? 'Clear' : 'Everyone'}
                    </button>
                  </div>
                </div>
              ))}
              <Button variant="secondary" className="w-full !min-h-9" onClick={() => setItems((l) => [...l, newItem()])}>
                <Plus className="w-4 h-4" /> Add item
              </Button>
              {amountMinor > 0 && (
                <div className="rounded-xl bg-[#F3EFE9] px-3 py-2 text-xs space-y-1">
                  <p className="flex justify-between text-[#3E4947]">
                    <span>Items</span> <span className="tabular-nums">{formatMoney(itemsSum, currency)}</span>
                  </p>
                  {extraMinor !== 0 && (
                    <p className="flex justify-between text-[#3E4947]">
                      <span>{extraMinor > 0 ? 'Tax / service charge' : 'Discount'}</span> <span className="tabular-nums">{extraMinor > 0 ? '+' : '−'}{formatMoney(Math.abs(extraMinor), currency)}</span>
                    </p>
                  )}
                  <p className="flex justify-between font-bold text-[#161C23] border-t border-black/10 pt-1">
                    <span>Total</span> <span className="tabular-nums">{formatMoney(amountMinor, currency)}</span>
                  </p>
                  {Object.keys(perPerson).length > 0 && (
                    <ul className="pt-1 space-y-0.5">
                      {Object.entries(perPerson).map(([u, v]) => (
                        <li key={u} className="flex justify-between text-[#161C23]">
                          <span>{u === me.uid ? 'You' : nameOf(u)} pay{u === me.uid ? '' : 's'}</span> <span className="tabular-nums font-semibold">{formatMoney(v, currency)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </Field>

        {(stops.length > 0 || ideaId) && (
          <Field label="For a stop on the timeline (optional)">
            <Select value={ideaId} onChange={(e) => setIdeaId(e.target.value)}>
              <option value="">— Not linked —</option>
              {ideaId && !stops.some((s) => s.id === ideaId) && <option value={ideaId}>{ideas.data.find((i) => i.id === ideaId)?.place.name ?? 'A stop'}</option>}
              {stops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Note (optional)">
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Includes the tip" />
        </Field>

        <ErrorBanner>{error}</ErrorBanner>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button className="flex-1" loading={saving} disabled={scan.busy} onClick={save}>
            {expense ? 'Save changes' : 'Add expense'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
