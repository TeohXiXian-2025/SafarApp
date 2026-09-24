// Install ("Add to Home Screen") state. `beforeinstallprompt` fires once,
// early, on Chromium browsers (Android, desktop Chrome/Edge) — capture it at
// module load so the Install button can use it later. iOS has no install API,
// so there we show instructions instead.
import { create } from 'zustand';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac; touch support gives it away.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

interface InstallState {
  deferred: BeforeInstallPromptEvent | null;
  installed: boolean;
}

export const useInstall = create<InstallState>(() => ({ deferred: null, installed: isStandalone() }));

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // we show our own button instead of the mini-infobar
  useInstall.setState({ deferred: e as BeforeInstallPromptEvent });
});
window.addEventListener('appinstalled', () => useInstall.setState({ deferred: null, installed: true }));

/** Shows the native install dialog (Chromium only). Returns true if installed. */
export async function promptInstall(): Promise<boolean> {
  const { deferred } = useInstall.getState();
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  useInstall.setState({ deferred: null });
  return outcome === 'accepted';
}

/** localStorage can throw (private mode, blocked storage) — never let that break the UI. */
export const prefs = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};
