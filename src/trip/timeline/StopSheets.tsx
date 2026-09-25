// Tap-friendly alternatives to dragging: edit a stop (day, time, length,
// remove) and add a backlog idea to a day — the "Move to…" sheet on phones.
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { fmtClock, openingRanges, toClock, toMin, type Idea, type ScheduleItem } from '../../domain';
import { Button, ErrorBanner, Field, Input, Select, Sheet } from '../../ui';
import { formatDay } from '../bookings/format';

const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480];
const durLabel = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

function DurationSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const options = DURATIONS.includes(value) ? DURATIONS : [...DURATIONS, value].sort((a, b) => a - b);
  return (
    <Select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((m) => (
        <option key={m} value={m}>
          {durLabel(m)}
        </option>
      ))}
    </Select>
  );
}

function DaySelect({ days, value, onChange }: { days: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {days.map((d, i) => (
        <option key={d} value={d}>
          Day {i + 1} · {formatDay(d)}
        </option>
      ))}
    </Select>
  );
}

function HoursHint({ idea, day }: { idea?: Idea; day: string }) {
  const open = openingRanges(idea?.place.openingHours, day);
  if (!idea?.place.openingHours) return null;
  const text =
    open === null
      ? 'Open all day (or hours unclear)'
      : open.length === 0
        ? 'Closed this day'
        : open.map(([o, c]) => `${fmtClock(o)}–${fmtClock(c)}`).join(', ');
  return (
    <p className="text-xs text-[#6D7A77]">
      Opening hours on {formatDay(day)}: {text}
    </p>
  );
}

const mapsLink = (idea: Idea) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(idea.place.name)}${idea.place.placeId ? `&query_place_id=${idea.place.placeId}` : ''}`;

export function EditStopSheet({
  item,
  title,
  onClose,
  ...rest
}: {
  item: ScheduleItem | null;
  idea?: Idea;
  title: string;
  /** Split pairs: the length comes from the split (both groups + walking). */
  fixedLength?: boolean;
  days: string[];
  onClose: () => void;
  onSave: (patch: { day: string; start: string; durationMin: number }) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  return (
    <Sheet open={!!item} onClose={onClose} title={title}>
      {/* Keyed per stop so the form starts from that stop's values on the first render. */}
      {item && <EditStopForm key={item.id} item={item} onClose={onClose} {...rest} />}
    </Sheet>
  );
}

function EditStopForm({
  item,
  idea,
  fixedLength,
  days,
  onClose,
  onSave,
  onRemove,
}: {
  item: ScheduleItem;
  idea?: Idea;
  fixedLength?: boolean;
  days: string[];
  onClose: () => void;
  onSave: (patch: { day: string; start: string; durationMin: number }) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [day, setDay] = useState(item.day);
  const [start, setStart] = useState(item.start);
  const [duration, setDuration] = useState(Math.max(5, toMin(item.end) - toMin(item.start)));
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState('');

  const run = async (kind: 'save' | 'remove', fn: () => Promise<void>) => {
    setBusy(kind);
    setError('');
    try {
      await fn();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {idea && (
        <div className="text-sm text-[#6D7A77] space-y-1">
          {idea.place.address && <p>{idea.place.address}</p>}
          <a href={mapsLink(idea)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#00685F]">
            Open in Google Maps <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
      <Field label="Day">
        <DaySelect days={days} value={day} onChange={setDay} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <Input type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} required />
        </Field>
        {!fixedLength && (
          <Field label="How long">
            <DurationSelect value={duration} onChange={setDuration} />
          </Field>
        )}
      </div>
      {fixedLength && <p className="text-xs text-[#6D7A77]">Both groups move together; the split takes {durLabel(duration)} including the walk.</p>}
      {start && <p className="text-xs text-[#6D7A77]">Ends at {fmtClock(Math.min(toMin(start) + duration, 24 * 60 - 1))}</p>}
      <HoursHint idea={idea} day={day} />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between">
        <Button variant="secondary" disabled={!!busy} onClick={() => run('remove', onRemove)}>
          {busy === 'remove' ? 'Removing…' : 'Take off timeline'}
        </Button>
        <Button
          disabled={!!busy || !/^\d{2}:\d{2}$/.test(start)}
          onClick={() =>
            run('save', () =>
              onSave({
                day,
                start: toClock(toMin(start)),
                durationMin: duration,
              }),
            )
          }
        >
          {busy === 'save' ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

export function AddStopSheet({
  idea,
  onClose,
  ...rest
}: {
  idea: Idea | null;
  days: string[];
  defaultDay: string;
  onClose: () => void;
  onAdd: (day: string, start?: string) => Promise<void>;
}) {
  return (
    <Sheet open={!!idea} onClose={onClose} title={idea ? `Add ${idea.place.name}` : 'Add'}>
      {idea && <AddStopForm key={idea.id} idea={idea} onClose={onClose} {...rest} />}
    </Sheet>
  );
}

function AddStopForm({
  idea,
  days,
  defaultDay,
  onClose,
  onAdd,
}: {
  idea: Idea;
  days: string[];
  defaultDay: string;
  onClose: () => void;
  onAdd: (day: string, start?: string) => Promise<void>;
}) {
  const [day, setDay] = useState(defaultDay);
  const [start, setStart] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      await onAdd(day, start || undefined);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Day">
        <DaySelect days={days} value={day} onChange={setDay} />
      </Field>
      <Field label="Start" hint="Leave empty to go after the day's last stop.">
        <Input type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <p className="text-xs text-[#6D7A77]">Planned for {durLabel(idea.estDurationMin)} — change it after adding.</p>
      <HoursHint idea={idea} day={day} />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Button className="w-full" disabled={busy} onClick={add}>
        {busy ? 'Adding…' : `Add to ${formatDay(day)}`}
      </Button>
    </div>
  );
}
