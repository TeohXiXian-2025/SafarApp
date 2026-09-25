// The "what now?" part of an idea card:
//   split votes → the people not going pick a middle ground (24 h); the admin
//                 sees the groups that would form and accepts / backs up / rejects
//   accepted    → the groups (if split), "I can't go" to step out (no approval
//                 needed), "Rejoin the group" to come back
import { Check, GitFork, RefreshCw, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  aloneIn,
  durText,
  groupChoices,
  nonGoers,
  readyForAdmin,
  VOTE_REASONS,
  waitingToChoose,
  type Idea,
  type Member,
  type MiddleOption,
  type Split,
} from '../../domain';
import { api, ApiError } from '../../lib/api';
import { Avatar, Button, cx, ErrorBanner, Input, Sheet } from '../../ui';
import { TRACK_COLOR } from '../trackColors';
import { useTrip } from '../TripLayout';

const hoursLeft = (until?: number) => {
  if (!until) return null;
  const h = Math.ceil((until - Date.now()) / 3_600_000);
  return h > 0 ? `${h} h` : null;
};

function People({ uids, byUid, me, size = 22 }: { uids: string[]; byUid: Map<string, Member>; me: string; size?: number }) {
  return (
    <span className="flex -space-x-1.5 shrink-0">
      {uids.map((u) => (
        <span key={u} className={cx('rounded-full', u === me && 'ring-2 ring-[#161C23]')} title={byUid.get(u)?.displayName}>
          <Avatar name={byUid.get(u)?.displayName ?? '?'} photoURL={byUid.get(u)?.photoURL} size={size} />
        </span>
      ))}
    </span>
  );
}

const names = (uids: string[], byUid: Map<string, Member>, me: string) => uids.map((u) => (u === me ? 'you' : byUid.get(u)?.displayName ?? '?')).join(', ');

export function DecisionBox({ idea, split, alts }: { idea: Idea; split: Split | null; alts: Map<string, Idea> }) {
  const { trip, members, me, isAdmin } = useTrip();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [stepping, setStepping] = useState(false);
  const asked = useRef(false);
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

  const mixed = idea.status === 'mixed';
  // Options are made when votes split; fetch them if that didn't happen (e.g. the AI step failed).
  useEffect(() => {
    if (mixed && !idea.options?.length && !asked.current) {
      asked.current = true;
      void api.post('ideas/options', { ideaId: idea.id }, q).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixed, !!idea.options?.length]);

  if (mixed) {
    const choosers = nonGoers(idea, trip.memberIds);
    const waiting = waitingToChoose(idea, trip.memberIds);
    const iChoose = choosers.includes(me.uid);
    const mine = idea.choices[me.uid]?.optionId;
    const groups = groupChoices(idea, trip.memberIds);
    const ready = readyForAdmin(idea, trip.memberIds, Date.now());
    const left = hoursLeft(idea.choiceEndsAt);
    const pickersOf = (o: MiddleOption) => choosers.filter((u) => idea.choices[u]?.optionId === o.id);
    return (
      <div className="rounded-xl border border-[#D8E6F3] bg-[#F3F8FD] p-3 space-y-3 text-sm">
        <div>
          <p className="font-semibold text-[#1D4E89] flex items-center gap-1.5">
            <GitFork className="w-4 h-4" /> Votes are split
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-[#3F5873]">
            {choosers.map((u) => {
              const v = idea.votes[u];
              return (
                <li key={u}>
                  👎 <b>{u === me.uid ? 'You' : byUid.get(u)?.displayName}</b>: {v?.tag ? VOTE_REASONS[v.tag] : 'no reason'}
                  {v?.reason ? ` — “${v.reason}”` : ''}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-bold text-[#1D4E89]">{iChoose ? 'Pick what works for you' : 'Middle grounds for the people not going'}</p>
          {!idea.options?.length && <p className="text-xs text-[#3F5873]">Finding options nearby…</p>}
          {idea.options?.map((o) => {
            const who = pickersOf(o);
            const picked = mine === o.id;
            return (
              <div key={o.id} className={cx('rounded-lg border bg-white p-2.5 flex items-start gap-2', picked ? 'border-[#1D4E89] ring-1 ring-[#1D4E89]/30' : 'border-[#D8E6F3]')}>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#161C23] text-sm">
                    {o.title}
                    {o.place?.halalListed && <span className="ml-1.5 text-[10px] font-bold text-[#0B6B45] bg-[#E3F4EC] rounded px-1 py-0.5 align-middle">HALAL-LISTED</span>}
                  </p>
                  <p className="text-xs text-[#6D7A77]">{o.detail}</p>
                  {!!who.length && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <People uids={who} byUid={byUid} me={me.uid} size={18} />
                      <span className="text-[11px] text-[#3F5873]">{names(who, byUid, me.uid)}</span>
                    </div>
                  )}
                </div>
                {iChoose && (
                  <Button
                    variant={picked ? 'primary' : 'secondary'}
                    className="shrink-0 min-h-9 px-3"
                    loading={busy === o.id}
                    disabled={!!busy}
                    onClick={() => act(o.id, () => api.post('ideas/choose', { ideaId: idea.id, optionId: o.id, ...(note.trim() ? { note: note.trim() } : {}) }, q))}
                  >
                    {picked ? <Check className="w-4 h-4" /> : 'Pick'}
                  </Button>
                )}
              </div>
            );
          })}
          {iChoose && (
            <div className="flex gap-2">
              <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Note for the group (optional)" className="min-h-9 text-sm" />
              <Button variant="ghost" className="shrink-0 min-h-9 px-2.5" loading={busy === 'more'} disabled={!!busy} onClick={() => act('more', () => api.post('ideas/options', { ideaId: idea.id, more: true }, q))}>
                <RefreshCw className="w-4 h-4" /> More
              </Button>
            </div>
          )}
        </div>

        <p className="text-[11px] text-[#3F5873]">
          {waiting.length
            ? `Waiting for ${names(waiting, byUid, me.uid)} to pick${left ? ` · ${left} left, then free time is picked for them` : ' · time is up'}.`
            : 'Everyone has picked — waiting for the admin.'}
        </p>

        {isAdmin && (
          <div className="rounded-lg bg-white border border-[#D8E6F3] p-2.5 space-y-2">
            <p className="text-xs font-bold text-[#161C23] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> If you accept now
            </p>
            <ul className="text-xs space-y-0.5">
              <li style={{ color: TRACK_COLOR.A.main }}>● {idea.place.name}: {names(groups.main, byUid, me.uid) || 'nobody'}</li>
              {groups.alternatives.map((g, i) => (
                <li key={g.option.id} style={{ color: TRACK_COLOR[i === 0 ? 'B' : 'C'].main }}>
                  ● {g.option.place?.name}: {names(g.uids, byUid, me.uid)}
                </li>
              ))}
              {!!groups.freeTime.length && (
                <li style={{ color: TRACK_COLOR.F.main }}>
                  ● Free time: {names(groups.freeTime, byUid, me.uid)}
                  {groups.undecided.length ? ` (${names(groups.undecided, byUid, me.uid)} didn't pick)` : ''}
                </li>
              )}
            </ul>
            {groups.timing && <p className="text-[11px] text-[#96590B]">Someone asked for a different time: {groups.timing.title}. Accepting sets that time for everyone.</p>}
            {[...groups.alternatives.map((g) => g.uids), groups.freeTime].filter((u) => u.length === 1).map((u) => (
              <p key={u[0]} className="text-[11px] text-[#96590B]">⚠️ {names(u, byUid, me.uid)} would be on their own.</p>
            ))}
            {!ready && <p className="text-[11px] text-[#6D7A77]">Not everyone has picked yet — you can still decide now.</p>}
            <div className="flex flex-wrap gap-2">
              <Button className="flex-1 min-h-9" loading={busy === 'accept'} disabled={!!busy} onClick={() => act('accept', () => api.post('ideas/decide', { ideaId: idea.id, action: 'accept' }, q))}>
                Accept
              </Button>
              <Button variant="secondary" className="flex-1 min-h-9" loading={busy === 'backup'} disabled={!!busy} onClick={() => act('backup', () => api.post('ideas/decide', { ideaId: idea.id, action: 'backup' }, q))}>
                Keep as backup
              </Button>
              <Button variant="ghost" className="flex-1 min-h-9" loading={busy === 'reject'} disabled={!!busy} onClick={() => act('reject', () => api.post('ideas/decide', { ideaId: idea.id, action: 'reject' }, q))}>
                Reject
              </Button>
            </div>
          </div>
        )}
        <ErrorBanner>{error}</ErrorBanner>
      </div>
    );
  }

  if (idea.status !== 'backlog' && idea.status !== 'scheduled') return null;
  const tracks = split?.status === 'approved' ? split.tracks : [];
  const myTrack = tracks.find((t) => t.memberUids.includes(me.uid));
  const outside = !!myTrack && myTrack.key !== 'A';

  return (
    <>
      {!!tracks.length && (
        <div className="rounded-xl border border-[#D8E6F3] bg-[#F7FAFD] p-3 space-y-2 text-sm">
          <p className="font-semibold text-[#1D4E89] flex items-center gap-1.5">
            <GitFork className="w-4 h-4" /> {tracks.length} groups · meet back at {idea.place.name} after {durText(split!.reunion.afterMinutes)}
          </p>
          {tracks.map((t) => {
            const alt = t.ideaId && t.key !== 'A' ? alts.get(t.ideaId) : undefined;
            return (
              <div key={t.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: TRACK_COLOR[t.key].soft }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: TRACK_COLOR[t.key].main }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate" style={{ color: TRACK_COLOR[t.key].main }}>
                    {t.key === 'A' ? idea.place.name : t.key === 'F' ? 'Free time nearby' : (alt?.place.name ?? t.label)}
                    {t.key !== 'A' && t.key !== 'F' && ` · ${t.walkMin} min walk`}
                  </p>
                  <p className="text-[11px] text-[#3E4947] truncate">{names(t.memberUids, byUid, me.uid)}</p>
                </div>
                <People uids={t.memberUids} byUid={byUid} me={me.uid} size={20} />
              </div>
            );
          })}
          {aloneIn(tracks).map((t) => (
            <p key={t.key} className="text-[11px] text-[#96590B]">⚠️ {names(t.memberUids, byUid, me.uid)} will be on their own — share your live location.</p>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 text-xs">
        {outside ? (
          <button type="button" className="font-semibold text-[#00685F] underline underline-offset-2" disabled={!!busy} onClick={() => act('optin', () => api.post('ideas/optin', { ideaId: idea.id }, q))}>
            {busy === 'optin' ? 'Rejoining…' : 'Rejoin the main group'}
          </button>
        ) : (
          <button type="button" className="font-semibold text-[#6D7A77] underline underline-offset-2" onClick={() => setStepping(true)}>
            Can't make it? Step out
          </button>
        )}
      </div>
      <ErrorBanner>{error}</ErrorBanner>
      {stepping && <StepOutSheet idea={idea} onClose={() => setStepping(false)} />}
    </>
  );
}

/** "I can't go" after acceptance: pick an alternative or free time — no approval needed. */
export function StepOutSheet({ idea, onClose }: { idea: Idea; onClose: () => void }) {
  const { trip } = useTrip();
  const [options, setOptions] = useState<MiddleOption[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const q = { tripId: trip.id };
  useEffect(() => {
    api
      .post<{ options: MiddleOption[] }>('ideas/options', { ideaId: idea.id }, q)
      .then((r) => setOptions(r.options.filter((o) => o.type === 'alternative' || o.type === 'free_time')))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load options'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pick = async (o: MiddleOption) => {
    setBusy(o.id);
    setError('');
    try {
      await api.post('ideas/optout', { ideaId: idea.id, optionId: o.id, ...(note.trim() ? { note: note.trim() } : {}) }, q);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`Skip ${idea.place.name}?`}>
      <div className="space-y-3">
        <p className="text-sm text-[#6D7A77]">The group still goes. Pick what you'll do instead — you'll all meet back up after. No approval needed.</p>
        {!options && !error && <p className="text-sm text-[#6D7A77]">Finding options nearby…</p>}
        {options?.map((o) => (
          <button key={o.id} type="button" disabled={!!busy} onClick={() => pick(o)} className="w-full text-left rounded-xl border border-[#E7DFD5] bg-white p-3 hover:border-[#00685F]/50">
            <p className="font-semibold text-[#161C23] text-sm">{busy === o.id ? 'Saving…' : o.title}</p>
            <p className="text-xs text-[#6D7A77]">{o.detail}</p>
          </button>
        ))}
        <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Why? (optional, the group sees it)" />
        {error && <ErrorBanner>{error}</ErrorBanner>}
      </div>
    </Sheet>
  );
}
