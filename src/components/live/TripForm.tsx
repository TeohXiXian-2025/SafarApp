import { X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { CreateTripInput, MAX_TRIP_DAYS, type DestinationInput } from '../../domain';
import { currencyOptions } from '../../lib/format';
import { Button, ErrorBanner, Field, Input, Select } from '../../ui';
import { PlaceSearch } from './PlaceSearch';

interface Props {
  initial?: Partial<CreateTripInput>;
  submitLabel: string;
  onSubmit: (input: CreateTripInput) => Promise<void>;
  onCancel?: () => void;
}

export function TripForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [destinations, setDestinations] = useState<DestinationInput[]>(initial?.destinations ?? []);
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'MYR');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const currencies = useMemo(currencyOptions, []);

  const addDestination = (d: DestinationInput) => {
    setDestinations((cur) => (cur.some((x) => x.placeId && x.placeId === d.placeId) ? cur : [...cur, d]));
    // Suggest a trip name from the first destination.
    if (!name.trim()) setName(`${d.name} trip`);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = CreateTripInput.safeParse({ name: name.trim(), destinations, startDate, endDate, currency });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = String(issue.path[0] ?? '');
      setError(field === 'destinations' ? 'Add at least one destination.' : issue.message);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the trip.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="Destinations" hint="Add every city or country you'll visit, in order." group>
        <div className="space-y-2">
          {destinations.length > 0 && (
            <ol className="flex flex-wrap gap-2">
              {destinations.map((d, i) => (
                <li
                  key={`${d.placeId ?? d.name}-${i}`}
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-[#00685F]/10 text-[#00685F] text-sm font-semibold"
                >
                  <span className="text-xs opacity-60">{i + 1}.</span> {d.name}
                  <button
                    type="button"
                    aria-label={`Remove ${d.name}`}
                    onClick={() => setDestinations((cur) => cur.filter((_, j) => j !== i))}
                    className="w-6 h-6 rounded-full hover:bg-[#00685F]/15 inline-flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ol>
          )}
          <PlaceSearch onPick={addDestination} placeholder={destinations.length ? 'Add another stop…' : undefined} />
        </div>
      </Field>

      <Field label="Trip name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Japan autumn 2026" required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field label="End date">
          <Input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} required />
        </Field>
      </div>
      <p className="-mt-3 text-xs text-[#6D7A77]">Up to {MAX_TRIP_DAYS} days.</p>

      <Field label="Group currency" hint="Budgets and shared expenses are shown in this currency.">
        <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>

      <ErrorBanner>{error}</ErrorBanner>

      <div className="flex gap-3">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} className="flex-1 sm:flex-none">
            Cancel
          </Button>
        )}
        <Button type="submit" loading={busy} className="flex-1">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
