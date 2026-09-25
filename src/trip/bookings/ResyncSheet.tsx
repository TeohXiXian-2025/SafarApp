// Emergency Resync: a journey is delayed or cancelled → preview what it does to
// the plan → apply (whoever added it, or the admin) or send it to them.
import { ArrowRight, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { fmtClock, Incident, paths, toMin, UNFIT_TEXT, type Booking, type UnfitReason } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { useQuery } from '../../lib/firestore';
import { Button, cx, ErrorBanner, Field, Input, Sheet } from '../../ui';
import { useTrip } from '../TripLayout';
import { bookingTitle, formatDay } from './format';

type Change = { type: 'delay'; startLocal: string; endLocal: string } | { type: 'cancel' };
interface Preview {
  days: { day: string; moved: { id: string; name: string; from: string; to: string }[]; removed: { id: string; name: string; reason: UnfitReason }[] }[];
  warnings: string[];
  canApply: boolean;
}

export function ResyncSheet({ booking, incident, onClose }: { booking: Booking; incident?: Incident; onClose: () => void }) {
  const { trip, members } = useTrip();
  const reported = incident?.change;
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

  return (
    <Sheet open onClose={onClose} title={`${bookingTitle(booking)}: delayed or cancelled?`} wide>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-[#161C23]">{done}</p>
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
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
