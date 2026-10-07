const RESET_KEY = 'safar:demo-cache-reset:guide-v2';

const isDemoKey = (key: string) => key.startsWith('safar:') && /:demo_[A-Za-z0-9_-]+$/.test(key);

export function resetDemoCacheOnce(local: Storage, session: Storage): boolean {
  if (local.getItem(RESET_KEY) === '1') return false;

  for (const storage of [local, session]) {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => !!key && isDemoKey(key));
    keys.forEach((key) => storage.removeItem(key));
  }

  local.setItem(RESET_KEY, '1');
  return true;
}
