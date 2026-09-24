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
import { auth, db, isStandaloneApp, useSameOriginAuth } from '../firebase/config';

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
 * A full-page redirect only works when auth runs on OUR domain (see
 * SAME_ORIGIN_AUTH_HOSTS in src/config.ts): through <project>.firebaseapp.com,
 * modern Chrome/Safari block the cross-site storage the redirect result needs,
 * so the user "signs in" and lands back on the login page in a loop.
 * So: popup everywhere (works in browsers and the Android installed app), and
 * redirect only on same-origin hosts.
 */
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (useSameOriginAuth && isStandaloneApp) {
    // Installed app on a registered host: redirect is reliable here.
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

export const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);
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
