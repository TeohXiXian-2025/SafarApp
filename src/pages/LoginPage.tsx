import { Compass } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import {
  authErrorMessage,
  checkRedirectResult,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  useAuth,
} from '../auth/auth';
import { detectInAppBrowser } from '../auth/inAppBrowser';
import { InAppBrowserNotice } from '../auth/InAppBrowserNotice';
import { Button, Card, ErrorBanner, Field, Input, Spinner } from '../ui';
import { CONTACT_EMAIL } from '../config';

type Mode = 'signIn' | 'signUp' | 'reset';

/** Only allow same-site relative redirects after login. */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/trips';
}

export function LoginPage() {
  const status = useAuth((s) => s.status);
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  const [mode, setMode] = useState<Mode>(() => (next.startsWith('/join/') ? 'signUp' : 'signIn'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'google' | 'email' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [inApp] = useState(detectInAppBrowser);

  useEffect(() => {
    checkRedirectResult().catch((err) => setError(authErrorMessage(err)));
  }, []);

  if (status === 'loading') return <Spinner />;
  if (status === 'signedIn') return <Navigate to={next} replace />;

  const run = async (kind: 'google' | 'email', fn: () => Promise<unknown>) => {
    setBusy(kind);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (err) {
      // A newer Google attempt replaced an older popup — not an error for the user.
      if ((err as { code?: string })?.code === 'auth/cancelled-popup-request') return;
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'reset') {
      return run('email', async () => {
        await resetPassword(email);
        setNotice("If an account exists for that email, a reset link is on its way. It can take a minute — check your Spam or Promotions folder too, and mark it \"Not spam\" so the next one lands in your inbox.");
      });
    }
    return run('email', () => (mode === 'signUp' ? signUpWithEmail(name.trim(), email, password) : signInWithEmail(email, password)));
  };

  const title = { signIn: 'Welcome back', signUp: 'Create your account', reset: 'Reset your password' }[mode];

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-10 bg-[#FAF8F5]">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[#00685F] text-white flex items-center justify-center">
            <Compass className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#161C23]">Safar</h1>
          <p className="text-sm text-[#6D7A77]">Group trips that respect halal food and prayer times.</p>
        </div>

        <Card className="p-5 space-y-4">
          <h2 className="text-lg font-bold text-[#161C23]">{title}</h2>
          {next.startsWith('/join/') && (
            <p className="-mt-2 text-sm text-[#00685F] font-semibold">You've been invited to a trip — sign in or create an account to join.</p>
          )}

          {inApp && mode !== 'reset' && <InAppBrowserNotice browser={inApp} />}

          {mode !== 'reset' && !inApp && (
            <>
              <Button variant="secondary" className="w-full" loading={busy === 'google'} onClick={() => run('google', signInWithGoogle)}>
                <GoogleIcon /> Continue with Google
              </Button>
              {busy === 'google' && (
                // A popup can end up behind other windows/tabs — never leave people stuck on a spinner.
                <p className="-mt-2 text-xs text-[#6D7A77] text-center">
                  Finish signing in with Google in the other window.{' '}
                  <button type="button" className="font-semibold text-[#00685F] underline" onClick={() => setBusy(null)}>
                    Cancel
                  </button>
                </p>
              )}
              <div className="flex items-center gap-3 text-xs text-[#9AA5A3]">
                <span className="h-px flex-1 bg-[#E7DFD5]" /> or with email <span className="h-px flex-1 bg-[#E7DFD5]" />
              </div>
            </>
          )}

          <form onSubmit={onSubmit} className="space-y-3">
            {mode === 'signUp' && (
              <Field label="Your name">
                <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />
              </Field>
            )}
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Field>
            {mode !== 'reset' && (
              <Field label="Password" hint={mode === 'signUp' ? 'At least 6 characters' : undefined}>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                />
              </Field>
            )}
            <ErrorBanner>{error}</ErrorBanner>
            {notice && <p className="text-sm text-[#00685F]">{notice}</p>}
            <Button type="submit" className="w-full" loading={busy === 'email'}>
              {{ signIn: 'Sign in', signUp: 'Create account', reset: 'Send reset link' }[mode]}
            </Button>
          </form>

          <div className="flex flex-wrap justify-between gap-2 text-sm">
            {mode === 'signIn' ? (
              <>
                <button className="font-semibold text-[#00685F]" onClick={() => setMode('signUp')}>
                  Create an account
                </button>
                <button className="text-[#6D7A77]" onClick={() => setMode('reset')}>
                  Forgot password?
                </button>
              </>
            ) : (
              <button className="font-semibold text-[#00685F]" onClick={() => setMode('signIn')}>
                ← Back to sign in
              </button>
            )}
          </div>
        </Card>
        <p className="text-center text-xs text-[#6D7A77]">
          By continuing you agree to our{' '}
          <a href="/terms" className="underline">
            Terms
          </a>{' '}
          and{' '}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>
          . Questions?{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            Contact us
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
