import {
  AlertTriangle,
  ChevronDown,
  Clock,
  ExternalLink,
  Flag,
  Landmark,
  Loader2,
  MapPin,
  MoreHorizontal,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { conflictKey, HalalSummary, ideaConflicts, paths, tallyVotes, type Conflict, type Idea, type NearbyPlace } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { useDoc } from '../../lib/firestore';
import { Avatar, Badge, cx, ErrorBanner } from '../../ui';
import { useTrip } from '../TripLayout';
import { EVIDENCE_SOURCE, halalLabel, placePhotoUrl, type Tone } from './halalLabel';
import { ReportHalalSheet } from './ReportHalalSheet';

const TONE: Record<Tone, string> = {
  good: 'bg-[#E3F4EC] text-[#0B6B45] border-[#B7E1CB]',
  ok: 'bg-[#EAF4F3] text-[#00685F] border-[#C4E0DD]',
  warn: 'bg-[#FDF3E1] text-[#96590B] border-[#F0C987]',
  bad: 'bg-[#FDECEA] text-[#B3261E] border-[#F2B8B5]',
  muted: 'bg-[#F3EFE9] text-[#6D7A77] border-[#E7DFD5]',
};
const TONE_ICON = { good: ShieldCheck, ok: ShieldCheck, warn: ShieldAlert, bad: ShieldAlert, muted: ShieldQuestion };

const SOURCE_LABEL: Partial<Record<Idea['source']['type'], string>> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  xiaohongshu: 'Xiaohongshu',
  youtube: 'YouTube',
  screenshot: 'Screenshot',
  text: 'Caption',
  manual: 'Added manually',
};

const SENTIMENT = {
  highly_recommended: { text: 'Highly recommended', tone: 'good' },
  mixed: { text: 'Mixed reviews', tone: 'warn' },
  skip: { text: 'Reviewers say skip', tone: 'bad' },
} as const;

const SUGGESTION_TYPE = { alternative: 'Alternative', split: 'Split up briefly', timing: 'Timing', prep: 'Prepare' } as const;
/** Accepted onto the plan (or heading there) despite a conflict → show middle-ground ideas. */
const ACCEPTED: Idea['status'][] = ['backlog', 'scheduled', 'split_pending'];

const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

/** Checks run one after another, so a big import can take a few minutes to finish. */
const STALE_MS = 4 * 60_000;

export function IdeaCard({ idea }: { idea: Idea }) {
  const { trip, members, me, isAdmin } = useTrip();
  const community = useDoc(paths.halalSummary(idea.placeKey), HalalSummary);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [details, setDetails] = useState(false);
  const [reporting, setReporting] = useState(false);
  const autoRetried = useRef(false);
  const autoResolved = useRef('');

  const q = { tripId: trip.id };
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

  // An analysis that never finished (e.g. the adder closed the app) — retry once.
  const pending = idea.analysis?.status === 'pending';
  const stale = pending && Date.now() - (idea.analysis?.at ?? 0) > STALE_MS;
  useEffect(() => {
    if (stale && !autoRetried.current) {
      autoRetried.current = true;
      void api.post('ideas/analyze', { ideaId: idea.id }, q).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale]);

  const tally = tallyVotes(idea.votes, trip.memberIds);
  const myVote = idea.votes[me.uid]?.value ?? 0;
  const closed = !!idea.decidedBy || idea.status === 'scheduled';
  const byUid = new Map(members.map((m) => [m.uid, m]));
  const vote = (value: 1 | -1) => act(`vote${value}`, () => api.post('ideas/vote', { ideaId: idea.id, value: myVote === value ? 0 : value }, q));
  const decide = (action: 'close' | 'backlog' | 'reject' | 'reopen') => {
    setMenu(false);
    return act(action, () => api.post('ideas/decide', { ideaId: idea.id, action }, q));
  };

  const conflicts = ideaConflicts(idea, members, { currency: trip.currency, ...(community.data?.tier ? { communityTier: community.data.tier } : {}) });
  const cKey = conflictKey(conflicts);
  const accepted = ACCEPTED.includes(idea.status);
  const suggestions = idea.resolution?.key === cKey ? idea.resolution.suggestions : null;
  const resolve = (force = false) => act('resolve', () => api.post('ideas/resolve', { ideaId: idea.id, force }, q));
  // Only the admin and the affected members trigger the AI (it's cached per conflict set on the server).
  const mayResolve = isAdmin || conflicts.some((c) => c.uid === me.uid);
  useEffect(() => {
    if (accepted && conflicts.length && !suggestions && !pending && mayResolve && autoResolved.current !== cKey) {
      autoResolved.current = cKey;
      void resolve();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accepted, cKey, !!suggestions, pending]);

  const label = halalLabel(idea, community.data);
  const prayer = idea.halal?.prayer;
  const halalFood = idea.halal?.halalFood?.places ?? [];
  const HalalIcon = label ? TONE_ICON[label.tone] : ShieldQuestion;
  const s = idea.sentiment ? SENTIMENT[idea.sentiment.verdict] : null;
  const canManage = idea.createdBy === me.uid || isAdmin;
  const price = idea.place.priceLevel ? '$'.repeat(idea.place.priceLevel) : null;

  return (
    <article className="bg-white rounded-2xl border border-[#E7DFD5] shadow-xs overflow-hidden flex flex-col">
      {idea.place.photoName && (
        <div className="relative h-40 bg-[#F3EFE9]">
          <img
            // The stored direct URL is free to load (and cached); the media endpoint bills per view — fallback only.
            src={idea.place.photoUrl ?? placePhotoUrl(idea.place.photoName)}
            onError={(e) => {
              const fallback = placePhotoUrl(idea.place.photoName!);
              if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
            }}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          {idea.place.photoAttribution && (
            <span className="absolute bottom-1 right-1.5 text-[10px] text-white/90 bg-black/40 rounded px-1.5 py-0.5 max-w-[80%] truncate">
              Photo: {idea.place.photoAttribution}
            </span>
          )}
        </div>
      )}

      <div className="p-4 space-y-3 flex-1 flex flex-col">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-[#161C23] leading-snug">{idea.place.name}</h3>
            <p className="text-xs text-[#6D7A77] flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              {idea.place.typeLabel && <span>{idea.place.typeLabel}</span>}
              {idea.place.rating !== undefined && (
                <span className="inline-flex items-center gap-0.5">
                  <Star className="w-3 h-3 fill-[#F2B544] text-[#F2B544]" /> {idea.place.rating}
                  {idea.place.ratingCount ? ` (${idea.place.ratingCount.toLocaleString()})` : ''}
                </span>
              )}
              {price && <span>{price}</span>}
            </p>
          </div>
          <div className="relative shrink-0">
            <button onClick={() => setMenu((m) => !m)} aria-label="More actions" className="w-8 h-8 rounded-lg hover:bg-[#F3EFE9] inline-flex items-center justify-center text-[#6D7A77]">
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menu && (
              <div className="absolute right-0 top-9 z-10 w-56 bg-white rounded-xl border border-[#E7DFD5] shadow-lg p-1.5 text-sm" onMouseLeave={() => setMenu(false)}>
                {idea.place.placeId && (
                  <MenuItem icon={<MapPin className="w-4 h-4" />} onClick={() => window.open(`https://www.google.com/maps/place/?q=place_id:${idea.place.placeId}`, '_blank', 'noopener')}>
                    Open in Google Maps
                  </MenuItem>
                )}
                {idea.place.category === 'food' && (
                  <MenuItem icon={<Flag className="w-4 h-4" />} onClick={() => (setMenu(false), setReporting(true))}>
                    Report halal status
                  </MenuItem>
                )}
                <MenuItem icon={<RefreshCw className="w-4 h-4" />} onClick={() => (setMenu(false), act('recheck', () => api.post('ideas/analyze', { ideaId: idea.id, force: true }, q)))}>
                  Re-check halal & reviews
                </MenuItem>
                {isAdmin && !closed && idea.status === 'voting' && <MenuItem onClick={() => decide('close')}>Close voting now</MenuItem>}
                {isAdmin && idea.status !== 'backlog' && <MenuItem onClick={() => decide('backlog')}>Move to backlog</MenuItem>}
                {isAdmin && idea.status !== 'rejected' && <MenuItem onClick={() => decide('reject')}>Reject</MenuItem>}
                {isAdmin && closed && <MenuItem onClick={() => decide('reopen')}>Reopen voting</MenuItem>}
                {canManage && (
                  <MenuItem
                    danger
                    icon={<Trash2 className="w-4 h-4" />}
                    onClick={() => {
                      setMenu(false);
                      if (confirm(`Remove ${idea.place.name} from the Idea Board?`)) void act('delete', () => api.post('ideas/delete', { ideaId: idea.id }, q));
                    }}
                  >
                    Remove idea
                  </MenuItem>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Halal Radar */}
        {pending && !stale ? (
          <p className="flex items-center gap-2 text-xs text-[#6D7A77]">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00685F]" /> Checking halal status & reviews…
          </p>
        ) : label ? (
          <button type="button" onClick={() => setDetails((d) => !d)} className={cx('w-full text-left rounded-xl border px-3 py-2', TONE[label.tone])} aria-expanded={details}>
            <span className="flex items-center gap-2 text-sm font-bold">
              <HalalIcon className="w-4 h-4 shrink-0" /> {label.text}
              <ChevronDown className={cx('w-4 h-4 ml-auto transition-transform', details && 'rotate-180')} />
            </span>
            <span className="block text-[11px] opacity-80 mt-0.5">{label.basis}</span>
          </button>
        ) : idea.analysis?.status === 'error' ? (
          <p className="text-xs text-[#96590B]">Couldn't check this place yet. Use ⋯ → Re-check.</p>
        ) : null}
        {!pending && prayer && prayer.access !== 'unknown' && (
          <p className={cx('flex items-start gap-1.5 text-xs', prayer.access === 'far' ? 'text-[#96590B]' : 'text-[#3E4947]')}>
            <Landmark className="w-3.5 h-3.5 mt-px shrink-0" />
            <span>
              {prayer.places[0]
                ? `Pray at ${prayer.places[0].name} · ${fmtDist(prayer.places[0].distanceM)} · ${prayer.places[0].walkMin} min walk`
                : prayer.access === 'onsite'
                  ? 'Prayer space on site'
                  : 'No mosque or prayer room within 2 km'}
            </span>
          </p>
        )}

        {details && (
          <div className="space-y-2 text-sm">
            {!!label?.evidence.length && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#6D7A77] mb-1">Why</p>
                <ul className="space-y-1">
                  {label.evidence.map((e) => (
                    <li key={e.text} className="flex items-start gap-2 text-[#161C23]">
                      <span className="mt-2 w-1 h-1 rounded-full bg-[#6D7A77] shrink-0" aria-hidden />
                      <span className="flex-1">
                        {e.text} <span className="whitespace-nowrap text-[10px] font-semibold text-[#6D7A77] bg-[#F3EFE9] rounded px-1.5 py-0.5 align-middle">{EVIDENCE_SOURCE[e.source]}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {idea.halal?.flags.servesAlcohol && <Badge tone="amber">Serves alcohol</Badge>}
            {prayer && prayer.places.length > 1 && <NearbyList title="Places to pray nearby" places={prayer.places} />}
            {!!halalFood.length && (idea.place.category !== 'food' || label?.tone === 'warn' || label?.tone === 'bad') && (
              <NearbyList title="Halal food nearby" places={halalFood} />
            )}
            {idea.place.openingHours && (
              <details className="text-xs text-[#6D7A77]">
                <summary className="cursor-pointer inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Opening hours
                </summary>
                <ul className="mt-1 space-y-0.5">
                  {idea.place.openingHours.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </details>
            )}
            <p className="text-[11px] text-[#9AA5A3]">Always confirm halal status with the restaurant. Place info © Google.</p>
          </div>
        )}

        {!!conflicts.length && (
          <ConflictBox conflicts={conflicts} accepted={accepted} suggestions={suggestions} busy={busy === 'resolve'} canResolve={mayResolve} onResolve={() => resolve(!!suggestions)} />
        )}

        {/* Reviews */}
        {s && idea.sentiment && (
          <div className="text-sm space-y-1">
            <p className="flex items-center gap-2">
              <span className={cx('px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap shrink-0', TONE[s.tone])}>{s.text}</span>
              <span className="text-[11px] text-[#6D7A77]">{idea.sentiment.basedOn}</span>
            </p>
            {!!idea.sentiment.pros.length && <p className="text-xs text-[#0B6B45]">+ {idea.sentiment.pros.join(' · ')}</p>}
            {!!idea.sentiment.cons.length && <p className="text-xs text-[#B3261E]">− {idea.sentiment.cons.join(' · ')}</p>}
          </div>
        )}

        {/* Source */}
        <p className="text-xs text-[#6D7A77] flex items-center gap-1.5 min-w-0">
          <span className="shrink-0">{SOURCE_LABEL[idea.source.type] ?? idea.source.type}</span>
          {idea.source.url && (
            <a href={idea.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[#00685F] font-semibold shrink-0">
              view post <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <span aria-hidden>·</span>
          <span className="truncate">by {byUid.get(idea.createdBy)?.displayName ?? 'someone'}</span>
        </p>

        {/* Voting */}
        <div className="mt-auto pt-3 border-t border-[#E7DFD5] space-y-2">
          <div className="flex items-center gap-2">
            <VoteButton active={myVote === 1} disabled={closed || !!busy} busy={busy === 'vote1'} onClick={() => vote(1)} count={tally.up} up />
            <VoteButton active={myVote === -1} disabled={closed || !!busy} busy={busy === 'vote-1'} onClick={() => vote(-1)} count={tally.down} />
            <div className="ml-auto flex -space-x-1.5">
              {trip.memberIds
                .filter((u) => idea.votes[u])
                .slice(0, 6)
                .map((u) => {
                  const m = byUid.get(u);
                  return (
                    <span key={u} title={`${m?.displayName ?? 'Member'} ${idea.votes[u].value === 1 ? '👍' : '👎'}${idea.votes[u].reason ? ` — ${idea.votes[u].reason}` : ''}`} className={cx('rounded-full ring-2', idea.votes[u].value === 1 ? 'ring-[#B7E1CB]' : 'ring-[#F2B8B5]')}>
                      <Avatar name={m?.displayName ?? '?'} photoURL={m?.photoURL} size={22} />
                    </span>
                  );
                })}
            </div>
          </div>
          {idea.status === 'voting' && tally.pending.length > 0 && (
            <p className="text-[11px] text-[#6D7A77]">
              Waiting for {tally.pending.map((u) => (u === me.uid ? 'you' : byUid.get(u)?.displayName ?? 'someone')).join(', ')}
            </p>
          )}
          {idea.status === 'mixed' && <p className="text-[11px] text-[#96590B]">Votes are split — the admin can move it to the backlog or reject it.</p>}
          {closed && idea.decidedBy && <p className="text-[11px] text-[#6D7A77]">Decided by {byUid.get(idea.decidedBy)?.displayName ?? 'the admin'}.</p>}
        </div>
        <ErrorBanner>{error}</ErrorBanner>
      </div>

      {reporting && <ReportHalalSheet idea={idea} community={community.data} onClose={() => setReporting(false)} />}
    </article>
  );
}

function VoteButton({ up, active, count, disabled, busy, onClick }: { up?: boolean; active: boolean; count: number; disabled: boolean; busy: boolean; onClick: () => void }) {
  const Icon = up ? ThumbsUp : ThumbsDown;
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={up ? 'Vote yes' : 'Vote no'}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full border text-sm font-bold transition-colors disabled:opacity-60',
        active ? (up ? 'bg-[#0B6B45] border-[#0B6B45] text-white' : 'bg-[#B3261E] border-[#B3261E] text-white') : 'bg-white border-[#E7DFD5] text-[#161C23] hover:border-[#00685F]/40',
      )}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />} {count}
    </button>
  );
}

function NearbyList({ title, places }: { title: string; places: NearbyPlace[] }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#6D7A77] mb-1">{title}</p>
      <ul className="space-y-0.5 text-xs text-[#3E4947]">
        {places.map((p) => (
          <li key={`${p.name}-${p.distanceM}`}>
            <a
              href={p.placeId ? `https://www.google.com/maps/place/?q=place_id:${p.placeId}` : `https://www.google.com/maps/search/?api=1&query=${p.location.lat},${p.location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00685F] font-semibold"
            >
              {p.name}
            </a>{' '}
            · {fmtDist(p.distanceM)} · {p.walkMin} min walk
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConflictBox({
  conflicts,
  accepted,
  suggestions,
  busy,
  canResolve,
  onResolve,
}: {
  conflicts: Conflict[];
  accepted: boolean;
  suggestions: NonNullable<Idea['resolution']>['suggestions'] | null;
  busy: boolean;
  canResolve: boolean;
  onResolve: () => void;
}) {
  const blocker = conflicts.some((c) => c.severity === 'blocker');
  const byMember = new Map<string, { name: string; details: string[] }>();
  for (const c of conflicts) {
    const entry = byMember.get(c.uid) ?? { name: c.name, details: [] };
    entry.details.push(c.detail);
    byMember.set(c.uid, entry);
  }
  return (
    <section className={cx('rounded-xl border px-3 py-2.5 text-sm space-y-2', blocker ? 'bg-[#FDECEA] border-[#F2B8B5]' : 'bg-[#FDF3E1] border-[#F0C987]')}>
      <p className={cx('flex items-center gap-2 font-bold', blocker ? 'text-[#B3261E]' : 'text-[#96590B]')}>
        <AlertTriangle className="w-4 h-4 shrink-0" />
        {accepted ? 'Accepted with conflicts' : 'Conflicts with preferences'}
      </p>
      <ul className="space-y-1 text-xs text-[#161C23]">
        {[...byMember].map(([uid, m]) => (
          <li key={uid}>
            <span className="font-bold">{m.name}:</span> {m.details.join(' ')}
          </li>
        ))}
      </ul>
      {!!suggestions?.length && (
        <div className="pt-2 border-t border-black/10 space-y-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#00685F]">
            <Sparkles className="w-3.5 h-3.5" /> Middle ground
          </p>
          <ul className="space-y-1.5">
            {suggestions.map((s) => (
              <li key={s.title} className="bg-white/70 rounded-lg px-2.5 py-1.5">
                <p className="text-xs font-bold text-[#161C23]">
                  {s.title} <span className="font-semibold text-[10px] text-[#6D7A77]">· {SUGGESTION_TYPE[s.type]}</span>
                </p>
                <p className="text-xs text-[#3E4947]">{s.detail}</p>
                {!!s.forUids.length && (
                  <p className="text-[10px] text-[#6D7A77] mt-0.5">
                    For {s.forUids
                      .map((u) => byMember.get(u)?.name)
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {canResolve && (
        <button type="button" onClick={onResolve} disabled={busy} className="inline-flex items-center gap-1.5 min-h-8 text-xs font-bold text-[#00685F] disabled:opacity-60">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {busy ? 'Finding a middle ground…' : suggestions ? 'Suggest again' : 'Suggest a middle ground'}
        </button>
      )}
    </section>
  );
}

function MenuItem({ icon, danger, onClick, children }: { icon?: React.ReactNode; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cx('w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left', danger ? 'text-[#B3261E] hover:bg-[#FDECEA]' : 'text-[#161C23] hover:bg-[#F3EFE9]')}>
      {icon ?? <span className="w-4" />} {children}
    </button>
  );
}
