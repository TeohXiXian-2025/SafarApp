// /demo — try Safar without an account. One tap makes a guest account and a
// private copy of a ready-made December trip to Japan; the Trip Quest inside
// the trip then guides the visitor through planning it (see src/trip/demo).
import { signInWithCustomToken } from 'firebase/auth';
import { ArrowRight, Check, Download, FileText, Plane, TrainFront } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/auth';
import { DEMO_KIT, demoKitUrl } from '../domain';
import { auth } from '../firebase/config';
import { api, ApiError } from '../lib/api';
import { QUEST } from '../trip/demo/quest';
import { Avatar, Button, confirmDialog, SafarMark } from '../ui';

const CAST = [
  { name: 'Aisyah', role: 'You · the planner', needs: ['Halal (Muslim-owned ok)', 'Prays', 'Loves food & photos'] },
  { name: 'Aminah', role: 'Your mum', needs: ['Certified halal only', 'Prays', 'Temples & gardens'] },
  { name: 'Farid', role: 'Your brother', needs: ['Halal', 'Prays', 'Anime, views, fast pace'] },
  { name: 'Daniel', role: "Farid's friend", needs: ['No food rules', 'Ramen fan', 'Night views'] },
];

const ROUTE = [
  { icon: Plane, text: 'KL → Tokyo', sub: 'Mon 7 Dec' },
  { icon: TrainFront, text: 'Tokyo → Kyoto', sub: 'Thu 10 Dec' },
  { icon: Plane, text: 'Osaka → KL', sub: 'Sun 13 Dec' },
];

export function DemoPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const guest = !!user?.uid.startsWith('guest_');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (user && !guest) {
      const ok = await confirmDialog({
        title: 'Try the demo as a guest?',
        body: `You're signed in as ${user.email ?? user.displayName ?? 'yourself'}. The demo uses a separate guest account — sign back in any time to see your own trips.`,
        confirmLabel: 'Start the demo',
      });
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const { token, tripId } = await api.post<{ token: string; tripId: string }>('demo/start');
      await signInWithCustomToken(auth, token);
      navigate(`/t/${tripId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the demo. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#FBF8F3]">
      <header className="bg-night text-white star-lattice">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <SafarMark className="w-7 h-7" />
            <span className="font-display text-xl font-semibold">Safar</span>
          </Link>
          <Link to="/login" className="text-sm font-semibold text-white/80 hover:text-white">
            Sign in
          </Link>
        </div>
        <section className="max-w-6xl mx-auto px-4 md:px-8 pt-8 pb-14 md:pt-14 md:pb-20 grid md:grid-cols-[1.1fr_.9fr] gap-10 items-center">
          <div className="anim-rise">
            <p className="text-[12px] font-bold uppercase tracking-[.14em] text-gold-soft">Demo trip · no sign-up</p>
            <h1 className="font-display text-[40px] md:text-[56px] leading-[1.05] font-semibold mt-3">
              Plan a week in Japan <span className="text-gold-soft italic">for four very different people.</span>
            </h1>
            <p className="text-white/80 text-[16px] md:text-lg mt-4 max-w-xl leading-relaxed">
              You play Aisyah. Your mum only eats certified halal, your brother wants anime and views, and his friend Daniel wants pork ramen. Ten guided steps, about
              15 minutes — with sample tickets, real places and five prayers a day.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              {guest ? (
                <Button variant="gold" className="!min-h-12 !px-6 text-[15px]" onClick={() => navigate('/trips')}>
                  Continue your demo <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button variant="gold" className="!min-h-12 !px-6 text-[15px] shine" loading={busy} onClick={() => void start()}>
                  {busy ? 'Setting up your trip…' : 'Start the demo'} {!busy && <ArrowRight className="w-4 h-4" />}
                </Button>
              )}
              <a href="#files" className="inline-flex items-center justify-center gap-2 min-h-12 px-5 rounded-xl border border-white/25 text-[15px] font-bold hover:bg-white/10">
                <Download className="w-4 h-4" /> See the demo files
              </a>
            </div>
            {error && <p className="mt-3 text-[14px] text-[#FFB4A9]">{error}</p>}
            <p className="mt-4 text-[13px] text-white/60">Your own private copy. It is deleted after 48 hours — unless you make an account to keep it.</p>
          </div>

          <div className="anim-rise [animation-delay:.15s] rounded-3xl bg-white/[.06] border border-white/15 p-5 md:p-6 backdrop-blur">
            <p className="text-[11px] font-bold uppercase tracking-[.12em] text-gold-soft">Japan in December · 7 – 13 Dec 2026</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {ROUTE.map((r) => (
                <div key={r.text} className="rounded-2xl bg-white/[.07] p-3">
                  <r.icon className="w-4 h-4 text-gold-soft" />
                  <p className="mt-2 text-[13px] font-bold leading-tight">{r.text}</p>
                  <p className="text-[12px] text-white/60">{r.sub}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2.5">
              {CAST.map((c, i) => (
                <div key={c.name} className="flex items-center gap-3 rounded-2xl bg-white/[.05] px-3 py-2.5 anim-rise" style={{ animationDelay: `${0.25 + i * 0.08}s` }}>
                  <span className="ring-2 ring-gold/40 rounded-full">
                    <Avatar name={c.name} size={36} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold">
                      {c.name} <span className="font-normal text-white/60">· {c.role}</span>
                    </p>
                    <p className="text-[12px] text-white/70 truncate">{c.needs.join(' · ')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-12 md:py-16 space-y-14">
        <section>
          <p className="text-[12px] font-bold uppercase tracking-[.12em] text-[#00685F]">The Trip Quest</p>
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-[#161C23] mt-2">Ten steps, one real plan</h2>
          <p className="text-[#45524F] mt-2 max-w-2xl">A guide inside the trip shows each step, where to tap, and the file to use. Every step is something other planners can’t do for a mixed group.</p>
          <ol className="mt-6 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {QUEST.map((s, i) => (
              <li key={s.id} className="rounded-2xl bg-white border border-[#E7DFD5] p-4">
                <span className="w-7 h-7 rounded-full bg-night text-gold-soft text-[12px] font-bold flex items-center justify-center">{i + 1}</span>
                <p className="mt-3 font-bold text-[#161C23] text-[14.5px] leading-snug">{s.title}</p>
                <p className="mt-1 text-[12.5px] text-[#6D7A77] leading-relaxed line-clamp-4">{s.why}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="files" className="scroll-mt-6">
          <p className="text-[12px] font-bold uppercase tracking-[.12em] text-[#00685F]">Demo files</p>
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-[#161C23] mt-2">Everything the trip needs</h2>
          <p className="text-[#45524F] mt-2 max-w-2xl">
            Sample documents that all tell the same story — the same four names, dates and bookings. You can also download them from inside the demo trip, one step at a
            time.
          </p>
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.values(DEMO_KIT).map((f) => (
              <a key={f.file} href={demoKitUrl(f)} download={f.file} className="group rounded-2xl bg-white border border-[#E7DFD5] p-4 hover:border-gold transition-colors">
                <span className="w-9 h-9 rounded-lg bg-night text-gold-soft flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </span>
                <p className="mt-3 font-bold text-[#161C23] text-[14px]">{f.label}</p>
                <p className="text-[12.5px] text-[#6D7A77]">{f.what}</p>
                <p className="mt-2 text-[12px] font-bold text-[#00685F] inline-flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" /> Download
                </p>
              </a>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-night text-white star-lattice p-6 md:p-10 grid md:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-semibold">Honest about what’s real</h2>
            <ul className="mt-3 space-y-1.5 text-[14px] text-white/80">
              {[
                'Real places, real map data, real prayer times for Tokyo and Kyoto in December.',
                'The tickets, bookings, passport and receipt are samples — clearly marked, with made-up names.',
                'Your travel mates are pretend: they vote and choose by the same rules as real people.',
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="w-4 h-4 text-gold-soft shrink-0 mt-0.5" /> {t}
                </li>
              ))}
            </ul>
          </div>
          {!guest && (
            <Button variant="gold" className="!min-h-12 !px-6 text-[15px]" loading={busy} onClick={() => void start()}>
              Start the demo <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </section>
      </main>
    </div>
  );
}
