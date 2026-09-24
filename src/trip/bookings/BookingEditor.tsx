import { BookingDraft, type BookingKind, type Member } from '../../domain';
import { PlacePicker } from '../../components/live/PlaceSearch';
import { Chip, Field, Input } from '../../ui';
import { KIND } from './format';

export type EditableDraft = Partial<BookingDraft>;

const KINDS = Object.keys(KIND) as BookingKind[];

/** Returns a user-facing problem with the draft, or null if it can be saved. */
export function draftProblem(d: EditableDraft): string | null {
  const hotel = d.kind === 'hotel';
  if (!d.kind) return 'Choose the booking type.';
  if (!hotel && !d.from) return 'Choose where you depart from.';
  if (!d.to) return hotel ? 'Choose the hotel.' : 'Choose where you arrive.';
  if (!d.startLocal) return hotel ? 'Set the check-in date and time.' : 'Set the departure date and time.';
  if (!d.endLocal) return hotel ? 'Set the check-out date and time.' : 'Set the arrival date and time.';
  if (!d.travellerUids?.length) return 'Choose at least one traveller.';
  const parsed = BookingDraft.safeParse(d);
  return parsed.success ? null : parsed.error.issues[0].message;
}

export function BookingEditor({
  value,
  onChange,
  members,
}: {
  value: EditableDraft;
  onChange: (d: EditableDraft) => void;
  members: Member[];
}) {
  const set = (patch: EditableDraft) => onChange({ ...value, ...patch });
  const kind = value.kind ?? 'flight';
  const k = KIND[kind];
  const hotel = kind === 'hotel';
  const travellers = new Set(value.travellerUids ?? []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Booking type">
        {KINDS.map((x) => {
          const Icon = KIND[x].icon;
          return (
            <Chip key={x} selected={kind === x} onClick={() => set({ kind: x, ...(x === 'hotel' ? { from: undefined } : {}) })}>
              <span className="inline-flex items-center gap-1.5">
                <Icon className="w-4 h-4" /> {KIND[x].label}
              </span>
            </Chip>
          );
        })}
      </div>

      {hotel ? (
        <Field label="Hotel" group>
          <PlacePicker value={value.to} placeholder="Search the hotel…" onChange={(p) => set({ to: p, carrier: p.name })} />
        </Field>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label={k.carrier}>
              <Input value={value.carrier ?? ''} onChange={(e) => set({ carrier: e.target.value || undefined })} maxLength={100} />
            </Field>
            <Field label={k.number}>
              <Input value={value.number ?? ''} onChange={(e) => set({ number: e.target.value || undefined })} maxLength={30} />
            </Field>
          </div>
          <Field label="From" group>
            <PlacePicker value={value.from} placeholder={kind === 'flight' ? 'Airport…' : 'Station / terminal…'} onChange={(p) => set({ from: p })} />
          </Field>
          <Field label="To" group>
            <PlacePicker value={value.to} placeholder={kind === 'flight' ? 'Airport…' : 'Station / terminal…'} onChange={(p) => set({ to: p })} />
          </Field>
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={hotel ? 'Check-in' : 'Departure'} hint={hotel ? undefined : 'Local time where you depart'}>
          <Input type="datetime-local" value={value.startLocal ?? ''} onChange={(e) => set({ startLocal: e.target.value || undefined })} />
        </Field>
        <Field label={hotel ? 'Check-out' : 'Arrival'} hint={hotel ? undefined : 'Local time where you arrive'}>
          <Input
            type="datetime-local"
            value={value.endLocal ?? ''}
            min={value.startLocal?.slice(0, 10) ? `${value.startLocal.slice(0, 10)}T00:00` : undefined}
            onChange={(e) => set({ endLocal: e.target.value || undefined })}
          />
        </Field>
      </div>

      <Field label="Booking reference" hint="PNR / confirmation number (optional)">
        <Input value={value.pnr ?? ''} onChange={(e) => set({ pnr: e.target.value.toUpperCase() || undefined })} maxLength={20} />
      </Field>

      <Field label="Who is on this booking?" group>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <Chip
              key={m.uid}
              selected={travellers.has(m.uid)}
              onClick={() => {
                const next = new Set(travellers);
                next.has(m.uid) ? next.delete(m.uid) : next.add(m.uid);
                set({ travellerUids: [...next] });
              }}
            >
              {m.displayName}
            </Chip>
          ))}
        </div>
        {!!value.passengerNames?.length && (
          <p className="text-xs text-[#6D7A77] mt-1.5">On the ticket: {value.passengerNames.join(', ')}</p>
        )}
      </Field>
    </div>
  );
}
