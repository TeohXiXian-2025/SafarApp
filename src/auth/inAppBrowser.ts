// Google blocks OAuth sign-in inside apps' built-in browsers
// ("Error 403: disallowed_useragent"). Invite links are usually opened from
// WhatsApp/Instagram/etc., so detect those and send people to a real browser.

const APPS: [RegExp, string][] = [
  [/WhatsApp/i, 'WhatsApp'],
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, 'Facebook'],
  [/Messenger|MessengerForiOS/i, 'Messenger'],
  [/musical_ly|BytedanceWebview|TikTok|trill/i, 'TikTok'],
  [/\bLine\//i, 'LINE'],
  [/MicroMessenger/i, 'WeChat'],
  [/Snapchat/i, 'Snapchat'],
  [/Twitter|X-Twitter/i, 'X'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/Telegram/i, 'Telegram'],
  [/XiaoHongShu|discover\//i, 'Xiaohongshu'],
];

export interface InAppBrowser {
  app: string | null; // null = some unknown app's web view
  platform: 'android' | 'ios';
}

export function detectInAppBrowser(ua = navigator.userAgent): InAppBrowser | null {
  const android = /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua);
  if (!android && !ios) return null;
  const platform = android ? 'android' : 'ios';

  for (const [re, app] of APPS) if (re.test(ua)) return { app, platform };

  // Generic web views: Android marks them "; wv)"; iOS WKWebViews lack the
  // "Safari/" token that Safari, Chrome (CriOS) and Firefox (FxiOS) send.
  if (android && /; wv\)/.test(ua)) return { app: null, platform };
  if (ios && /AppleWebKit/.test(ua) && !/Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)) return { app: null, platform };
  return null;
}

/** Android: an intent link that reopens the current page in Chrome. */
export function openInChromeUrl(href = window.location.href): string {
  const url = new URL(href);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}
