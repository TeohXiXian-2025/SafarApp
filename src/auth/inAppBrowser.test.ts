import { describe, expect, it } from 'vitest';
import { detectInAppBrowser, openInChromeUrl } from './inAppBrowser';

const UA = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  whatsappAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 WhatsApp/2.24.18.80',
  instagramIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0.28.93 (iPhone15,2; iOS 17_6; en_US)',
  facebookAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-A536E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/475.0.0.34.109;]',
  genericIosWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
};

describe('detectInAppBrowser', () => {
  it('flags app browsers', () => {
    expect(detectInAppBrowser(UA.whatsappAndroid)).toEqual({ app: 'WhatsApp', platform: 'android' });
    expect(detectInAppBrowser(UA.instagramIos)).toEqual({ app: 'Instagram', platform: 'ios' });
    expect(detectInAppBrowser(UA.facebookAndroid)).toEqual({ app: 'Facebook', platform: 'android' });
    expect(detectInAppBrowser(UA.genericIosWebView)).toEqual({ app: null, platform: 'ios' });
  });
  it('leaves real browsers alone', () => {
    for (const ua of [UA.chromeAndroid, UA.safariIos, UA.chromeIos, UA.desktopChrome]) expect(detectInAppBrowser(ua)).toBeNull();
  });
});

describe('openInChromeUrl', () => {
  it('builds an Android intent that keeps the path and query', () => {
    const u = openInChromeUrl('https://example.app/login?next=%2Fjoin%2Fabc');
    expect(u).toMatch(/^intent:\/\/example\.app\/login\?next=%2Fjoin%2Fabc#Intent;scheme=https;package=com\.android\.chrome;/);
    expect(u).toContain('S.browser_fallback_url=https%3A%2F%2Fexample.app');
  });
});
