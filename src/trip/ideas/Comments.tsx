// Comments on an idea card — collapsed to a count, live for everyone.
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { IdeaComment, paths, type Idea } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { useQuery } from '../../lib/firestore';
import { timeAgo } from '../../lib/format';
import { Avatar, ErrorBanner, Input } from '../../ui';
import { useTrip } from '../TripLayout';

export function Comments({ idea }: { idea: Idea }) {
  const { trip, members, me, isAdmin } = useTrip();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const comments = useQuery(`comments:${trip.id}:${idea.id}`, () => paths.comments(trip.id, idea.id), IdeaComment);
  const list = [...comments.data].sort((a, b) => a.at - b.at);
  const byUid = new Map(members.map((m) => [m.uid, m]));
  const q = { tripId: trip.id };

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.post('ideas/comment', { ideaId: idea.id, text: text.trim() }, q);
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
                <p className="text-[#161C23] break-words">{c.text}</p>
              </div>
              {(c.uid === me.uid || isAdmin) && (
                <button type="button" aria-label="Delete comment" className="text-[#9AA5A3] hover:text-[#B3261E]" onClick={() => api.post('ideas/comment-delete', { ideaId: idea.id, commentId: c.id }, q).catch(() => {})}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Input value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Write a comment…" className="min-h-9 text-sm" />
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
