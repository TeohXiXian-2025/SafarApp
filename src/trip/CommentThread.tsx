// A comment thread (ideas, hotels) — collapsed to a count, live for everyone.
// Type "@" to tag someone: they get a notification.
import { AtSign, MessageSquare, Send, Trash2 } from 'lucide-react';
import { Fragment, useRef, useState } from 'react';
import { Comment, type Member } from '../domain';
import { ApiError } from '../lib/api';
import { useQuery } from '../lib/firestore';
import { timeAgo } from '../lib/format';
import { Avatar, cx, ErrorBanner, Input } from '../ui';
import { useTrip } from './TripLayout';

/** The "@partial" being typed at the end of the text, if any. */
const typingMention = (text: string) => /(?:^|\s)@([^\s@]{0,30})$/.exec(text)?.[1];

/** Comment text with @Name tags highlighted. */
function Rendered({ text, tagged }: { text: string; tagged: Member[] }) {
  const names = tagged.map((m) => m.displayName).sort((a, b) => b.length - a.length);
  if (!names.length) return <>{text}</>;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(@(?:${names.map(esc).join('|')}))`, 'g'));
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('@') && names.includes(p.slice(1)) ? (
          <b key={i} className="text-[#00685F] font-semibold">
            {p}
          </b>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export function CommentThread({
  queryKey,
  path,
  onSend,
  onDelete,
  startOpen = false,
}: {
  queryKey: string;
  path: string;
  onSend: (text: string, mentions: string[]) => Promise<unknown>;
  onDelete: (commentId: string) => Promise<unknown>;
  startOpen?: boolean;
}) {
  const { members, me, isAdmin } = useTrip();
  const [open, setOpen] = useState(startOpen);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const comments = useQuery(queryKey, () => path, Comment);
  const list = [...comments.data].sort((a, b) => a.at - b.at);
  const byUid = new Map(members.map((m) => [m.uid, m]));

  const partial = typingMention(text);
  const suggestions =
    partial === undefined ? [] : members.filter((m) => m.uid !== me.uid && m.displayName.toLowerCase().startsWith(partial.toLowerCase())).slice(0, 6);
  const tag = (m: Member) => {
    setText((t) => `${t.replace(/@[^\s@]*$/, '')}@${m.displayName} `);
    input.current?.focus();
  };
  // Whoever is still tagged in the text when it's sent.
  const mentioned = () => members.filter((m) => m.uid !== me.uid && text.includes(`@${m.displayName}`)).map((m) => m.uid);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onSend(text.trim(), mentioned());
      setText('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not post');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="text-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6D7A77]" aria-expanded={open}>
        <MessageSquare className="w-3.5 h-3.5" /> {list.length ? `${list.length} comment${list.length > 1 ? 's' : ''}` : 'Comment'}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {list.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar name={byUid.get(c.uid)?.displayName ?? '?'} photoURL={byUid.get(c.uid)?.photoURL} size={22} />
              <div className="flex-1 min-w-0">
                <p className="text-xs">
                  <b className="text-[#161C23]">{byUid.get(c.uid)?.displayName ?? 'Former member'}</b> <span className="text-[#9AA5A3]">{timeAgo(c.at)}</span>
                </p>
                <p className="text-[#161C23] break-words">
                  <Rendered text={c.text} tagged={c.mentions.flatMap((u) => byUid.get(u) ?? [])} />
                </p>
              </div>
              {(c.uid === me.uid || isAdmin) && (
                <button type="button" aria-label="Delete comment" className="text-[#9AA5A3] hover:text-[#B3261E]" onClick={() => void onDelete(c.id).catch(() => {})}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          {!!suggestions.length && (
            <div className="flex flex-wrap gap-1.5" role="listbox" aria-label="Tag someone">
              {suggestions.map((m) => (
                <button
                  key={m.uid}
                  type="button"
                  onClick={() => tag(m)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E7DFD5] bg-white pl-1 pr-2.5 py-0.5 text-xs font-semibold text-[#161C23] hover:border-[#00685F]/50"
                >
                  <Avatar name={m.displayName} photoURL={m.photoURL} size={18} /> {m.displayName}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Input ref={input} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Write a comment… type @ to tag someone" className="min-h-9 text-sm" />
            <button
              type="button"
              aria-label="Tag someone"
              onClick={() => (setText((t) => (t && !t.endsWith(' ') ? `${t} @` : `${t}@`)), input.current?.focus())}
              className={cx('shrink-0 w-9 h-9 rounded-xl border border-[#E7DFD5] bg-white text-[#6D7A77] inline-flex items-center justify-center', partial !== undefined && 'text-[#00685F] border-[#00685F]/40')}
            >
              <AtSign className="w-4 h-4" />
            </button>
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="shrink-0 w-9 h-9 rounded-xl bg-[#00685F] text-white inline-flex items-center justify-center disabled:opacity-50">
              <Send className="w-4 h-4" />
            </button>
          </form>
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}
    </div>
  );
}
