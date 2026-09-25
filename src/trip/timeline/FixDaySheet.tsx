// "Fix this day": a preview of the day re-ordered and re-timed so every stop
// is open when you're there and reachable in time (around bookings and prayer
// times). Stops that can't fit go back to the backlog — shown before applying.
import { useEffect, useState } from 'react';
import { fmtClock, toMin, UNFIT_TEXT, type UnfitReason } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { Badge, Button, ErrorBanner, Sheet, Spinner } from '../../ui';
import { formatDay } from '../bookings/format';

interface Row {
  item: { id: string; start: string };
  title: string;
}
interface Preview {
  stops: { id: string; start: string; end: string }[];
  removed: { id: string; reason: UnfitReason }[];
}

const t = (hhmm: string) => fmtClock(toMin(hhmm));

export function FixDaySheet({ day, tripId, rows, onClose }: { day: string; tripId: string; rows: Row[]; onClose: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const q = { tripId };
  const title = (id: string) => rows.find((r) => r.item.id === id)?.title ?? 'Stop';
  const was = (id: string) => rows.find((r) => r.item.id === id)?.item.start;

  useEffect(() => {
    api
      .post<Preview>('schedule/fixday', { day }, q)
      .then(setPreview)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not plan this day.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('schedule/fixday', { day, apply: true }, q);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not apply.');
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={`Fix ${formatDay(day)}`}>
      <div className="space-y-4">
        <p className="text-sm text-[#6D7A77]">Re-ordered and re-timed so every stop is open when you arrive and there's time to travel between them (plus 10 min to spare). Bookings don't move.</p>
        {!preview && !error && <Spinner label="Planning the day…" />}
        {preview && (
          <>
            <ul className="space-y-1.5 text-sm">
              {preview.stops.map((s) => {
                const before = was(s.id);
                return (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="w-[8.5rem] shrink-0 text-xs font-semibold tabular-nums">
                      {t(s.start)}–{t(s.end)}
                    </span>
                    <span className="truncate text-[#161C23]">{title(s.id)}</span>
                    {before && before !== s.start && <Badge tone="amber">was {t(before)}</Badge>}
                  </li>
                );
              })}
            </ul>
            {!!preview.removed.length && (
              <div className="rounded-xl border border-[#F2D8B0] bg-[#FFF8EC] p-3 space-y-1">
                <p className="text-sm font-bold text-[#8A5A00]">Can't fit this day — back to the backlog:</p>
                {preview.removed.map((r) => (
                  <p key={r.id} className="text-xs text-[#8A5A00]">
                    <b>{title(r.id)}</b> — {UNFIT_TEXT[r.reason].replace('the free days', 'this day')}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="flex-1" loading={busy} disabled={!preview} onClick={apply}>
            Apply
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
