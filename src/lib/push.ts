// Turning push notifications on/off for this device (Web Push via the app's
// service worker). iPhone/iPad only support it once Safar is installed to the
// Home Screen (iOS 16.4+).
import { api } from './api';

export type PushState = 'on' | 'off' | 'denied' | 'unsupported' | 'install' | 'unavailable';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** The service worker, or null if none is running (e.g. local dev). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg?.active) return reg;
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !standalone() ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  if (!reg) return 'unavailable';
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

const toKey = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const deviceName = () => {
  const ua = navigator.userAgent;
  const os = /android/i.test(ua) ? 'Android' : isIos() ? 'iPhone' : /mac/i.test(ua) ? 'Mac' : /windows/i.test(ua) ? 'Windows' : 'Device';
  const browser = /edg/i.test(ua) ? 'Edge' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Browser';
  return `${os} · ${browser}`;
};

export async function enablePush(): Promise<PushState> {
  const state = await pushState();
  if (state === 'install' || state === 'unsupported' || state === 'unavailable') return state;
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const reg = await registration();
  if (!reg) return 'unavailable';
  const { key } = await api.get<{ key: string | null }>('push/key');
  if (!key) return 'unavailable';
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
  await api.post('push/subscribe', { subscription: sub.toJSON(), device: deviceName() });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.post('push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  return 'off';
}
