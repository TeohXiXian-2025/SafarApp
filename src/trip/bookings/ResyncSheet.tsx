// Emergency Resync: a journey is delayed or cancelled → preview what it does to
// the plan → apply (whoever added it, or the admin) or send it to them.
import { ArrowRight, ExternalLink, Loader2, TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { fmtClock, Incident, paths, toMin, UNFIT_TEXT, type Booking, type UnfitReason } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { useQuery } from '../../lib/firestore';
import { deleteFile, UPLOAD_ACCEPT, uploadTripFile } from '../../lib/storage';
import { ExpenseSheet } from '../expenses/ExpenseSheet';
import { Button, cx, ErrorBanner, Field, Input, Sheet } from '../../ui';
import { useTrip } from '../TripLayout';
import { bookingTitle, formatDay } from './format';

type Change = { type: 'delay'; startLocal: string; endLocal: string } | { type: 'cancel' };
interface Preview {
  days: { day: string; moved: { id: string; name: string; from: string; to: string }[]; removed: { id: string; name: string; reason: UnfitReason }[] }[];
  warnings: string[];
  nearby?: { at: string; prayer: Spot[]; food: Spot[] };
  canApply: boolean;
}
type Spot = { name: string; meters: number; location: { lat: number; lng: number } };

const mapsLink = (s: Spot) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name} ${s.location.lat},${s.location.lng}`)}`;
const dist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

export function ResyncSheet({ booking, incident, onClose }: { booking: Booking; incident?: Incident; onClose: () => void }) {
  const { trip, members, me } = useTrip();
  const reported = incident?.change;
  const [message, setMessage] = useState('');
  const [reading, setReading] = useState('');
  const [readNote, setReadNote] = useState('');
  const [extraCost, setExtraCost] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<Change['type']>(reported?.type ?? 'delay');
  const [start, setStart] = useState(reported?.type === 'delay' ? reported.startLocal : booking.startLocal);
  const [end, setEnd] = useState(reported?.type === 'delay' ? reported.endLocal : booking.endLocal);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const change: Change = type === 'cancel' ? { type } : { type, startLocal: start, endLocal: end };
  const body = { bookingId: booking.id, change, ...(incident ? { incidentId: incident.id } : {}) };
  const reporter = incident && (incident.createdBy === 'system' ? 'live flight status' : members.find((m) => m.uid === incident.createdBy)?.displayName);

  const run = async (path: string, after: (r: never) => void) => {
    setBusy(true);
    setError('');
    try {
      after(await api.post<never>(path, body, { tripId: trip.id }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  // The airline's SMS / email / app screenshot → the new times (AI), then the person checks them.
  const readMessage = async (file?: File) => {
    setError('');
    setReadNote('');
    let path: string | undefined;
    try {
      if (file) {
        setReading('Uploading…');
        path = await uploadTripFile(trip.id, me.uid, 'disruptions', file);
      }
      setReading('Reading the message…');
      const r = await api.post<{ cancelled: boolean; startLocal?: string; endLocal?: string; confidence: number }>(
        'resync/read',
        { bookingId: booking.id, ...(path ? { storagePath: path } : { text: message }) },
        { tripId: trip.id },
      );
      setPreview(null);
      const none = 'No new times found in that message. Enter them yourself.';
      if (r.confidence < 0.3) setReadNote(none);
      else if (r.cancelled) {
        setType('cancel');
        setReadNote('The message says it is cancelled. Check, then preview.');
      } else if (r.startLocal && r.endLocal) {
        setType('delay');
        setStart(r.startLocal);
        setEnd(r.endLocal);
        setReadNote(`Read: departs ${r.startLocal.replace('T', ' ')}, arrives ${r.endLocal.replace('T', ' ')}. Check them, then preview.`);
      } else setReadNote(none);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Could not read it.');
    } finally {
      if (path) void deleteFile(path);
      setReading('');
    }
  };

  const stuckAt = booking.from ?? booking.to;
  if (extraCost) {
    return (
      <ExpenseSheet
        preset={{ title: `Extra cost: ${bookingTitle(booking)} ${type === 'cancel' ? 'cancelled' : 'delayed'}`, category: 'transport', date: booking.startLocal.slice(0, 10) }}
        onClose={onClose}
      />
    );
  }
  return (
    <Sheet open onClose={onClose} title={`${bookingTitle(booking)}: delayed or cancelled?`} wide>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-[#161C23]">{done}</p>
          <div className="grid gap-2">
            <Link to={`/t/${trip.id}/food?lat=${stuckAt.location.lat}&lng=${stuckAt.location.lng}&near=${encodeURIComponent(stuckAt.name)}`} onClick={onClose}>
              <Button variant="secondary" className="w-full">
                Find halal food near {stuckAt.name}
              </Button>
            </Link>
            <Button variant="secondary" onClick={() => setExtraCost(true)}>
              Log an extra cost (taxi, meal, rebooking)
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {reporter && <p className="rounded-xl bg-[#FDF3E1] px-3 py-2 text-sm text-[#6B3F06]">Reported by {reporter}. Check the times, preview, then apply.</p>}
          <div className="grid grid-cols-2 rounded-xl bg-[#F3EFE9] p-1 text-sm font-semibold">
            {(
              [
                ['delay', 'New times'],
                ['cancel', 'Cancelled'],
              ] as const
            ).map(([t, l]) => (
              <button key={t} type="button" onClick={() => (setType(t), setPreview(null))} className={cx('min-h-9 rounded-lg', type === t ? 'bg-white text-[#00685F] shadow-xs' : 'text-[#6D7A77]')}>
                {l}
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-dashed border-[#00685F]/40 bg-white p-3 space-y-2">
            <p className="text-sm font-semibold text-[#161C23]">Got a message from the airline or operator?</p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              maxLength={5000}
              placeholder="Paste the SMS or email here…"
              className="w-full rounded-lg border border-[#E7DFD5] px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#00685F]/40"
            />
            <input ref={fileInput} type="file" accept={UPLOAD_ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && void readMessage(e.target.files[0])} />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="!min-h-9" disabled={!!reading || message.trim().length < 10} onClick={() => void readMessage()}>
                Read the message
              </Button>
              <Button variant="secondary" className="!min-h-9" disabled={!!reading} onClick={() => fileInput.current?.click()}>
                Upload a screenshot
              </Button>
            </div>
            {reading && (
              <p className="text-xs text-[#6D7A77] flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {reading}
              </p>
            )}
            {readNote && <p className="text-xs text-[#00685F]">{readNote}</p>}
          </div>
          {type === 'delay' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Now departs (local)" hint={`Was ${booking.startLocal.replace('T', ' ')}`}>
                <Input type="datetime-local" value={start} onChange={(e) => (setStart(e.target.value), setPreview(null))} />
              </Field>
              <Field label="Now arrives (local)" hint={`Was ${booking.endLocal.replace('T', ' ')}`}>
                <Input type="datetime-local" value={end} onChange={(e) => (setEnd(e.target.value), setPreview(null))} />
              </Field>
            </div>
          )}

          {preview && (
            <div className="space-y-3 rounded-xl border border-[#E7DFD5] bg-white p-3">
              {preview.warnings.map((w) => (
                <p key={w} className="flex gap-2 text-sm text-[#6B3F06]">
                  <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" /> {w}
                </p>
              ))}
              {preview.nearby && (preview.nearby.prayer.length > 0 || preview.nearby.food.length > 0) && (
                <div className="rounded-lg bg-[#FAF8F5] p-2.5 space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#6D7A77]">While you wait near {preview.nearby.at}</p>
                  {[...preview.nearby.prayer.map((s) => ['🕌', s] as const), ...preview.nearby.food.map((s) => ['🍽️', s] as const)].map(([icon, s]) => (
                    <a key={`${icon}${s.name}`} href={mapsLink(s)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-[#161C23] hover:text-[#00685F]">
                      {icon} {s.name} <span className="text-[#6D7A77]">· {dist(s.meters)}</span> <ExternalLink className="w-3 h-3 text-[#6D7A77]" />
                    </a>
                  ))}
                </div>
              )}
              {preview.days.map((d) => (
                <div key={d.day}>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#6D7A77]">{formatDay(d.day)}</p>
                  {!d.moved.length && !d.removed.length && <p className="text-sm text-[#6D7A77]">No change needed.</p>}
                  {d.moved.map((m) => (
                    <p key={m.id} className="text-sm text-[#161C23] flex items-center gap-1.5">
                      {m.name}: {fmtClock(toMin(m.from))} <ArrowRight className="w-3.5 h-3.5 text-[#6D7A77]" /> <strong>{fmtClock(toMin(m.to))}</strong>
                    </p>
                  ))}
                  {d.removed.map((r) => (
                    <p key={r.id} className="text-sm text-[#B3261E]">
                      {r.name} → back to the backlog <span className="text-[#6D7A77]">— {UNFIT_TEXT[r.reason].replace('the free days', 'this day')}</span>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}

          <ErrorBanner>{error}</ErrorBanner>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            {!preview ? (
              <Button className="flex-1" loading={busy} onClick={() => void run('resync/preview', (r: Preview) => setPreview(r))}>
                Preview the new plan
              </Button>
            ) : preview.canApply ? (
              <Button
                className="flex-1"
                loading={busy}
                onClick={() =>
                  void run('resync/apply', (r: { moved: number; removed: number }) =>
                    setDone(`Done. ${r.moved} stop${r.moved === 1 ? '' : 's'} moved, ${r.removed} back to the backlog. Everyone has been told.`),
                  )
                }
              >
                Apply and tell everyone
              </Button>
            ) : (
              <Button className="flex-1" loading={busy} onClick={() => void run('resync/report', () => setDone('Sent. The admin will review it and update the plan.'))}>
                Send to the admin
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Open reports ("Bob: MH52 now 17:00 → 23:30") for whoever can apply them. */
export function IncidentBanner({ bookings }: { bookings: Booking[] }) {
  const { trip, members, me, isAdmin } = useTrip();
  const open = useQuery(`incidents:${trip.id}`, () => paths.incidents(trip.id), Incident).data.filter((i) => i.status === 'open' && i.bookingId);
  const [review, setReview] = useState<{ incident: Incident; booking: Booking } | null>(null);
  const items = open.flatMap((i) => {
    const b = bookings.find((x) => x.id === i.bookingId);
    return b ? [{ i, b }] : [];
  });
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      {items.map(({ i, b }) => {
        const can = isAdmin || b.createdBy === me.uid;
        return (
          <div key={i.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#F0D7A7] bg-[#FDF3E1] px-3.5 py-2.5 text-sm text-[#6B3F06]">
            <TriangleAlert className="w-4 h-4 shrink-0" />
            <p className="flex-1 min-w-[12rem]">
              <strong>{i.createdBy === 'system' ? 'Live flight status' : (members.find((m) => m.uid === i.createdBy)?.displayName ?? 'Someone')}</strong>: {i.description}
            </p>
            {can && (
              <>
                <Button className="!min-h-9" onClick={() => setReview({ incident: i, booking: b })}>
                  Review
                </Button>
                {isAdmin && (
                  <button type="button" className="text-xs font-semibold underline" onClick={() => void api.post('resync/dismiss', { incidentId: i.id }, { tripId: trip.id })}>
                    Dismiss
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
      {review && <ResyncSheet booking={review.booking} incident={review.incident} onClose={() => setReview(null)} />}
    </div>
  );
}
