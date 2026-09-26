// Tap-friendly alternatives to dragging: edit a stop (day, time, length,
// remove) and add a backlog idea to a day — the "Move to…" sheet on phones.
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { fmtClock, openingRanges, toClock, toMin, type DayWarning, type Idea, type ScheduleItem } from '../../domain';
import { Button, cx, ErrorBanner, Field, Input, Select, Sheet } from '../../ui';
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

/** Checks a proposed day/time against opening hours, travel and the rest of the day (see TimelinePage). */
export interface Checker {
  check: (day: string, start: number, duration: number) => DayWarning[];
  suggest: (day: string, duration: number) => number | null;
}

/** Live warnings for the time being picked, and a way to find one that works. */
function PlacementCheck({ checker, day, start, duration, onPick }: { checker?: Checker; day: string; start: string; duration: number; onPick: (hhmm: string) => void }) {
  const [none, setNone] = useState(false);
  if (!checker) return null;
  const valid = /^\d{2}:\d{2}$/.test(start);
  const warnings = valid ? checker.check(day, toMin(start), duration) : [];
  const find = () => {
    const s = checker.suggest(day, duration);
    setNone(s === null);
    if (s !== null) onPick(toClock(s));
  };
  return (
    <div className="space-y-1.5">
      {valid && !warnings.length && <p className="text-xs font-semibold text-[#0B6B45]">✓ Fits opening hours and travel time</p>}
      {warnings.map((w) => (
        <p key={w.kind + w.itemId} className={cx('text-xs flex gap-1.5', w.severity === 'block' ? 'text-[#B3261E]' : 'text-[#8A5A00]')}>
          <span>{w.severity === 'block' ? '🔴' : '🟡'}</span> {w.itemId === CANDIDATE ? w.text : `Next stop: ${w.text}`}
        </p>
      ))}
      {(warnings.length > 0 || !valid) && (
        <button type="button" onClick={find} className="text-xs font-bold text-[#00685F] underline underline-offset-2">
          Find a time that works
        </button>
      )}
      {none && <p className="text-xs text-[#B3261E]">Nothing fits on this day (opening hours / the rest of the plan) — try another day.</p>}
    </div>
  );
}

/** The id the checker gives the stop being placed. */
export const CANDIDATE = '__candidate';

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
  checker?: Checker;
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
  checker,
  onClose,
  onSave,
  onRemove,
}: {
  item: ScheduleItem;
  idea?: Idea;
  fixedLength?: boolean;
  days: string[];
  checker?: Checker;
  onClose: () => void;
  onSave: (patch: { day: string; start: string; durationMin: number }) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [day, setDay] = useState(item.day);
  const [start, setStart] = useState(item.start);
  const [duration, setDuration] = useState(Math.max(5, toMin(item.end) - toMin(item.start)));
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const blocked = !!checker && /^\d{2}:\d{2}$/.test(start) && checker.check(day, toMin(start), duration).some((w) => w.severity === 'block');
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
      <PlacementCheck checker={checker} day={day} start={start} duration={duration} onPick={setStart} />
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
          {busy === 'save' ? 'Saving…' : blocked ? 'Save anyway' : 'Save'}
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
  /** The best day + start for this length (a clash-free time in the idea's city if there is one). */
  pickDefault?: (duration: number) => { day: string; start: string; fits: boolean };
  checker?: Checker;
  onClose: () => void;
  onAdd: (day: string, start: string | undefined, durationMin: number) => Promise<void>;
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
  pickDefault,
  checker,
  onClose,
  onAdd,
}: {
  idea: Idea;
  days: string[];
  defaultDay: string;
  pickDefault?: (duration: number) => { day: string; start: string; fits: boolean };
  checker?: Checker;
  onClose: () => void;
  onAdd: (day: string, start: string | undefined, durationMin: number) => Promise<void>;
}) {
  // Pre-filled with a time that clashes with nothing (in the place's city); you can change any of it.
  const [initial] = useState(() => pickDefault?.(idea.estDurationMin) ?? { day: defaultDay, start: '', fits: false });
  const [day, setDay] = useState(initial.day);
  const [start, setStart] = useState(initial.start);
  const [duration, setDuration] = useState(idea.estDurationMin);
  const [hint, setHint] = useState<'fits' | 'fallback' | 'manual'>(initial.start ? (initial.fits ? 'fits' : 'fallback') : 'manual');
  const validStart = /^\d{2}:\d{2}$/.test(start);
  const end = validStart ? toClock(Math.min(toMin(start) + duration, 24 * 60 - 1)) : '';
  const changeDay = (d: string) => {
    setDay(d);
    const s = checker?.suggest(d, duration);
    if (s !== null && s !== undefined) {
      setStart(toClock(s));
      setHint('fits');
    } else setHint('manual');
  };
  const blocked = !!checker && validStart && checker.check(day, toMin(start), duration).some((w) => w.severity === 'block');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      await onAdd(day, start || undefined, duration);
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
        <DaySelect days={days} value={day} onChange={changeDay} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <Input
            type="time"
            step={300}
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setHint('manual');
            }}
          />
        </Field>
        <Field label="End">
          <Input
            type="time"
            step={300}
            value={end}
            disabled={!validStart}
            onChange={(e) => {
              if (!/^\d{2}:\d{2}$/.test(e.target.value) || !validStart) return;
              const d = toMin(e.target.value) - toMin(start);
              if (d >= 5) setDuration(d);
            }}
          />
        </Field>
      </div>
      <Field label="Or how long">
        <DurationSelect value={duration} onChange={setDuration} />
      </Field>
      <p className="text-xs text-[#6D7A77]">
        {hint === 'fits'
          ? `Suggested: the first time on ${formatDay(day)} that clashes with nothing — opening hours, travel, prayer times.`
          : hint === 'fallback'
            ? `Nothing fits without a clash in this city, so it's after the last stop on the emptiest day (${formatDay(day)}) — change it if you like.`
            : start
              ? 'Your time.'
              : "Leave the start empty to go after the day's last stop."}
      </p>
      <HoursHint idea={idea} day={day} />
      <PlacementCheck checker={checker} day={day} start={start} duration={duration} onPick={(x) => (setStart(x), setHint('fits'))} />
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Button className="w-full" disabled={busy} onClick={add}>
        {busy ? 'Adding…' : `${blocked ? 'Add anyway' : 'Add'} to ${formatDay(day)}`}
      </Button>
    </div>
  );
}
