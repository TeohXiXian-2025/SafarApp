import { Check, Copy, ExternalLink, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui';
import { openInChromeUrl, type InAppBrowser } from './inAppBrowser';

/** Explains why Google sign-in won't work here and how to open a real browser. */
export function InAppBrowserNotice({ browser }: { browser: InAppBrowser }) {
  const [copied, setCopied] = useState(false);
  const where = browser.app ? `${browser.app}'s built-in browser` : "this app's built-in browser";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copy this link and open it in your browser:', window.location.href);
    }
  };

  return (
    <div role="alert" className="rounded-2xl border border-[#F0C987] bg-[#FDF3E1] p-4 space-y-3">
      <div>
        <p className="font-bold text-[#161C23]">Open Safar in your browser to use Google sign-in</p>
        <p className="text-sm text-[#6D7A77] mt-1">
          You're in {where}. Google blocks sign-in here for security — this isn't a problem with your account.
        </p>
      </div>

      {browser.platform === 'android' ? (
        <a href={openInChromeUrl()} className="block">
          <Button className="w-full">
            <ExternalLink className="w-4 h-4" /> Open in Chrome
          </Button>
        </a>
      ) : (
        <ol className="text-sm text-[#161C23] space-y-1 leading-6">
          <li>
            1. Tap <MoreHorizontal className="inline w-4 h-4 -mt-0.5" aria-label="the menu" /> or the share icon in this screen's corner
          </li>
          <li>
            2. Choose <b>Open in Safari</b> (or <b>Open in browser</b>)
          </li>
        </ol>
      )}

      <Button variant="secondary" className="w-full" onClick={copy}>
        {copied ? <Check className="w-4 h-4 text-[#00685F]" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Link copied — paste it in your browser' : 'Copy link'}
      </Button>
      <p className="text-xs text-[#6D7A77]">Or sign in with email and password below — that works here.</p>
    </div>
  );
}
