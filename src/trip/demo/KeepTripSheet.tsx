// "Keep this trip": the demo guest turns into a real account (Google or email
// + password linked to the same user), so the trip, votes and plan stay theirs.
import { EmailAuthProvider, GoogleAuthProvider, linkWithCredential, linkWithPopup, updateProfile } from 'firebase/auth';
import { useState } from 'react';
import { authErrorMessage } from '../../auth/auth';
import { auth } from '../../firebase/config';
import { api } from '../../lib/api';
import { Button, Field, Sheet } from '../../ui';

export function KeepTripSheet({ open, onClose, tripId }: { open: boolean; onClose: () => void; tripId: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'google' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const finish = async () => {
    await api.post('demo/keep', {}, { tripId });
    setDone(true);
  };
  const run = async (kind: 'google' | 'email', link: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await link();
      await finish();
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      setError(
        code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use'
          ? 'That account already uses Safar. Sign in to it to plan your own trips — this demo trip stays with the guest account.'
          : code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user'
            ? 'The Google window was closed or blocked — try again, or use email instead.'
            : authErrorMessage(err),
      );
    } finally {
      setBusy(null);
    }
  };

  const user = auth.currentUser;
  return (
    <Sheet open={open} onClose={onClose} title="Keep this trip">
      {done ? (
        <div className="space-y-3">
          <p className="text-[15px] font-semibold text-[#161C23]">It’s yours. 🎉</p>
          <p className="text-[14px] text-[#45524F]">This trip won’t be deleted, and you can sign in from any device. Invite real friends from People, or start a new trip from My trips.</p>
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[14px] text-[#45524F] leading-relaxed">
            Make an account and this demo trip stays — with everything you did. Otherwise it is deleted two days after you started it. (The travel mates stay pretend.)
          </p>
          <Button
            variant="secondary"
            className="w-full"
            loading={busy === 'google'}
            disabled={!!busy || !user}
            onClick={() => void run('google', () => linkWithPopup(user!, new GoogleAuthProvider()))}
          >
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-[12px] text-[#6D7A77]">
            <span className="h-px flex-1 bg-[#E7DFD5]" /> or with email <span className="h-px flex-1 bg-[#E7DFD5]" />
          </div>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run('email', async () => {
                await linkWithCredential(user!, EmailAuthProvider.credential(email.trim(), password));
                if (!user!.displayName) await updateProfile(user!, { displayName: 'Aisyah' });
              });
            }}
          >
            <Field label="Email">
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full min-h-11 rounded-xl border border-[#DDD5CA] px-3 text-[15px]" />
            </Field>
            <Field label="Password" hint="At least 6 characters">
              <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full min-h-11 rounded-xl border border-[#DDD5CA] px-3 text-[15px]" />
            </Field>
            <Button type="submit" className="w-full" loading={busy === 'email'} disabled={!!busy || !user}>
              Create my account
            </Button>
          </form>
          {error && <p className="text-[13px] text-[#B3261E]">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}
