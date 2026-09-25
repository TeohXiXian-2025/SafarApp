import { Lightbulb, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Idea, paths, placeIsStale, ScheduleItem, Split, type IdeaStatus } from '../../domain';
import { api } from '../../lib/api';
import { useQuery } from '../../lib/firestore';
import { Button, Card, cx, ErrorBanner, Spinner } from '../../ui';
import { useTrip } from '../TripLayout';
import { AddIdeaSheet } from './AddIdeaSheet';
import { IdeaCard } from './IdeaCard';

type Filter = 'voting' | 'backlog' | 'mixed' | 'rejected';

const FILTERS: { key: Filter; label: string; statuses: IdeaStatus[]; empty: string }[] = [
  { key: 'voting', label: 'Voting', statuses: ['voting'], empty: 'Nothing to vote on. Add places from TikTok, Instagram, Xiaohongshu or search.' },
  { key: 'backlog', label: 'Backlog', statuses: ['backlog', 'scheduled'], empty: 'Ideas everyone approves land here, ready for the timeline.' },
  { key: 'mixed', label: 'Split votes', statuses: ['mixed', 'split_pending'], empty: 'No disagreements so far.' },
  { key: 'rejected', label: 'Rejected', statuses: ['rejected'], empty: 'Nothing rejected.' },
];

export function IdeasPage() {
  const { trip, me } = useTrip();
  const [filter, setFilter] = useState<Filter>('voting');
  const [adding, setAdding] = useState(false);
  // Arrived from the share sheet (/share → ?share=…): open the import pre-filled.
  const [params, setParams] = useSearchParams();
  const [sharedText, setSharedText] = useState<string>();
  useEffect(() => {
    const shared = params.get('share');
    if (shared) {
      setSharedText(shared);
      setAdding(true);
      params.delete('share');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);
  const ideas = useQuery(`ideas:${trip.id}`, () => paths.ideas(trip.id), Idea);
  const splits = useQuery(`splits:${trip.id}`, () => paths.splits(trip.id), Split);
  const schedule = useQuery(`schedule:${trip.id}`, () => paths.schedule(trip.id), ScheduleItem);
  const splitById = useMemo(() => new Map(splits.data.filter((s) => s.status !== 'rejected').map((s) => [s.id, s])), [splits.data]);
  const ideaById = useMemo(() => new Map(ideas.data.map((i) => [i.id, i])), [ideas.data]);
  const dayOf = useMemo(() => new Map(schedule.data.flatMap((s) => (s.ref.kind === 'idea' ? [[s.ref.ideaId, s.day] as const] : []))), [schedule.data]);
  // Google place details may only be cached for 30 days — refresh old ones once per visit.
  const refreshed = useRef('');
  const hasStale = !ideas.loading && ideas.data.some((i) => placeIsStale(i));
  useEffect(() => {
    if (hasStale && navigator.onLine && refreshed.current !== trip.id) {
      refreshed.current = trip.id;
      void api.post('ideas/refresh', {}, { tripId: trip.id }).catch(() => {});
    }
  }, [hasStale, trip.id]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, ideas.data.filter((i) => f.statuses.includes(i.status)).length])) as Record<Filter, number>,
    [ideas.data],
  );
  const needsMyVote = ideas.data.filter((i) => i.status === 'voting' && !i.votes[me.uid]).length;
  const active = FILTERS.find((f) => f.key === filter)!;
  const cardSplit = (i: Idea) => {
    const split = i.splitId ? splitById.get(i.splitId) : undefined;
    if (!split) return {};
    const otherId = split.trackA.ideaId === i.id ? split.trackB.ideaId : split.trackA.ideaId;
    return { split, splitOther: ideaById.get(otherId) };
  };
  const shown = ideas.data
    .filter((i) => active.statuses.includes(i.status))
    // Ones still needing my vote first, then newest.
    .sort((a, b) => Number(!!a.votes[me.uid]) - Number(!!b.votes[me.uid]) || b.createdAt - a.createdAt);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-[#161C23]">Idea Board</h1>
          <p className="text-sm text-[#6D7A77]">
            {needsMyVote ? `${needsMyVote} idea${needsMyVote === 1 ? '' : 's'} waiting for your vote.` : 'Suggest places, vote together — unanimous picks go to the backlog.'}
          </p>
        </div>
        <Button onClick={() => setAdding(true)} className="shrink-0">
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" role="tablist" aria-label="Filter ideas">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cx(
              'shrink-0 inline-flex items-center gap-1.5 px-3.5 min-h-9 rounded-full text-sm font-semibold border',
              filter === f.key ? 'bg-[#161C23] border-[#161C23] text-white' : 'bg-white border-[#E7DFD5] text-[#161C23]',
            )}
          >
            {f.label}
            <span className={cx('text-xs rounded-full px-1.5', filter === f.key ? 'bg-white/20' : 'bg-[#F3EFE9] text-[#6D7A77]')}>{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {ideas.error && <ErrorBanner>Could not load ideas: {ideas.error.message}</ErrorBanner>}

      {ideas.loading ? (
        <Spinner />
      ) : ideas.data.length === 0 ? (
        <Card className="p-6 text-center space-y-3">
          <Lightbulb className="w-8 h-8 mx-auto text-[#00685F]" />
          <p className="font-bold text-[#161C23]">Start your Idea Board</p>
          <p className="text-sm text-[#6D7A77]">
            Paste a TikTok, Instagram or Xiaohongshu link and AI pulls out every place in it — each checked for halal status and reviews.
          </p>
          <Button onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" /> Add the first idea
          </Button>
        </Card>
      ) : shown.length === 0 ? (
        <p className="text-sm text-[#6D7A77] py-8 text-center">{active.empty}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
          {shown.map((i) => (
            <IdeaCard key={i.id} idea={i} {...cardSplit(i)} scheduledDay={dayOf.get(i.id)} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-[#9AA5A3] text-center">Place details and photos © Google. Halal information is guidance — always confirm with the venue.</p>

      <AddIdeaSheet open={adding} initialText={sharedText} onClose={() => (setAdding(false), setSharedText(undefined))} />
    </div>
  );
}
