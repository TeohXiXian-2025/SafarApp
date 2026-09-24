import { Download, Share, SquarePlus, X } from 'lucide-react';
import { useState } from 'react';
import { Button, Card } from '../ui';
import { isIOS, isMobileDevice, prefs, promptInstall, useInstall } from './pwa';

const DISMISS_KEY = 'safar:install-dismissed-at';
const SNOOZE_MS = 14 * 86_400_000; // ask again after two weeks

/**
 * "Install Safar" card. Android/desktop Chromium: one-tap native prompt.
 * iOS Safari: step-by-step "Share → Add to Home Screen" instructions.
 * Hidden once installed or recently dismissed.
 */
export function InstallBanner() {
  const { deferred, installed } = useInstall();
  const [dismissed, setDismissed] = useState(() => Date.now() - Number(prefs.get(DISMISS_KEY) ?? 0) < SNOOZE_MS);
  const ios = isIOS();

  // Laptops/desktops: never offer install.
  if (!isMobileDevice() || installed || dismissed || (!deferred && !ios)) return null;

  const dismiss = () => {
    prefs.set(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  return (
    <Card className="p-4 flex gap-3 items-start border-[#00685F]/30 bg-[#00685F]/5">
      <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div>
          <p className="font-bold text-[#161C23]">Install Safar on your phone</p>
          <p className="text-sm text-[#6D7A77]">Opens full-screen from your home screen and works without signal.</p>
        </div>
        {deferred ? (
          <Button className="min-h-9" onClick={() => void promptInstall()}>
            <Download className="w-4 h-4" /> Install app
          </Button>
        ) : (
          <ol className="text-sm text-[#161C23] space-y-1 leading-6">
            <li>
              1. Tap <Share className="inline w-4 h-4 -mt-1 text-[#2B6CB0]" aria-label="Share" /> <b>Share</b> in Safari's toolbar
            </li>
            <li>
              2. Choose <SquarePlus className="inline w-4 h-4 -mt-1" aria-hidden /> <b>Add to Home Screen</b>
            </li>
          </ol>
        )}
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="w-8 h-8 -mr-1 -mt-1 rounded-full text-[#6D7A77] hover:bg-black/5 inline-flex items-center justify-center">
        <X className="w-4 h-4" />
      </button>
    </Card>
  );
}
