import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { create } from 'zustand';
import { paths, type UserProfile } from '../domain';
import { PUBLIC_ORIGIN } from '../config';
import { auth, db, isStandaloneApp, useSameOriginAuth } from '../firebase/config';
import { isMobileDevice } from '../pwa/pwa';

interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: User | null;
}

export const useAuth = create<AuthState>(() => ({ status: 'loading', user: null }));

/** Creates users/{uid} the first time someone signs in. */
async function ensureProfile(user: User) {
  const ref = doc(db, paths.user(user.uid));
  const snap = await getDoc(ref).catch(() => null);
  if (snap?.exists()) return;
  const profile: UserProfile = {
    uid: user.uid,
    displayName: (user.displayName || user.email?.split('@')[0] || 'Traveller').slice(0, 100),
    createdAt: Date.now(),
    ...(user.email ? { email: user.email } : {}),
    ...(user.photoURL ? { photoURL: user.photoURL } : {}),
  };
  await setDoc(ref, profile).catch((e) => console.warn('[Safar] could not create profile', e));
}

onAuthStateChanged(auth, (user) => {
  // The prototype (/demo) used anonymous sessions; the live app requires a real account.
  if (user?.isAnonymous) {
    void fbSignOut(auth);
    return;
  }
  useAuth.setState({ status: user ? 'signedIn' : 'signedOut', user });
  if (user) void ensureProfile(user);
});

/**
 * Google sign-in.
 * - Phones / installed app on a same-origin host: full-page redirect in the
 *   same tab. On phones a "popup" is really another tab; tapping Google's
 *   Privacy/Terms links opens a third, and closing it drops people back on
 *   our tab with the popup lost behind it (endless spinner).
 * - Laptops: popup window.
 * - Never redirect through <project>.firebaseapp.com: modern browsers block
 *   the cross-site storage it needs, which caused a sign-in loop.
 * Same-origin hosts are listed in SAME_ORIGIN_AUTH_HOSTS (src/config.ts).
 */
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (useSameOriginAuth && (isStandaloneApp || isMobileDevice())) {
    await signInWithRedirect(auth, provider);
    return;
  }
  try {
    await signInWithPopup(auth, provider);
  } catch (err: any) {
    const blocked = err?.code === 'auth/popup-blocked' || err?.code === 'auth/operation-not-supported-in-this-environment';
    if (blocked && useSameOriginAuth) {
      await signInWithRedirect(auth, provider);
      return;
    }
    if (blocked) throw Object.assign(new Error('popup blocked'), { code: 'safar/popup-blocked' });
    throw err;
  }
}

export async function signInWithEmail(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(name: string, email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  // onAuthStateChanged fired before updateProfile — write the profile with the real name now.
  await ensureProfile(Object.assign(cred.user, { displayName: name }));
  void sendEmailVerification(cred.user).catch(() => {});
}

/** Surfaces an error from a finished redirect sign-in (e.g. account disabled). */
export const checkRedirectResult = () => getRedirectResult(auth);

// After resetting, the "Continue" button brings people back to our login page.
export const resetPassword = (email: string) =>
  sendPasswordResetEmail(auth, email, { url: `${import.meta.env.DEV ? window.location.origin : PUBLIC_ORIGIN}/login` });
export const signOut = () => fbSignOut(auth);

/** Maps Firebase auth error codes to messages people understand. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/email-already-in-use': 'An account with this email already exists — sign in instead.',
    'auth/weak-password': 'Use a password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'safar/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for this site, or sign in with email.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled.',
    'auth/network-request-failed': "You're offline. Check your connection and try again.",
    'auth/unauthorized-domain': 'This domain is not authorised for sign-in (Firebase console → Authentication → Settings).',
  };
  return messages[code] ?? 'Something went wrong. Please try again.';
}
