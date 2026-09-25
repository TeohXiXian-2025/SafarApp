// The two questions a vote can raise:
//   👎 → why? (a reason chip, or typed text) — shapes the middle grounds offered
//   👍 despite a conflict → "Still want to go?" with a reason; the staff phone
//     check sits right here so halal can be confirmed before committing.
import { MessageCircle, Phone } from 'lucide-react';
import { useState } from 'react';
import { VOTE_REASONS, type Conflict, type Idea, type VoteReasonTag } from '../../domain';
import { Button, Chip, ErrorBanner, Field, Input, Sheet } from '../../ui';

export function DownVoteSheet({
  idea,
  defaultTag,
  onClose,
  onVote,
}: {
  idea: Idea;
  defaultTag?: VoteReasonTag;
  onClose: () => void;
  onVote: (tag: VoteReasonTag, reason?: string) => Promise<void>;
}) {
  const [tag, setTag] = useState<VoteReasonTag | null>(defaultTag ?? null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const needText = tag === 'other' && !text.trim();
  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await onVote(tag!, text.trim() || undefined);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`Why not ${idea.place.name}?`}>
      <div className="space-y-4">
        <p className="text-sm text-[#6D7A77]">If others still want to go, you'll get a few middle grounds to pick from — your reason decides which.</p>
        <Field label="Reason" group>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(VOTE_REASONS) as VoteReasonTag[]).map((k) => (
              <Chip key={k} selected={tag === k} onClick={() => setTag(k)}>
                {VOTE_REASONS[k]}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label={tag === 'other' ? 'Tell the group why' : 'Anything to add? (optional)'}>
          <Input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="e.g. RM 98 for the skybridge is a lot" />
        </Field>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <Button className="w-full" variant="danger" disabled={!tag || needText} loading={busy} onClick={send}>
          Vote 👎
        </Button>
      </div>
    </Sheet>
  );
}

const GO_REASONS = ["I called — they're halal", "I'll only have drinks / eat elsewhere", "I'll pray before or after", "It's fine for me"];

export function ConfirmGoSheet({
  idea,
  conflicts,
  again,
  onClose,
  onConfirm,
  onDecline,
}: {
  idea: Idea;
  conflicts: Conflict[];
  /** Asked again because the conflict changed after voting. */
  again?: boolean;
  onClose: () => void;
  onConfirm: (text: string) => Promise<void>;
  onDecline: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const phone = idea.place.category === 'food' ? idea.place.phone : undefined;
  const reason = [picked, text.trim()].filter(Boolean).join(' — ');
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm(reason);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={again ? 'Something changed — still going?' : `Still want to go to ${idea.place.name}?`}>
      <div className="space-y-4">
        <ul className="rounded-xl border border-[#F0C987] bg-[#FDF3E1] p-3 space-y-1 text-sm text-[#7A4A06]">
          {conflicts.map((c) => (
            <li key={c.kind + c.detail}>
              {c.severity === 'blocker' ? '⛔' : '⚠️'} {c.detail}
            </li>
          ))}
        </ul>
        {phone && (
          <div className="rounded-xl border border-[#E7DFD5] bg-white p-3 space-y-1.5">
            <p className="text-sm font-semibold text-[#161C23]">Check with the restaurant first</p>
            <p className="text-xs text-[#6D7A77]">Ask if the kitchen is halal-certified and if pork or alcohol is used.</p>
            <div className="flex flex-wrap gap-3 text-sm">
              <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 font-bold text-[#00685F]">
                <Phone className="w-4 h-4" /> {phone}
              </a>
              <a href={`https://wa.me/${phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-[#00685F]">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            </div>
          </div>
        )}
        <Field label="Why it's OK for you" group>
          <div className="flex flex-wrap gap-2">
            {GO_REASONS.map((r) => (
              <Chip key={r} selected={picked === r} onClick={() => setPicked(picked === r ? null : r)}>
                {r}
              </Chip>
            ))}
          </div>
        </Field>
        <Input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Or type your own reason" />
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="secondary" className="flex-1" onClick={onDecline} disabled={busy}>
            No — I'd rather not go
          </Button>
          <Button className="flex-1" disabled={reason.length < 2} loading={busy} onClick={confirm}>
            Yes, I'll go
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
