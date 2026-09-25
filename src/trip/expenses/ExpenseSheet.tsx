// Add or edit an expense: optional receipt scan (AI fills it in), amount in any
// currency (today's rate, editable), who paid, and how it's split.
import { Camera, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EXPENSE_CATEGORIES,
  convertMinor,
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
import { deleteFile, UPLOAD_ACCEPT, uploadTripFile } from '../../lib/storage';
import { Avatar, Button, Chip, cx, ErrorBanner, Field, Input, Select, Sheet } from '../../ui';
import { useTrip } from '../TripLayout';

type Mode = ExpenseSplit['mode'];

interface ReceiptResult {
  title: string;
  total: number;
  currency: string;
  date?: string;
  category: ExpenseCategory;
  confidence: number;
}

/** Today in the trip's first destination, kept within the trip dates. */
export function tripToday(trip: { startDate: string; endDate: string; destinations: { timezone: string }[] }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: trip.destinations[0]?.timezone }).format(new Date());
  return today < trip.startDate ? trip.startDate : today > trip.endDate ? trip.endDate : today;
}

const LAST_CURRENCY = (tripId: string) => `safar:lastCurrency:${tripId}`;
const major = (minor: number, currency: string) => String(minor / minorUnits(currency));

export function ExpenseSheet({ expense, onClose }: { expense?: Expense; onClose: () => void }) {
  const { trip, members, me } = useTrip();
  const choices = useMemo(
    () => [...new Set([...currencyChoices(trip.currency, trip.destinations.map((d) => d.countryCode)), ...(expense ? [expense.currency] : [])])],
    [trip, expense],
  );
  const everyone = members.map((m) => m.uid);

  const [title, setTitle] = useState(expense?.title ?? '');
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
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'food');
  const [date, setDate] = useState(expense?.date ?? tripToday(trip));
  const [note, setNote] = useState(expense?.note ?? '');
  const [mode, setMode] = useState<Mode>(expense?.split.mode ?? 'equal');
  const [equalUids, setEqualUids] = useState<string[]>(expense?.split.mode === 'equal' ? expense.split.uids : everyone);
  // Exact: amounts in the expense currency (major units, as typed). Shares: weights.
  const [parts, setParts] = useState<Record<string, string>>(() =>
    expense && expense.split.mode !== 'equal'
      ? Object.fromEntries(Object.entries(expense.split.parts).map(([u, v]) => [u, expense.split.mode === 'exact' ? major(v, expense.currency) : String(v)]))
      : {},
  );
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

  const split: ExpenseSplit =
    mode === 'equal'
      ? { mode, uids: equalUids }
      : {
          mode,
          parts: Object.fromEntries(
            Object.entries(parts)
              .map(([u, v]) => [u, mode === 'exact' ? toMinor(Number(v) || 0, currency) : Number(v) || 0] as const)
              .filter(([, v]) => v > 0),
          ),
        };
  const exactLeft = mode === 'exact' ? amountMinor - Object.values((split as { parts: Record<string, number> }).parts).reduce((a, b) => a + b, 0) : 0;

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
    if (problem) return setError(mode === 'exact' ? `The amounts must add up to ${formatMoney(amountMinor, currency)}.` : problem);
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
      ...(expense?.ideaId ? { ideaId: expense.ideaId } : {}),
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
            <span className="block text-xs text-[#6D7A77] truncate">{scan.note ?? 'AI fills in the amount, currency and date'}</span>
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
          <div className="grid grid-cols-3 rounded-xl bg-[#F3EFE9] p-1 text-sm font-semibold">
            {(
              [
                ['equal', 'Equally'],
                ['exact', 'Amounts'],
                ['shares', 'Shares'],
              ] as const
            ).map(([m, label]) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={cx('min-h-9 rounded-lg', mode === m ? 'bg-white text-[#00685F] shadow-xs' : 'text-[#6D7A77]')}>
                {label}
              </button>
            ))}
          </div>
          <ul className="divide-y divide-[#E7DFD5] rounded-xl border border-[#E7DFD5] bg-white">
            {members.map((m) => {
              const name = m.uid === me.uid ? `${m.displayName} (you)` : m.displayName;
              return (
                <li key={m.uid} className="flex items-center gap-3 px-3 py-2">
                  <Avatar name={m.displayName} photoURL={m.photoURL} size={28} />
                  <span className="flex-1 min-w-0 truncate text-sm text-[#161C23]">{name}</span>
                  {mode === 'equal' ? (
                    <input type="checkbox" aria-label={`${m.displayName} shares this`} className="w-5 h-5 accent-[#00685F]" checked={equalUids.includes(m.uid)} onChange={() => toggleEqual(m.uid)} />
                  ) : (
                    <Input
                      aria-label={mode === 'exact' ? `${m.displayName}'s amount` : `${m.displayName}'s shares`}
                      inputMode="decimal"
                      className="!w-24 !min-h-9 text-right"
                      placeholder="0"
                      value={parts[m.uid] ?? ''}
                      onChange={(e) => setParts((p) => ({ ...p, [m.uid]: e.target.value.replace(/[^\d.]/g, '') }))}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          {mode === 'equal' && equalUids.length > 0 && amountMinor > 0 && (
            <p className="text-xs text-[#6D7A77]">≈ {formatMoney(Math.round(amountMinor / equalUids.length), currency)} each</p>
          )}
          {mode === 'exact' && amountMinor > 0 && (
            <p className={cx('text-xs', exactLeft ? 'text-[#96590B]' : 'text-[#00685F]')}>
              {exactLeft === 0 ? 'Adds up ✓' : exactLeft > 0 ? `${formatMoney(exactLeft, currency)} still to assign` : `${formatMoney(-exactLeft, currency)} too much`}
            </p>
          )}
          {mode === 'shares' && <p className="text-xs text-[#6D7A77]">E.g. 2 for a couple and 1 for everyone else.</p>}
        </Field>

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
