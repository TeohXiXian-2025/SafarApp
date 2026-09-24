// Public-facing app settings (not secrets).

/** Shown on the privacy policy / terms and in the OAuth consent screen. */
export const APP_NAME = 'Safar';
export const CONTACT_EMAIL = 'xixianteoh@gmail.com';
export const LEGAL_UPDATED = '24 September 2026';

/** The address people should use and share. Invite links always point here. */
export const PUBLIC_ORIGIN = 'https://safar-app-cristal-teohs-projects.vercel.app';

/**
 * Hosts where Google sign-in runs through our own domain (Vercel proxies
 * /__/auth/* to Firebase), so Google's screen says "continue to <this host>"
 * and sign-in works inside the installed iPhone app.
 *
 * ONLY list a host after `https://<host>/__/auth/handler` is added to the OAuth
 * client's "Authorized redirect URIs" (Google Cloud → Credentials) — otherwise
 * Google rejects sign-in with redirect_uri_mismatch. Other hosts fall back to
 * <project>.firebaseapp.com, which always works in normal browsers.
 */
export const SAME_ORIGIN_AUTH_HOSTS: string[] = ['safar-app-cristal-teohs-projects.vercel.app'];

/** Link to share for a path, e.g. invite links. Local dev keeps localhost so links are testable. */
export const shareUrl = (path: string) => `${import.meta.env.DEV ? window.location.origin : PUBLIC_ORIGIN}${path}`;
