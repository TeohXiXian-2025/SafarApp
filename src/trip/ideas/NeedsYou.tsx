// What's waiting on me across the Idea Board: votes, middle grounds to pick,
// admin decisions, and 👍s to re-confirm because a conflict changed. Drives
// the tab badge and the "Needs you" strip.
import { BellRing } from 'lucide-react';
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
  choose: (n) => `Pick a middle ground for ${n} split vote${n > 1 ? 's' : ''}`,
  decide: (n) => `Decide on ${n} split vote${n > 1 ? 's' : ''} (admin)`,
  reconfirm: (n) => `Re-confirm ${n} place${n > 1 ? 's' : ''} — something changed`,
};
const FILTER: Record<Need['kind'], string> = { vote: 'voting', choose: 'mixed', decide: 'mixed', reconfirm: 'backlog' };

export function NeedsYouStrip({ needs, tripId, className }: { needs: Need[]; tripId: string; className?: string }) {
  if (!needs.length) return null;
  const kinds = (['vote', 'choose', 'decide', 'reconfirm'] as const).map((k) => [k, needs.filter((n) => n.kind === k).length] as const).filter(([, n]) => n);
  return (
    <div className={cx('rounded-2xl border border-[#F0C987] bg-[#FFF8EC] px-4 py-3', className)}>
      <p className="flex items-center gap-2 text-sm font-bold text-[#7A4A06]">
        <BellRing className="w-4 h-4" /> Needs you
      </p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {kinds.map(([k, n]) => (
          <Link key={k} to={`/t/${tripId}/ideas?filter=${FILTER[k]}`} className="text-sm font-semibold text-[#00685F] underline underline-offset-2">
            {TEXT[k](n)}
          </Link>
        ))}
      </div>
    </div>
  );
}
