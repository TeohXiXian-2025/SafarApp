import { RefreshCw, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Registers the service worker and offers a reload when a new version is deployed. */
function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Installed apps can stay open for days — check for new deploys hourly.
      if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className="fixed z-50 left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+5rem)] md:bottom-6 w-[calc(100%-2rem)] max-w-sm bg-[#161C23] text-white rounded-2xl shadow-xl p-3 pl-4 flex items-center gap-3"
    >
      <span className="flex-1 text-sm">A new version of Safar is ready.</span>
      <button onClick={() => setNeedRefresh(false)} className="text-sm text-white/70 px-2 min-h-9">
        Later
      </button>
      <button
        onClick={() => void updateServiceWorker(true)}
        className="inline-flex items-center gap-1.5 bg-[#00685F] rounded-xl px-3 min-h-9 text-sm font-bold"
      >
        <RefreshCw className="w-4 h-4" /> Update
      </button>
    </div>
  );
}

/** Thin bar while the device has no connection. Firestore keeps serving cached trip data. */
function OfflineBar() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (online) return null;
  // In normal flow (not fixed) so it pushes the page down instead of covering the header.
  return (
    <div role="status" className="pt-[env(safe-area-inset-top)] bg-[#96590B] text-white text-xs font-semibold">
      <p className="flex items-center justify-center gap-1.5 px-4 py-1.5 text-center">
        <WifiOff className="w-3.5 h-3.5 shrink-0" /> You're offline — showing saved trip data. Changes need a connection.
      </p>
    </div>
  );
}

export function GlobalBanners() {
  return (
    <>
      <OfflineBar />
      <UpdateToast />
    </>
  );
}
