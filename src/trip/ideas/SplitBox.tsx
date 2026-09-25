// Split Tracks on an idea card: offer a split when the group disagrees (or
// someone can't go), show the proposal, and let the admin approve / reject /
// cancel it. Any member can ask for a proposal or another option.
import { GitFork, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { Conflict, Idea, Split } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { Avatar, Button, ErrorBanner } from '../../ui';
import { useTrip } from '../TripLayout';

export function SplitBox({ idea, split, other, conflicts }: { idea: Idea; split: Split | null; other?: Idea; conflicts: Conflict[] }) {
  const { trip, members, me, isAdmin } = useTrip();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const q = { tripId: trip.id };
  const byUid = new Map(members.map((m) => [m.uid, m]));

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };
  const propose = (exclude: string[] = []) =>
    act('propose', async () => {
      const originalId = split?.trackA.ideaId ?? idea.id;
      const r = await api.post<{ altIdeaId: string }>('splits/propose', { ideaId: originalId, exclude }, q);
      // Run the Halal Radar on the alternative right away (fire and forget).
      void api.post('ideas/analyze', { ideaId: r.altIdeaId }, q).catch(() => {});
    });
  const decide = (action: 'approve' | 'reject') => act(action, () => api.post('splits/decide', { splitId: split!.id, action }, q));

  // Offer a split: votes are mixed, or someone can't go as it is.
  if (!split) {
    const blocked = [...new Set(conflicts.filter((c) => c.severity === 'blocker').map((c) => c.name))];
    const splittable = idea.status === 'mixed' || (blocked.length > 0 && ['voting', 'backlog'].includes(idea.status) && blocked.length < members.length);
    if (!splittable) return null;
    return (
      <div className="rounded-xl border border-[#D8E6F3] bg-[#F3F8FD] p-3 space-y-2 text-sm">
        <p className="font-semibold text-[#1D4E89] flex items-center gap-1.5">
          <GitFork className="w-4 h-4" /> Split up for this one?
        </p>
        <p className="text-[#3F5873] text-xs">
          {blocked.length ? `${blocked.join(', ')} can't go as it is.` : 'The votes are split.'} Safar can find a nearby alternative for them and a time to meet back up.
        </p>
        <ErrorBanner>{error}</ErrorBanner>
        <Button variant="secondary" className="w-full" loading={busy === 'propose'} onClick={() => propose()}>
          Suggest a split
        </Button>
      </div>
    );
  }

  const scheduled = idea.status === 'scheduled' || other?.status === 'scheduled';
  const alt = split.trackA.ideaId === idea.id ? other : idea;
  const Track = ({ label, uids }: { label: string; uids: string[] }) => (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex -space-x-1.5 shrink-0">
        {uids.map((u) => (
          <span key={u} className={u === me.uid ? 'rounded-full ring-2 ring-[#1D4E89]' : ''}>
            <Avatar name={byUid.get(u)?.displayName ?? '?'} photoURL={byUid.get(u)?.photoURL} size={22} />
          </span>
        ))}
      </div>
      <span className="text-xs text-[#3F5873] truncate">{label}</span>
    </div>
  );

  return (
    <div className="rounded-xl border border-[#D8E6F3] bg-[#F3F8FD] p-3 space-y-2 text-sm">
      <p className="font-semibold text-[#1D4E89] flex items-center gap-1.5">
        <GitFork className="w-4 h-4" /> {split.status === 'approved' ? 'Split approved' : 'Split proposed'}
        {split.status === 'proposed' && <span className="text-[11px] font-normal text-[#3F5873]">· waiting for the admin</span>}
      </p>
      <p className="text-xs text-[#3F5873]">{split.explanation}</p>
      <Track label={split.reunion.place.name} uids={split.trackA.memberUids} />
      <Track label={`${alt?.place.name ?? 'Alternative'} · ${split.walkMin} min walk`} uids={split.trackB.memberUids} />
      <ErrorBanner>{error}</ErrorBanner>
      <div className="flex flex-wrap gap-2">
        {split.status === 'proposed' && isAdmin && (
          <Button className="flex-1" loading={busy === 'approve'} disabled={!!busy} onClick={() => decide('approve')}>
            Approve
          </Button>
        )}
        {split.status === 'proposed' && (
          <Button variant="secondary" className="flex-1" loading={busy === 'propose'} disabled={!!busy} onClick={() => propose(alt?.place.placeId ? [alt.place.placeId] : [])}>
            <RefreshCw className="w-4 h-4" /> Another option
          </Button>
        )}
        {isAdmin && (
          <Button variant="ghost" className="flex-1" loading={busy === 'reject'} disabled={!!busy || scheduled} onClick={() => decide('reject')}>
            {split.status === 'approved' ? 'Cancel split' : 'Reject'}
          </Button>
        )}
      </div>
      {scheduled && isAdmin && <p className="text-[11px] text-[#3F5873]">It's on the timeline — take it off there before cancelling.</p>}
    </div>
  );
}
