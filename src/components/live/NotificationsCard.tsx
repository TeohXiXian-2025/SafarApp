// Notifications: on/off for this device, a test alert, and which kinds to get
// (saved per person, for all trips). Compact mode is the Overview nudge.
import { Bell, BellOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NOTIFY_KINDS, type NotifyKind, type NotifyPrefs } from '../../domain';
import { api, ApiError } from '../../lib/api';
import { disablePush, enablePush, pushState, type PushState } from '../../lib/push';
import { Button, Card, ErrorBanner, Toggle } from '../../ui';

const STATE_TEXT: Record<PushState, string> = {
  on: 'On for this device.',
  off: 'Off on this device.',
  denied: 'Blocked in your browser settings — allow notifications for this site, then try again.',
  unsupported: "This browser can't show notifications.",
  install: 'On iPhone/iPad: tap Share → Add to Home Screen, open Safar from there, then turn notifications on.',
  unavailable: 'Not available here (they work in the installed app or the live site).',
};

const DISMISS_KEY = 'safar:notify-nudge-dismissed';

export function NotificationsCard({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    void pushState().then(setState);
    if (!compact) void api.get<{ prefs: NotifyPrefs }>('push/prefs').then((r) => setPrefs(r.prefs)).catch(() => {});
  }, [compact]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError('');
    setNote('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message || 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };
  const turnOn = () => run('on', async () => setState(await enablePush()));
  const turnOff = () => run('off', async () => setState(await disablePush()));
  const test = () =>
    run('test', async () => {
      const r = await api.post<{ sent: number }>('push/test');
      setNote(r.sent ? `Sent to ${r.sent} device${r.sent > 1 ? 's' : ''} — check your notifications.` : 'No devices subscribed yet.');
    });
  const setPref = (k: NotifyKind, v: boolean) =>
    run(k, async () => {
      setPrefs((p) => (p ? { ...p, [k]: v } : p));
      const r = await api.post<{ prefs: NotifyPrefs }>('push/prefs', { prefs: { [k]: v } });
      setPrefs(r.prefs);
    });

  if (compact) {
    if (dismissed || !state || state === 'on' || state === 'denied' || state === 'unsupported' || state === 'unavailable') return null;
    return (
      <Card className="p-4 flex items-start gap-3">
        <Bell className="w-5 h-5 text-[#00685F] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-2">
          <p className="font-semibold text-[#161C23]">Don't miss votes and split decisions</p>
          <p className="text-sm text-[#6D7A77]">{state === 'install' ? STATE_TEXT.install : 'Get a notification when a vote needs you, votes split, or the plan changes.'}</p>
          <div className="flex gap-2">
            {state === 'off' && (
              <Button className="min-h-9" loading={busy === 'on'} onClick={turnOn}>
                Turn on
              </Button>
            )}
            <Button
              variant="ghost"
              className="min-h-9"
              onClick={() => {
                try {
                  localStorage.setItem(DISMISS_KEY, '1');
                } catch {
                  /* private mode */
                }
                setDismissed(true);
              }}
            >
              Not now
            </Button>
          </div>
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start gap-3">
        {state === 'on' ? <Bell className="w-5 h-5 text-[#00685F] mt-0.5" /> : <BellOff className="w-5 h-5 text-[#6D7A77] mt-0.5" />}
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-[#161C23]">Notifications</h2>
          <p className="text-sm text-[#6D7A77]">{state ? STATE_TEXT[state] : 'Checking…'}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {state === 'off' && (
          <Button loading={busy === 'on'} onClick={turnOn}>
            Turn on for this device
          </Button>
        )}
        {state === 'on' && (
          <>
            <Button variant="secondary" loading={busy === 'test'} onClick={test}>
              Send a test
            </Button>
            <Button variant="ghost" loading={busy === 'off'} onClick={turnOff}>
              Turn off here
            </Button>
          </>
        )}
      </div>
      {note && <p className="text-sm text-[#0B6B45]">{note}</p>}
      {prefs && (
        <div className="space-y-3 border-t border-[#E7DFD5] pt-4">
          <p className="text-xs text-[#6D7A77]">Applies to all your trips and devices. Non-urgent ones wait until 8 AM (trip time) if they happen overnight.</p>
          {(Object.keys(NOTIFY_KINDS) as NotifyKind[]).map((k) => (
            <Toggle key={k} checked={prefs[k]} onChange={(v) => setPref(k, v)} label={NOTIFY_KINDS[k].label} hint={NOTIFY_KINDS[k].hint} />
          ))}
        </div>
      )}
      <ErrorBanner>{error}</ErrorBanner>
    </Card>
  );
}
