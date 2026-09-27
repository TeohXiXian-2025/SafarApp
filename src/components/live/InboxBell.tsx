// The 🔔 in the header: every alert (votes, splits, decisions, @mentions,
// timeline changes) also lands here, so laptops — where push pop-ups depend
// on the browser running in the background — still see them. Listened to
// live (a read only when an alert arrives — no polling); the tab title shows
// the unread count, and a desktop pop-up appears if the tab is in the
// background and notifications are allowed.
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useAuth } from '../../auth/auth';
import { paths } from '../../domain';
import { db } from '../../firebase/config';
import { api } from '../../lib/api';
import { useDoc, useQuery } from '../../lib/firestore';
import { timeAgo } from '../../lib/format';
import { cx } from '../../ui';

const Item = z.object({ title: z.string(), body: z.string(), url: z.string(), at: z.number() });
const State = z.object({ readAt: z.number().optional() });

export function InboxBell() {
  const uid = useAuth((s) => s.user?.uid);
  const live = useQuery(uid ? `inbox:${uid}` : null, () => query(collection(db, paths.inbox(uid!)), orderBy('at', 'desc'), limit(30)), Item);
  const state = useDoc(uid ? paths.inboxState(uid) : null, State);
  const items = live.data;
  // Marking read shows at once; the server's readAt then arrives on the listener.
  const [readLocal, setReadLocal] = useState(0);
  const readAt = Math.max(state.data?.readAt ?? 0, readLocal);
  const [open, setOpen] = useState(false);
  const newest = useRef(0);
  const navigate = useNavigate();

  // A background tab gets a desktop pop-up for anything new (no push needed).
  // The first answer from the server only sets the baseline.
  useEffect(() => {
    if (live.loading || live.fromCache) return;
    const top = Math.max(0, ...items.map((i) => i.at));
    if (!newest.current) {
      newest.current = Math.max(top, 1);
      return;
    }
    const fresh = items.filter((i) => i.at > Math.max(newest.current, readAt));
    newest.current = Math.max(newest.current, top);
    if (document.hidden && fresh.length && 'Notification' in window && Notification.permission === 'granted') {
      const n = fresh[0];
      try {
        new Notification(fresh.length > 1 ? `${n.title} (+${fresh.length - 1} more)` : n.title, { body: n.body, tag: `inbox-${n.at}`, icon: '/icons/icon-192.png' });
      } catch {
        /* some browsers only allow notifications from the service worker */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per snapshot
  }, [items, live.loading, live.fromCache]);

  const unread = items.filter((i) => i.at > readAt).length;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, '');
    document.title = unread ? `(${unread > 9 ? '9+' : unread}) ${base}` : base;
  }, [unread]);

  const toggle = () => {
    setOpen((o) => !o);
    if (!open && unread) {
      setReadLocal(Date.now());
      void api.post('inbox/read').catch(() => {});
    }
  };

  return (
    <div className="relative">
      <button type="button" onClick={toggle} aria-label={unread ? `${unread} new alerts` : 'Alerts'} aria-expanded={open} className="relative w-9 h-9 rounded-full hover:bg-black/5 inline-flex items-center justify-center text-[#3E4947]">
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-[#B3261E] text-white text-[10px] font-bold leading-4 text-center">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        // Phones: pinned to the screen edges under the header (the bell isn't at the far right, so
        // anchoring to it pushed the panel off the left edge). Larger screens: under the bell.
        <div
          className="fixed inset-x-3 top-[calc(3.5rem+env(safe-area-inset-top))] sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[22rem] max-h-[70dvh] overflow-y-auto overflow-x-hidden bg-white rounded-xl border border-[#E7DFD5] shadow-lg p-1.5 text-sm z-40"
          onMouseLeave={() => setOpen(false)}
        >
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#6D7A77]">Alerts</p>
          {items.length === 0 ? (
            <p className="px-2.5 py-3 text-[#6D7A77]">Nothing yet. Votes, split decisions, @mentions and plan changes show up here.</p>
          ) : (
            items.map((i, n) => (
              <button
                key={`${i.at}-${n}`}
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate(i.url);
                }}
                className={cx('w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#F3EFE9] block', i.at > readAt && 'bg-[#00685F]/5')}
              >
                <span className="block font-semibold text-[#161C23] break-words line-clamp-2">{i.title}</span>
                <span className="block text-xs text-[#3E4947] break-words line-clamp-3">{i.body}</span>
                <span className="block text-[11px] text-[#9AA5A3]">{timeAgo(i.at)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
