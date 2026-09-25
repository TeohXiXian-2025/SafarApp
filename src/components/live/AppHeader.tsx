import { Compass, Gauge, LayoutGrid, LogOut } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { signOut, useAuth } from '../../auth/auth';
import { Avatar } from '../../ui';
import { InboxBell } from './InboxBell';
import { isOwner } from './UsageCard';

/** Top bar for the live app: logo → My Trips, optional title, account menu. */
export function AppHeader({ children }: { children?: ReactNode }) {
  const user = useAuth((s) => s.user);
  const [menu, setMenu] = useState(false);
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    if (menu && user) void isOwner().then(setOwner);
  }, [menu, user]);
  const name = user?.displayName || user?.email || 'You';

  return (
    <header className="sticky top-0 z-30 bg-[#FAF8F5]/90 backdrop-blur border-b border-[#E7DFD5] pt-[env(safe-area-inset-top)]">
      <div className="max-w-5xl mx-auto h-14 px-4 flex items-center gap-3">
        <Link to="/trips" className="flex items-center gap-2 shrink-0" aria-label="My trips">
          <span className="w-8 h-8 rounded-xl bg-[#00685F] text-white flex items-center justify-center">
            <Compass className="w-4 h-4" />
          </span>
          <span className="font-extrabold text-[#161C23] hidden sm:inline">Safar</span>
        </Link>
        <div className="flex-1 min-w-0">{children}</div>
        {user && <InboxBell />}
        {user && (
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} className="rounded-full" aria-label="Account menu" aria-expanded={menu}>
              <Avatar name={name} photoURL={user.photoURL ?? undefined} size={34} />
            </button>
            {menu && (
              <div
                className="absolute right-0 mt-2 w-60 bg-white rounded-xl border border-[#E7DFD5] shadow-lg p-2 text-sm"
                onMouseLeave={() => setMenu(false)}
              >
                <div className="px-2.5 py-2">
                  <p className="font-bold text-[#161C23] truncate">{user.displayName || 'Signed in'}</p>
                  <p className="text-xs text-[#6D7A77] truncate">{user.email}</p>
                </div>
                <Link
                  to="/trips"
                  onClick={() => setMenu(false)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[#161C23] hover:bg-[#F3EFE9]"
                >
                  <LayoutGrid className="w-4 h-4" /> My trips
                </Link>
                {owner && (
                  <Link
                    to="/usage"
                    onClick={() => setMenu(false)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[#161C23] hover:bg-[#F3EFE9]"
                  >
                    <Gauge className="w-4 h-4" /> Service usage
                  </Link>
                )}
                <button
                  onClick={() => void signOut()}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[#B3261E] hover:bg-[#FDECEA]"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
