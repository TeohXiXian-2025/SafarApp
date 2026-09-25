// The 🔔 in the header: every alert (votes, splits, decisions, @mentions,
// timeline changes) also lands here, so laptops — where push pop-ups depend
// on the browser running in the background — still see them. Checked every
// minute while the app is open; the tab title shows the unread count, and a
// desktop pop-up appears if the tab is in the background and notifications
// are allowed.
import { Bell } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { cx } from '../../ui';

interface Item {
  id: string;
  title: string;
  body: string;
  url: string;
  at: number;
}

const POLL_MS = 60_000;

export function InboxBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [readAt, setReadAt] = useState(0);
  const [open, setOpen] = useState(false);
  const newest = useRef(0);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    if (!navigator.onLine) return;
    const r = await api.get<{ items: Item[]; readAt: number }>('inbox').catch(() => null);
    if (!r) return;
    // A background tab gets a desktop pop-up for anything new (no push needed).
    const fresh = r.items.filter((i) => i.at > Math.max(newest.current, r.readAt));
    if (newest.current && document.hidden && fresh.length && 'Notification' in window && Notification.permission === 'granted') {
      const n = fresh[0];
      try {
        new Notification(fresh.length > 1 ? `${n.title} (+${fresh.length - 1} more)` : n.title, { body: n.body, tag: `inbox-${n.id}`, icon: '/icons/icon-192.png' });
      } catch {
        /* some browsers only allow notifications from the service worker */
      }
    }
    newest.current = Math.max(newest.current, ...r.items.map((i) => i.at), 1);
    setItems(r.items);
    setReadAt(r.readAt);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const unread = items.filter((i) => i.at > readAt).length;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, '');
    document.title = unread ? `(${unread > 9 ? '9+' : unread}) ${base}` : base;
  }, [unread]);

  const toggle = () => {
    setOpen((o) => !o);
    if (!open && unread) {
      setReadAt(Date.now());
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
        <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] max-h-[70dvh] overflow-y-auto bg-white rounded-xl border border-[#E7DFD5] shadow-lg p-1.5 text-sm z-40" onMouseLeave={() => setOpen(false)}>
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#6D7A77]">Alerts</p>
          {items.length === 0 ? (
            <p className="px-2.5 py-3 text-[#6D7A77]">Nothing yet. Votes, split decisions, @mentions and plan changes show up here.</p>
          ) : (
            items.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate(i.url);
                }}
                className={cx('w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#F3EFE9] block', i.at > readAt && 'bg-[#00685F]/5')}
              >
                <span className="block font-semibold text-[#161C23]">{i.title}</span>
                <span className="block text-xs text-[#3E4947] line-clamp-2">{i.body}</span>
                <span className="block text-[11px] text-[#9AA5A3]">{timeAgo(i.at)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
