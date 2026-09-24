import { Check, Copy, Crown, Link2, LogOut, MessageCircle, Share2, Trash2, UserMinus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { Invite, Member } from '../domain';
import { api, ApiError } from '../lib/api';
import { shareUrl } from '../config';
import { timeAgo } from '../lib/format';
import { Avatar, Badge, Button, Card, ErrorBanner } from '../ui';
import { GroupPrefsCard } from './GroupPrefsCard';
import { useTrip } from './TripLayout';

const inviteUrl = (token: string) => shareUrl(`/join/${token}`);

export function MembersPage() {
  const { trip, members, me, isAdmin } = useTrip();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

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

  const q = { tripId: trip.id };
  const remove = (m: Member) =>
    confirm(`Remove ${m.displayName} from this trip?`) && act(`remove:${m.uid}`, () => api.post('members/remove', { uid: m.uid }, q));
  const makeAdmin = (m: Member) =>
    confirm(`Make ${m.displayName} the trip admin? You'll become a regular member.`) &&
    act(`admin:${m.uid}`, () => api.post('members/transfer-admin', { uid: m.uid }, q));
  const leave = () =>
    confirm('Leave this trip? You can only rejoin with a new invite link.') &&
    act('leave', async () => {
      await api.post('members/leave', {}, q);
      navigate('/trips', { replace: true });
    });

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_360px] items-start">
      <div className="space-y-4">
        {params.get('welcome') && isAdmin && (
          <Card className="p-4 border-[#00685F]/30 bg-[#00685F]/5">
            <p className="font-bold text-[#00685F]">Trip created 🎉</p>
            <p className="text-sm text-[#161C23]">Next: share an invite link so your group can join.</p>
          </Card>
        )}

        <ErrorBanner>{error}</ErrorBanner>

        <Card className="divide-y divide-[#E7DFD5]">
          {members.map((m) => (
            <div key={m.uid} className="flex items-center gap-3 p-4">
              <Avatar name={m.displayName} photoURL={m.photoURL} size={40} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#161C23] truncate">
                  {m.displayName} {m.uid === me.uid && <span className="text-[#6D7A77] font-normal">(you)</span>}
                </p>
                <p className="text-xs text-[#6D7A77]">
                  Joined {timeAgo(m.joinedAt)} · {m.prefs ? 'preferences set' : <span className="text-[#96590B]">no preferences yet</span>}
                </p>
              </div>
              {m.role === 'admin' && (
                <Badge tone="amber">
                  <Crown className="w-3 h-3" /> Admin
                </Badge>
              )}
              {isAdmin && m.uid !== me.uid && (
                <div className="flex gap-1">
                  <IconButton label={`Make ${m.displayName} admin`} onClick={() => makeAdmin(m)} busy={busy === `admin:${m.uid}`}>
                    <Crown className="w-4 h-4" />
                  </IconButton>
                  <IconButton label={`Remove ${m.displayName}`} onClick={() => remove(m)} busy={busy === `remove:${m.uid}`} danger>
                    <UserMinus className="w-4 h-4" />
                  </IconButton>
                </div>
              )}
            </div>
          ))}
        </Card>

        {!isAdmin && (
          <Button variant="secondary" onClick={leave} loading={busy === 'leave'} className="text-[#B3261E]">
            <LogOut className="w-4 h-4" /> Leave trip
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <GroupPrefsCard />
        {isAdmin ? (
          <InvitePanel tripId={trip.id} tripName={trip.name} />
        ) : (
          <Card className="p-5 text-sm text-[#6D7A77]">Only the trip admin can invite people. Ask them for a link.</Card>
        )}
      </div>
    </div>
  );
}

function InvitePanel({ tripId, tripName }: { tripId: string; tripName: string }) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      api
        .get<{ invites: Invite[] }>('invites/list', { tripId })
        .then((r) => setInvites(r.invites))
        .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load invite links.')),
    [tripId],
  );
  useEffect(() => void load(), [load]);

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      await api.post('invites/create', { maxUses: 20, expiresInDays: 7 }, { tripId });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create a link.');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (token: string) => {
    if (!confirm('Revoke this link? People who already joined stay in the trip.')) return;
    await api.post('invites/revoke', { token }, { tripId }).catch(() => {});
    await load();
  };

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(inviteUrl(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const message = (token: string) => `Join our trip "${tripName}" on Safar: ${inviteUrl(token)}`;
  const share = (token: string) => navigator.share?.({ title: tripName, text: message(token) }).catch(() => {});

  const active = (invites ?? []).filter((i) => i.expiresAt > Date.now() && i.uses < i.maxUses);

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-bold text-[#161C23] flex items-center gap-2">
          <Link2 className="w-4 h-4 text-[#00685F]" /> Invite links
        </h2>
        <p className="text-xs text-[#6D7A77] mt-1">Anyone with a link can join (up to 20 people, valid 7 days).</p>
      </div>
      <ErrorBanner>{error}</ErrorBanner>

      {active.map((i) => (
        <div key={i.token} className="rounded-xl border border-[#E7DFD5] p-3 space-y-2.5">
          <p className="text-xs font-mono text-[#161C23] break-all bg-[#FAF8F5] rounded-lg px-2.5 py-2">{inviteUrl(i.token)}</p>
          <p className="text-xs text-[#6D7A77]">
            Used {i.uses}/{i.maxUses} · expires {timeAgo(i.expiresAt)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="min-h-9 px-3" onClick={() => void copy(i.token)}>
              {copied === i.token ? <Check className="w-4 h-4 text-[#00685F]" /> : <Copy className="w-4 h-4" />}
              {copied === i.token ? 'Copied' : 'Copy'}
            </Button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message(i.token))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 min-h-9 px-3 rounded-xl text-sm font-bold bg-[#25D366] text-white"
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
            {'share' in navigator && (
              <Button variant="secondary" className="min-h-9 px-3" onClick={() => share(i.token)}>
                <Share2 className="w-4 h-4" /> Share
              </Button>
            )}
            <IconButton label="Revoke link" onClick={() => void revoke(i.token)} danger>
              <Trash2 className="w-4 h-4" />
            </IconButton>
          </div>
        </div>
      ))}

      <Button onClick={create} loading={creating} variant={active.length ? 'secondary' : 'primary'} className="w-full">
        {active.length ? 'Create another link' : 'Create invite link'}
      </Button>
    </Card>
  );
}

function IconButton({
  label,
  onClick,
  busy,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={busy}
      className={`w-9 h-9 rounded-lg inline-flex items-center justify-center border border-[#E7DFD5] disabled:opacity-50 ${
        danger ? 'text-[#B3261E] hover:bg-[#FDECEA]' : 'text-[#6D7A77] hover:bg-[#F3EFE9]'
      }`}
    >
      {children}
    </button>
  );
}
