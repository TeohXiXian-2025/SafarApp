// AI Arrange preview: the proposed plan per day, what moved compared with the
// current timeline, prayer breaks, and anything that didn't fit (with why).
// Nothing changes until the admin presses Apply.
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { fmtClock, PRAYER_LABEL, toMin, UNFIT_TEXT, type ArrangeJob, type Idea, type ScheduleItem } from '../../domain';
import { Badge, Button, ErrorBanner, Sheet } from '../../ui';
import { formatDay } from '../bookings/format';

const t = (hhmm: string) => fmtClock(toMin(hhmm));

export function ArrangeSheet({
  job,
  days,
  ideas,
  current,
  onApply,
  onClose,
}: {
  job: ArrangeJob | null;
  days: string[];
  ideas: Map<string, Idea>;
  current: ScheduleItem[];
  onApply: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!job) return null;
  const was = new Map(current.flatMap((i) => (i.ref.kind === 'idea' && !i.track.endsWith(':B') ? [[i.ref.ideaId, i] as const] : [])));
  const change = (ideaId: string, day: string, start: string) => {
    const w = was.get(ideaId);
    if (!w) return { label: 'New', tone: 'brand' as const };
    if (w.day !== day) return { label: `Moved from ${formatDay(w.day)}`, tone: 'amber' as const };
    if (w.start !== start) return { label: `Was ${t(w.start)}`, tone: 'amber' as const };
    return null;
  };
  const dropped = [...was.keys()].filter((id) => !job.plan.days.some((d) => d.stops.some((s) => s.ideaId === id)));
  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      await onApply();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="AI Arrange — preview" wide>
      <div className="space-y-4">
        <p className="text-sm text-[#6D7A77]">
          Stops are grouped by area, ordered to cut travel, fitted to opening hours and meal times, and kept clear of prayer times. Bookings stay where they
          are. Nothing changes until you apply — and you can undo it.
        </p>
        {job.plan.days.map((d) => (
          <section key={d.day} className="rounded-2xl border border-[#E7DFD5] bg-white p-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-bold text-[#161C23]">
                Day {days.indexOf(d.day) + 1} · {formatDay(d.day)}
              </h3>
              <span className="text-xs text-[#6D7A77] shrink-0">~{d.travelMin} min travel</span>
            </div>
            {d.note && (
              <p className="text-xs text-[#3F5873] flex gap-1.5">
                <Sparkles className="w-3.5 h-3.5 shrink-0 mt-px" /> {d.note}
              </p>
            )}
            <ul className="space-y-1 text-sm">
              {[
                ...d.stops.map((s) => ({ key: s.ideaId, start: s.start, end: s.end, name: ideas.get(s.ideaId)?.place.name ?? 'Removed idea', change: change(s.ideaId, d.day, s.start), prayer: false })),
                ...d.prayers.map((p) => ({ key: p.key, start: p.start, end: p.end, name: `${PRAYER_LABEL[p.key]} prayer`, change: null, prayer: true })),
              ]
                .sort((a, b) => a.start.localeCompare(b.start))
                .map((row) => (
                  <li key={row.key} className="flex items-center gap-2">
                    <span className="w-[8.5rem] shrink-0 text-xs font-semibold tabular-nums text-[#161C23]">
                      {t(row.start)}–{t(row.end)}
                    </span>
                    <span className={row.prayer ? 'text-[#00685F] truncate' : 'text-[#161C23] truncate'}>{row.prayer ? `🕌 ${row.name}` : row.name}</span>
                    {row.change && <Badge tone={row.change.tone}>{row.change.label}</Badge>}
                  </li>
                ))}
            </ul>
          </section>
        ))}
        {!!job.plan.unplaced.length && (
          <section className="rounded-2xl border border-[#F2D8B0] bg-[#FFF8EC] p-3 space-y-1.5">
            <h3 className="font-bold text-[#8A5A00] text-sm">Didn't fit ({job.plan.unplaced.length}) — they stay in the backlog</h3>
            {job.plan.unplaced.map((u) => (
              <p key={u.ideaId} className="text-xs text-[#8A5A00]">
                <b>{ideas.get(u.ideaId)?.place.name ?? 'Idea'}</b> — {UNFIT_TEXT[u.reason]}
              </p>
            ))}
          </section>
        )}
        {!!dropped.length && !job.plan.unplaced.length && (
          <p className="text-xs text-[#8A5A00]">{dropped.length} stop(s) currently on the timeline would move back to the backlog.</p>
        )}
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="flex-1" loading={busy} onClick={apply}>
            Apply to timeline
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
