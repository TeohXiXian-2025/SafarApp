import { Lightbulb, MapPin, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { citiesByDay, cityDatesText, cityOf, Idea, openingRanges, paths, placeIsStale, ScheduleItem, Split, Stay, type IdeaStatus } from '../../domain';
import { api } from '../../lib/api';
import { useQuery } from '../../lib/firestore';
import { Button, Card, cx, ErrorBanner, Spinner } from '../../ui';
import { useTrip } from '../TripLayout';
import { AddIdeaSheet } from './AddIdeaSheet';
import { IdeaCard } from './IdeaCard';
import { NeedsYouStrip, useNeeds } from './NeedsYou';

type Filter = 'voting' | 'backlog' | 'mixed' | 'backup' | 'rejected';

const FILTERS: { key: Filter; label: string; statuses: IdeaStatus[]; empty: string }[] = [
  { key: 'voting', label: 'Voting', statuses: ['voting'], empty: 'Nothing to vote on. Add places from TikTok, Instagram, Xiaohongshu or search.' },
  { key: 'backlog', label: 'Backlog', statuses: ['backlog', 'scheduled'], empty: 'Ideas the group accepted land here, ready for the timeline.' },
  { key: 'mixed', label: 'Split votes', statuses: ['mixed', 'split_pending'], empty: 'No disagreements so far.' },
  { key: 'backup', label: 'Backup', statuses: ['backup'], empty: 'No backups. The admin can keep split-vote places here as a plan B.' },
  { key: 'rejected', label: 'Rejected', statuses: ['rejected'], empty: 'Nothing rejected.' },
];
const isFilter = (v: string | null): v is Filter => FILTERS.some((f) => f.key === v);

type Kind = 'all' | 'food' | 'sights';
const KINDS: [Kind, string][] = [
  ['all', 'All'],
  ['food', 'Food'],
  ['sights', 'Places to see'],
];
type When = 'any' | 'morning' | 'afternoon' | 'evening';
const WHEN: [When, string, [number, number]][] = [
  ['any', 'Any time', [0, 24 * 60]],
  ['morning', 'Open mornings', [8 * 60, 12 * 60]],
  ['afternoon', 'Afternoons', [12 * 60, 17 * 60]],
  ['evening', 'Evenings', [17 * 60, 22 * 60]],
];

/** Open for at least an hour of that part of the day on one of these dates (unknown hours count as open). */
function openDuring(idea: Idea, when: When, dates: string[]): boolean {
  if (when === 'any' || !idea.place.openingHours) return true;
  const [a, b] = WHEN.find((w) => w[0] === when)![2];
  return dates.some((d) => {
    const r = openingRanges(idea.place.openingHours, d);
    return r === null || r.some(([o, c]) => Math.min(c, b) - Math.max(o, a) >= 60);
  });
}

export function IdeasPage() {
  const ctx = useTrip();
  const { trip, me } = ctx;
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('filter');
  const [filter, setFilter] = useState<Filter>(isFilter(fromUrl) ? fromUrl : 'voting');
  useEffect(() => {
    if (isFilter(fromUrl)) setFilter(fromUrl);
  }, [fromUrl]);
  const { needs } = useNeeds(ctx);
  const [adding, setAdding] = useState(false);
  // Arrived from the share sheet (/share → ?share=…): open the import pre-filled.
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
  const stays = useQuery(`stays:${trip.id}`, () => paths.stays(trip.id), Stay);
  const [city, setCity] = useState<number | 'all'>('all');
  const [kind, setKind] = useState<Kind>('all');
  const [when, setWhen] = useState<When>('any');
  const multiCity = trip.destinations.length > 1;
  // The days the group is in each city (for "open mornings" etc. on the days you're actually there).
  const cityDays = useMemo(() => {
    const byDay = citiesByDay({ ...trip, stays: stays.data });
    const out = new Map<number, string[]>();
    for (const [d, cs] of byDay) for (const c of cs) out.set(c, [...(out.get(c) ?? []), d]);
    return { out, all: [...byDay.keys()] };
  }, [trip, stays.data]);
  const splitById = useMemo(() => new Map(splits.data.filter((s) => s.status === 'approved').map((s) => [s.id, s])), [splits.data]);
  // Alternatives of a split are shown inside their main idea's card, not on their own.
  const altIds = useMemo(() => new Set([...splitById.values()].flatMap((s) => s.tracks.filter((t) => t.key !== 'A' && t.ideaId).map((t) => t.ideaId!))), [splitById]);
  const board = useMemo(() => ideas.data.filter((i) => !altIds.has(i.id)), [ideas.data, altIds]);
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
  // Voting that ran past its 24 h closes when someone opens the board.
  const swept = useRef('');
  const overdue = !ideas.loading && ideas.data.some((i) => i.status === 'voting' && i.votingEndsAt && i.votingEndsAt <= Date.now());
  useEffect(() => {
    if (overdue && navigator.onLine && swept.current !== trip.id) {
      swept.current = trip.id;
      void api.post('ideas/sweep', {}, { tripId: trip.id }).catch(() => {});
    }
  }, [overdue, trip.id]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, board.filter((i) => f.statuses.includes(i.status)).length])) as Record<Filter, number>,
    [board],
  );
  const needsMyVote = needs.filter((n) => n.kind === 'vote').length;
  const active = FILTERS.find((f) => f.key === filter)!;
  const cardSplit = (i: Idea) => {
    const split = i.splitId ? splitById.get(i.splitId) : undefined;
    return split ? { split, alts: ideaById } : { alts: ideaById };
  };
  const cityIdx = (i: Idea) => (multiCity ? cityOf(trip.destinations, i.place.location) : 0);
  const inTab = board.filter((i) => active.statuses.includes(i.status));
  const shown = inTab
    .filter((i) => city === 'all' || cityIdx(i) === city)
    .filter((i) => (kind === 'food' ? i.place.category === 'food' : kind === 'sights' ? i.place.category !== 'food' : true))
    .filter((i) => openDuring(i, when, cityDays.out.get(cityIdx(i)) ?? cityDays.all))
    // Ones still needing my vote first, then newest.
    .sort((a, b) => Number(!!a.votes[me.uid]) - Number(!!b.votes[me.uid]) || b.createdAt - a.createdAt);
  // One section per city, in trip order (a single city: no headers).
  const sections = multiCity
    ? trip.destinations.map((d, k) => ({ key: k, name: d.name, dates: cityDatesText(d), ideas: shown.filter((i) => cityIdx(i) === k) })).filter((x) => x.ideas.length)
    : [{ key: 0, name: '', dates: null, ideas: shown }];
  const chip = (on: boolean) => cx('shrink-0 px-3 min-h-8 rounded-full text-xs font-semibold border', on ? 'bg-[#00685F] border-[#00685F] text-white' : 'bg-white border-[#E7DFD5] text-[#161C23]');

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
            onClick={() => {
              setFilter(f.key);
              if (params.has('filter')) {
                params.delete('filter');
                setParams(params, { replace: true });
              }
            }}
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

      {inTab.length > 0 && (
        <div className="space-y-1.5">
          {multiCity && (
            <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-0.5" aria-label="Filter by city">
              <button type="button" className={chip(city === 'all')} onClick={() => setCity('all')}>
                All cities
              </button>
              {trip.destinations.map((d, k) => (
                <button key={k} type="button" className={chip(city === k)} onClick={() => setCity(k)}>
                  {d.name} · {inTab.filter((i) => cityIdx(i) === k).length}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-0.5" aria-label="Filter by type and opening hours">
            {KINDS.map(([k, label]) => (
              <button key={k} type="button" className={chip(kind === k)} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
            <span className="shrink-0 w-px bg-[#E7DFD5] mx-1" aria-hidden />
            {WHEN.map(([k, label]) => (
              <button key={k} type="button" className={chip(when === k)} onClick={() => setWhen(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <NeedsYouStrip needs={needs} tripId={trip.id} />

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
        <p className="text-sm text-[#6D7A77] py-8 text-center">{inTab.length ? 'Nothing matches these filters.' : active.empty}</p>
      ) : (
        sections.map((sec) => (
          <section key={sec.key} className="space-y-3">
            {sec.name && (
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-[#161C23] border-b border-[#E7DFD5] pb-1.5">
                <MapPin className="w-4 h-4 text-[#00685F]" /> {sec.name}
                {sec.dates && <span className="font-semibold text-[#6D7A77]">· {sec.dates}</span>}
                <span className="ml-auto text-xs font-semibold text-[#6D7A77]">{sec.ideas.length}</span>
              </h2>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
              {sec.ideas.map((i) => (
                <IdeaCard key={i.id} idea={i} {...cardSplit(i)} scheduledDay={dayOf.get(i.id)} />
              ))}
            </div>
          </section>
        ))
      )}

      <p className="text-[11px] text-[#9AA5A3] text-center">Place details and photos © Google. Halal information is guidance — always confirm with the venue.</p>

      <AddIdeaSheet open={adding} initialText={sharedText} onClose={() => (setAdding(false), setSharedText(undefined))} />
    </div>
  );
}
