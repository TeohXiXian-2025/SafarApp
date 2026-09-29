// What's waiting on me across the Idea Board: votes, middle grounds to pick,
// admin decisions, and 👍s to re-confirm because a conflict changed. Drives
// the tab badge and the "Needs you" strip.
import { BellRing, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Idea, ideaConflicts, needsYou, paths, type Need } from '../../domain';
import { useQuery } from '../../lib/firestore';
import { cx } from '../../ui';
import type { TripCtx } from '../TripLayout';

export function useNeeds(ctx: Pick<TripCtx, 'trip' | 'members' | 'me' | 'isAdmin'> | null): { needs: Need[]; ideas: Map<string, Idea> } {
  const ideas = useQuery(ctx ? `ideas:${ctx.trip.id}` : null, () => paths.ideas(ctx!.trip.id), Idea);
  return useMemo(() => {
    if (!ctx) return { needs: [], ideas: new Map() };
    const conflicts = (i: Idea) => ideaConflicts(i, ctx.members, { currency: ctx.trip.currency, trip: ctx.trip }).filter((c) => c.uid === ctx.me.uid);
    const list = needsYou(ideas.data, ctx.me.uid, ctx.trip.memberIds, ctx.isAdmin, (i) => conflicts(i as Idea), Date.now());
    return { needs: list, ideas: new Map(ideas.data.map((i) => [i.id, i])) };
  }, [ideas.data, ctx]);
}

const TEXT: Record<Need['kind'], (n: number) => string> = {
  vote: (n) => `Vote on ${n} idea${n > 1 ? 's' : ''}`,
  choose: (n) => `Pick a middle ground — ${n} place${n > 1 ? 's' : ''} ${n > 1 ? 'need' : 'needs'} a decision`,
  decide: (n) => `Decide on ${n} place${n > 1 ? 's' : ''} that ${n > 1 ? 'need' : 'needs'} a decision (admin)`,
  reconfirm: (n) => `Re-confirm ${n} place${n > 1 ? 's' : ''} — something changed`,
};
const FILTER: Record<Need['kind'], string> = { vote: 'voting', choose: 'mixed', decide: 'mixed', reconfirm: 'backlog' };

export function NeedsYouStrip({ needs, tripId, className }: { needs: Need[]; tripId: string; className?: string }) {
  if (!needs.length) return null;
  const kinds = (['vote', 'choose', 'decide', 'reconfirm'] as const).map((k) => [k, needs.filter((n) => n.kind === k).length] as const).filter(([, n]) => n);
  return (
    <div className={cx('rounded-2xl bg-white border border-[#E7DFD5] overflow-hidden shadow-[0_1px_2px_rgba(22,28,35,.04)]', className)}>
      <p className="flex items-center gap-2 px-4 pt-3.5 pb-2 text-sm font-bold text-[#161C23]">
        <BellRing className="w-4 h-4 text-gold" /> Needs you
        <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-[#E0483D] text-white text-[11px] font-bold leading-5 text-center">{needs.length}</span>
      </p>
      <div>
        {kinds.map(([k, n]) => (
          <Link key={k} to={`/t/${tripId}/ideas?filter=${FILTER[k]}`} className="flex items-center gap-3 min-h-12 px-4 border-t border-[#F1EDE7] text-sm font-semibold text-[#161C23] hover:bg-[#FAF8F5]">
            <span className={cx('w-2 h-2 rounded-full shrink-0', k === 'vote' ? 'bg-[#00685F]' : k === 'reconfirm' ? 'bg-amber' : 'bg-gold')} />
            <span className="flex-1">{TEXT[k](n)}</span>
            <ChevronRight className="w-4 h-4 text-[#9AA5A3]" />
          </Link>
        ))}
      </div>
    </div>
  );
}
