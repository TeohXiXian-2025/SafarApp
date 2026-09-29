// Public landing page at "/" (signed-out visitors). No API calls. The phone
// version offers "Install app" (Android: the browser's own install prompt;
// iPhone: Add-to-Home-Screen steps) through the existing PWA install state.
import { ArrowRight, Check, ChevronDown, Coffee, Download, Flag, Lock, Menu, Moon, Play, Receipt, Share, ShieldCheck, SquarePlus, Sun, ThumbsUp, Ticket, UtensilsCrossed, X, Compass } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { isIOS, isMobileDevice, promptInstall, useInstall } from '../pwa/pwa';
import { cx, SafarMark } from '../ui';

const START = '/login?next=%2Ftrips%2Fnew';

/** Adds `.in` to `.reveal` elements as they scroll into view. */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) return els.forEach((e) => e.classList.add('in'));
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
}

/** "Install app" on phones: Android → native prompt; iPhone → instructions. Hidden on laptops / once installed. */
function useInstallOffer() {
  const { deferred, installed } = useInstall();
  const [iosHelp, setIosHelp] = useState(false);
  const mobile = isMobileDevice();
  const ios = isIOS();
  const available = mobile && !installed && (!!deferred || ios);
  const install = async () => {
    if (deferred) await promptInstall();
    else if (ios) setIosHelp(true);
  };
  return { available, install, iosHelp, closeIosHelp: () => setIosHelp(false), android: !!deferred };
}

export function LandingPage() {
  useReveal();
  const offer = useInstallOffer();
  const [menu, setMenu] = useState(false);
  const hero = useRef<HTMLElement>(null);
  const [pastHero, setPastHero] = useState(false);
  useEffect(() => {
    const el = hero.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="min-h-dvh bg-[#FAF8F5] text-[#161C23] overflow-x-hidden">
      {/* ---------------- Hero ---------------- */}
      <section ref={hero} className="relative bg-night text-white overflow-hidden">
        <div className="absolute inset-0 star-lattice opacity-70 [mask-image:radial-gradient(ellipse_at_75%_45%,#000_10%,transparent_70%)]" aria-hidden />
        <nav className="relative max-w-[1240px] mx-auto flex items-center gap-6 h-16 md:h-20 px-5 md:px-8 pt-[env(safe-area-inset-top)]">
          <Link to="/" className="flex items-center gap-2.5 mr-auto">
            <SafarMark className="w-8 h-8" />
            <span className="font-display text-2xl font-semibold">Safar</span>
          </Link>
          <div className="hidden md:flex items-center gap-7 text-sm font-semibold text-white/80">
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#mixed" className="hover:text-white">For mixed groups</a>
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
          </div>
          <Link to="/login" className="text-sm font-bold hover:text-gold-soft">
            Sign in
          </Link>
          <Link to={START} className="hidden md:inline-flex items-center min-h-11 px-5 rounded-xl bg-gold text-night text-sm font-bold hover:bg-gold-soft">
            Start planning
          </Link>
          <button type="button" className="md:hidden w-11 h-11 -mr-2 inline-flex items-center justify-center" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            {menu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </nav>
        {menu && (
          <div className="md:hidden relative mx-5 mb-2 rounded-2xl bg-white/10 backdrop-blur p-2 text-sm font-semibold">
            {[
              ['#how', 'How it works'],
              ['#mixed', 'For mixed groups'],
              ['#features', 'Features'],
              ['#faq', 'FAQ'],
            ].map(([h, t]) => (
              <a key={h} href={h} onClick={() => setMenu(false)} className="block px-3 py-3 rounded-xl hover:bg-white/10">
                {t}
              </a>
            ))}
          </div>
        )}

        <div className="relative max-w-[1240px] mx-auto px-5 md:px-8 pt-8 md:pt-16 pb-14 md:pb-24 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-center">
          <div>
            <p className="text-[11px] md:text-xs font-bold uppercase tracking-[.14em] text-gold-soft anim-rise">For Muslim travellers and the friends they travel with</p>
            <h1 className="font-display text-[42px] leading-[1.03] md:text-[64px] font-semibold mt-4 anim-rise" style={{ animationDelay: '80ms' }}>
              Group trips where <i className="text-gold-soft font-medium">everyone's</i> plan fits.
            </h1>
            <p className="text-base md:text-lg text-white/80 leading-relaxed mt-5 max-w-xl anim-rise" style={{ animationDelay: '160ms' }}>
              Prayer times, halal food and your friends' plans in one shared itinerary — so nobody misses Asr, and nobody waits an hour outside.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-8 anim-rise" style={{ animationDelay: '240ms' }}>
              <Link to={START} className="shine inline-flex items-center justify-center gap-2 min-h-[52px] px-6 rounded-2xl bg-gold text-night font-bold shadow-[0_10px_30px_rgba(200,161,90,.3)] hover:bg-gold-soft">
                Start planning — it's free <ArrowRight className="w-4 h-4" />
              </Link>
              {offer.available ? (
                <button type="button" onClick={() => void offer.install()} className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 rounded-2xl border border-white/30 font-bold hover:bg-white/10">
                  <Download className="w-4 h-4" /> Install the app
                </button>
              ) : (
                <Link to="/demo" className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 rounded-2xl border border-white/30 font-bold hover:bg-white/10">
                  <Play className="w-4 h-4" /> See a demo trip
                </Link>
              )}
            </div>
            <p className="flex flex-wrap gap-x-5 gap-y-1 mt-6 text-[13px] text-white/70 anim-rise" style={{ animationDelay: '320ms' }}>
              {['Free', 'Phone and laptop', offer.android ? 'Installs on Android — no Play Store' : 'No app store needed'].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-gold-soft" /> {t}
                </span>
              ))}
            </p>
          </div>
          <HeroMock />
        </div>
      </section>

      {/* ---------------- Problems ---------------- */}
      <section className="max-w-[1240px] mx-auto px-5 md:px-8 py-16 md:py-24">
        <p className="text-center text-xs font-bold uppercase tracking-[.14em] text-[#00685F] reveal">Sound familiar?</p>
        <h2 className="text-center font-display text-3xl md:text-[46px] leading-tight font-semibold mt-3 max-w-3xl mx-auto reveal">Travelling together shouldn't mean someone always gives something up.</h2>
        <div className="grid gap-4 md:gap-6 md:grid-cols-3 mt-10 md:mt-14">
          {[
            ['“Lunch ran long and we missed Asr.”', 'prayer times sit in every day like a booking, and the plan works around them.'],
            ['“Is this ramen actually halal?”', 'every label shows where it came from — a certificate, the owner, or traveller reports.'],
            ['“Half of us waited an hour outside the masjid.”', "friends who don't pray get something close by to do, and a time and place to meet."],
          ].map(([q, a], i) => (
            <div key={q} className="reveal bg-white border border-[#E7DFD5] rounded-3xl p-6 md:p-7" style={{ transitionDelay: `${i * 90}ms` }}>
              <p className="font-display text-2xl md:text-[26px] italic font-medium leading-snug">{q}</p>
              <p className="text-[15px] text-[#6D7A77] leading-relaxed mt-4">
                <b className="text-[#00685F]">Safar:</b> {a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="how" className="bg-white border-y border-[#E7DFD5] scroll-mt-4">
        <div className="max-w-[1240px] mx-auto px-5 md:px-8 py-16 md:py-24">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#00685F] reveal">How it works</p>
          <h2 className="font-display text-3xl md:text-[46px] leading-tight font-semibold mt-3 reveal">From group chat to a real plan in four steps.</h2>
          <ol className="relative grid gap-8 md:grid-cols-4 mt-10 md:mt-14">
            <span className="hidden md:block absolute left-6 right-6 top-6 h-0.5 bg-gold/60" aria-hidden />
            <span className="md:hidden absolute left-6 top-6 bottom-6 w-0.5 bg-gold/60" aria-hidden />
            {[
              ['Create a trip, share the link', 'Pick the cities and dates. Friends join with one link — no app to install.'],
              ['Everyone sets their needs', 'Prays or not, halal or vegetarian, budget and pace. Takes a minute.'],
              ['Drop in places and vote', 'Paste a TikTok, Instagram or Xiaohongshu link, or search. When the group is divided, Safar suggests a middle ground.'],
              ['Safar builds the days', 'Around prayer, meals, opening hours and real travel times. Drag to change anything.'],
            ].map(([t, d], i) => (
              <li key={t} className="relative flex md:block gap-4 reveal" style={{ transitionDelay: `${i * 110}ms` }}>
                <span className="relative z-10 shrink-0 w-12 h-12 rounded-full bg-night text-gold-soft font-display text-xl font-semibold flex items-center justify-center ring-[6px] ring-white">{i + 1}</span>
                <span className="block md:mt-5">
                  <b className="block text-lg">{t}</b>
                  <span className="block text-[15px] text-[#6D7A77] leading-relaxed mt-1.5">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- Mixed groups ---------------- */}
      <section id="mixed" className="max-w-[1240px] mx-auto px-5 md:px-8 py-16 md:py-24 scroll-mt-4">
        <p className="text-center text-xs font-bold uppercase tracking-[.14em] text-[#00685F] reveal">Made for mixed groups</p>
        <h2 className="text-center font-display text-3xl md:text-[46px] leading-tight font-semibold mt-3 reveal">One plan. Everyone looked after.</h2>
        <div className="grid gap-5 md:grid-cols-2 mt-10 md:mt-14">
          <div className="reveal relative overflow-hidden rounded-3xl bg-night text-white p-7 md:p-10">
            <div className="absolute inset-0 star-lattice opacity-50 [mask-image:linear-gradient(135deg,transparent_40%,#000)]" aria-hidden />
            <p className="relative text-xs font-bold uppercase tracking-[.14em] text-gold-soft">For Muslim travellers</p>
            <ul className="relative space-y-5 mt-6">
              <Point dark icon={<Moon className="w-5 h-5" />} title="Prayer fixed in every day" text="With the nearest masjid or prayer room — even inside long visits." />
              <Point dark icon={<ShieldCheck className="w-5 h-5" />} title="Halal labels with sources" text="Certified, Muslim-owned or Muslim-friendly — and who said so." />
              <Point dark icon={<Compass className="w-5 h-5" />} title="Qibla, wherever you are" text="A live compass on your phone, and prayer times on flights." />
            </ul>
          </div>
          <div className="reveal rounded-3xl bg-white border border-[#E7DFD5] p-7 md:p-10" style={{ transitionDelay: '100ms' }}>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[#00685F]">For their friends</p>
            <ul className="space-y-5 mt-6">
              <Point icon={<Coffee className="w-5 h-5" />} title="Something to do while others pray" text="A café, a shop or a view nearby — with a time to meet again." />
              <Point icon={<UtensilsCrossed className="w-5 h-5" />} title="Places good for everyone" text="Restaurants where the whole table finds something." />
              <Point icon={<ThumbsUp className="w-5 h-5" />} title="A real vote, not the loudest voice" text="When the group is divided, Safar finds a middle ground." />
            </ul>
          </div>
        </div>
        <SplitStrip />
      </section>

      {/* ---------------- Features ---------------- */}
      <section id="features" className="bg-[#F4F1EC] scroll-mt-4">
        <div className="max-w-[1240px] mx-auto px-5 md:px-8 py-16 md:py-24">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#00685F] reveal">Everything in one place</p>
          <h2 className="font-display text-3xl md:text-[46px] leading-tight font-semibold mt-3 reveal">The tools a group trip actually needs.</h2>
          <div className="grid gap-4 md:gap-5 md:grid-cols-3 mt-10 md:mt-12">
            <Feature className="md:col-span-2" title="A plan built around prayer" text="Every stop is timed with real travel, opening hours and the five prayers. Move anything — the day re-times itself.">
              <div className="space-y-1.5 mt-4">
                <MockStop t="10:45" name="Sannenzaka" tone="#C9B8A3" />
                <MockStop t="12:00" name="Halal Ramen Gion" tone="#E0C49B" tag="JHA" />
                <MockPrayer t="12:48" name="Dhuhr" where="Kyoto Masjid · 6 min" />
                <MockStop t="13:40" name="Fushimi Inari" tone="#D9A38E" />
              </div>
            </Feature>
            <Feature title="Halal Radar" text="Halal food near your hotel or near you, with the proof behind each label.">
              <div className="flex flex-wrap gap-1.5 mt-4">
                <Pill tone="ok">Certified</Pill>
                <Pill tone="ok">Muslim-owned</Pill>
                <Pill tone="fr">Muslim-friendly</Pill>
                <Pill tone="nv">Not verified</Pill>
              </div>
            </Feature>
            <Feature title="Paste a link, get a place" text="From TikTok, Instagram, Xiaohongshu or any website.">
              <p className="mt-4 rounded-xl border border-dashed border-[#C9C1B6] px-3 py-2.5 text-xs text-[#6D7A77] truncate">tiktok.com/@kyotoeats/video/…</p>
              <p className="text-center text-gold py-1" aria-hidden>
                ↓
              </p>
              <MockStop t="" name="Dotonbori · Osaka" tone="#B7C4CF" />
            </Feature>
            <Feature title="Tickets, stays & delay help" text="Upload an e-ticket; it lands on the plan. Flight late? See what moves." icon={<Ticket className="w-5 h-5" />} />
            <Feature title="Money, split fairly" text="Scan a receipt, tick who had what, see who owes whom." icon={<Receipt className="w-5 h-5" />} />
          </div>
        </div>
      </section>

      {/* ---------------- Trust ---------------- */}
      <section className="max-w-[1240px] mx-auto px-5 md:px-8 py-16 md:py-20 grid gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="reveal">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#00685F]">Trust</p>
          <h2 className="font-display text-3xl md:text-[38px] leading-tight font-semibold mt-3">Every halal label says where it came from.</h2>
          <div className="flex flex-wrap gap-1.5 mt-5">
            <Pill tone="ok">Certified · JAKIM</Pill>
            <Pill tone="ok">Certified · MUIS</Pill>
            <Pill tone="ok">Muslim-owned</Pill>
            <Pill tone="fr">Traveller reports</Pill>
            <Pill tone="nv">AI guess · not verified</Pill>
          </div>
        </div>
        <Point icon={<Lock className="w-5 h-5" />} title="Passports stay private" text="Documents in your vault are only visible to you." />
        <Point icon={<Sun className="w-5 h-5" />} title="Keeps working" text="When one map service says no, Safar falls back to OpenStreetMap and other open sources." />
      </section>

      {/* ---------------- FAQ ---------------- */}
      <section id="faq" className="max-w-[1240px] mx-auto px-5 md:px-8 pb-16 md:pb-24 grid gap-8 md:grid-cols-[360px_minmax(0,1fr)] scroll-mt-4">
        <div className="reveal">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#00685F]">Questions</p>
          <h2 className="font-display text-3xl md:text-[40px] font-semibold mt-3">Good to know</h2>
        </div>
        <div className="reveal">
          {[
            ['Is Safar free?', 'Yes. Planning, voting, sharing the trip and splitting money are free.'],
            ["My friends don't pray — is it still for them?", "Yes. They set their own needs, vote like everyone else, and during prayer times Safar suggests something nearby for them to do, with a time and place to meet again."],
            ['Which countries does it work in?', 'Anywhere with map data. Prayer times follow the local calculation method, and halal labels come from certifiers, owners, reviews and travellers.'],
            ['Do I need to install an app?', 'No — it works in the browser on phone and laptop. On Android you can also install it to your home screen in one tap.'],
          ].map(([q, a], i) => (
            <details key={q} className="group border-t border-[#E7DFD5] last:border-b" open={i === 0}>
              <summary className="flex items-center gap-4 py-5 cursor-pointer list-none text-base md:text-lg font-bold">
                <span className="flex-1">{q}</span>
                <ChevronDown className="w-5 h-5 text-[#6D7A77] transition-transform group-open:rotate-180" />
              </summary>
              <p className="pb-5 -mt-1 text-[15px] text-[#6D7A77] leading-relaxed max-w-2xl">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------------- Final CTA ---------------- */}
      <section className="px-4 md:px-8">
        <div className="reveal relative overflow-hidden max-w-[1240px] mx-auto rounded-[28px] bg-night text-white px-6 py-12 md:px-14 md:py-16 flex flex-col md:flex-row md:items-center gap-8">
          <div className="absolute inset-0 star-lattice opacity-60" aria-hidden />
          <h2 className="relative flex-1 font-display text-4xl md:text-[52px] leading-[1.05] font-semibold">
            Plan your next trip <i className="text-gold-soft font-medium">together.</i>
          </h2>
          <div className="relative flex flex-col sm:flex-row gap-3">
            <Link to={START} className="shine inline-flex items-center justify-center gap-2 min-h-14 px-7 rounded-2xl bg-gold text-night font-bold hover:bg-gold-soft">
              Start planning — it's free
            </Link>
            {offer.available && (
              <button type="button" onClick={() => void offer.install()} className="inline-flex items-center justify-center gap-2 min-h-14 px-6 rounded-2xl border border-white/30 font-bold hover:bg-white/10">
                <Download className="w-4 h-4" /> Install the app
              </button>
            )}
          </div>
        </div>
      </section>
      <footer className="max-w-[1240px] mx-auto px-5 md:px-8 py-10 pb-28 md:pb-10 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm text-[#6D7A77]">
        <span className="flex items-center gap-2 text-[#161C23] mr-auto">
          <SafarMark className="w-6 h-6" hole="#FAF8F5" />
          <span className="font-display text-lg font-semibold">Safar</span>
        </span>
        <Link to="/demo" className="hover:text-[#161C23]">Demo trip</Link>
        <Link to="/privacy" className="hover:text-[#161C23]">Privacy</Link>
        <Link to="/terms" className="hover:text-[#161C23]">Terms</Link>
        <span>© {new Date().getFullYear()} Safar</span>
      </footer>

      {/* Phone: once the hero is off screen, a sticky "Start planning" (+ Install on Android/iPhone). */}
      <div
        className={cx(
          'md:hidden fixed inset-x-0 bottom-0 z-30 bg-[#FAF8F5]/95 backdrop-blur border-t border-[#E7DFD5] px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+.75rem)] flex gap-2 transition-transform duration-300',
          pastHero ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <Link to={START} className="flex-1 inline-flex items-center justify-center min-h-[50px] rounded-2xl bg-night text-white font-bold">
          Start planning — it's free
        </Link>
        {offer.available && (
          <button type="button" onClick={() => void offer.install()} aria-label="Install the app" className="shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[50px] px-4 rounded-2xl border border-[#DDD5CA] bg-white font-bold text-sm">
            <Download className="w-4 h-4" /> Install
          </button>
        )}
      </div>

      {offer.iosHelp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#081A18]/50" onClick={offer.closeIosHelp}>
          <div className="w-full bg-[#FAF8F5] rounded-t-3xl p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] animate-[safar-sheet-up_.35s_cubic-bezier(.2,.8,.2,1)_both]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Install Safar on iPhone">
            <h2 className="font-display text-2xl font-semibold">Install Safar on iPhone</h2>
            <ol className="mt-4 space-y-3 text-[15px]">
              <li className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-night text-gold-soft text-sm font-bold flex items-center justify-center">1</span> Tap <Share className="w-4 h-4 text-[#2B6CB0]" /> <b>Share</b> in Safari
              </li>
              <li className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-night text-gold-soft text-sm font-bold flex items-center justify-center">2</span> Choose <SquarePlus className="w-4 h-4" /> <b>Add to Home Screen</b>
              </li>
            </ol>
            <button type="button" onClick={offer.closeIosHelp} className="mt-6 w-full min-h-12 rounded-2xl bg-night text-white font-bold">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Point({ icon, title, text, dark }: { icon: ReactNode; title: string; text: string; dark?: boolean }) {
  return (
    <li className="flex gap-3.5 list-none">
      <span className={cx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', dark ? 'bg-gold/15 text-gold-soft' : 'bg-[#E8F2F0] text-[#00685F]')}>{icon}</span>
      <span>
        <b className="block">{title}</b>
        <span className={cx('block text-[15px] leading-relaxed', dark ? 'text-white/70' : 'text-[#6D7A77]')}>{text}</span>
      </span>
    </li>
  );
}

function Pill({ tone, children }: { tone: 'ok' | 'fr' | 'nv'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center h-6 px-2.5 rounded-full text-xs font-bold whitespace-nowrap',
        tone === 'ok' ? 'bg-[#00685F] text-white' : tone === 'fr' ? 'border border-[#00685F] text-[#00685F]' : 'border border-dashed border-[#8A9592] text-[#6D7A77]',
      )}
    >
      {children}
    </span>
  );
}

function Feature({ title, text, children, className, icon }: { title: string; text: string; children?: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <div className={cx('reveal bg-white border border-[#E7DFD5] rounded-3xl p-6 md:p-7', className)}>
      {icon && <span className="w-10 h-10 rounded-xl bg-[#EEF3F8] text-[#1D4E89] flex items-center justify-center mb-4">{icon}</span>}
      <h3 className="font-display text-2xl font-semibold">{title}</h3>
      <p className="text-[15px] text-[#6D7A77] leading-relaxed mt-2">{text}</p>
      {children}
    </div>
  );
}

function MockStop({ t, name, tone, tag }: { t: string; name: string; tone: string; tag?: string }) {
  return (
    <div className="flex items-center gap-2.5 p-1.5 pr-3 rounded-xl bg-white border border-[#E7DFD5] text-xs">
      <span className="w-9 h-9 rounded-lg shrink-0" style={{ background: tone }} />
      {t && <b className="tabular-nums w-10">{t}</b>}
      <span className="font-semibold flex-1 truncate text-[#161C23]">{name}</span>
      {tag && <span className="h-5 px-2 rounded-full bg-[#00685F] text-white text-[10px] font-bold inline-flex items-center">{tag}</span>}
    </div>
  );
}

function MockPrayer({ t, name, where }: { t: string; name: string; where: string }) {
  return (
    <div className="flex items-center gap-2.5 h-9 px-3 rounded-xl bg-night-2 text-white text-xs">
      <Moon className="w-3.5 h-3.5 text-gold-soft" />
      <b className="tabular-nums">{t}</b>
      <b>{name}</b>
      <span className="text-white/70 truncate">· {where}</span>
    </div>
  );
}

/** The hero's product preview: a laptop window with a day + map, and a floating phone. */
function HeroMock() {
  return (
    <div className="relative h-[430px] md:h-[520px] anim-rise" style={{ animationDelay: '200ms' }} aria-hidden>
      <div className="absolute right-0 top-0 w-[92%] md:w-[88%] rounded-2xl bg-[#FAF8F5] shadow-[0_40px_80px_rgba(0,0,0,.35)] overflow-hidden">
        <div className="h-8 bg-white border-b border-[#E7DFD5] flex items-center gap-1.5 px-3">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E7DFD5]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#E7DFD5]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#E7DFD5]" />
          <span className="ml-3 text-[10px] text-[#6D7A77]">safar · Japan autumn · Plan</span>
        </div>
        <div className="flex h-[300px] md:h-[380px]">
          <div className="w-8 md:w-10 bg-night shrink-0" />
          <div className="flex-1 min-w-0 p-3 md:p-4 space-y-1.5 text-[#161C23]">
            <p className="font-display text-base md:text-lg font-semibold mb-1">Tuesday, 14 October</p>
            <MockStop t="09:00" name="Kiyomizu-dera" tone="#D4B9A8" />
            <MockStop t="12:00" name="Halal Ramen Gion" tone="#E0C49B" tag="JHA" />
            <MockPrayer t="12:48" name="Dhuhr" where="Kyoto Masjid" />
            <MockStop t="13:40" name="Fushimi Inari" tone="#D9A38E" />
            <MockPrayer t="15:21" name="Asr" where="prayer room on site" />
            <MockStop t="16:20" name="Nishiki Market" tone="#C9B8A3" />
          </div>
          <svg viewBox="0 0 200 380" preserveAspectRatio="xMidYMid slice" className="hidden sm:block w-[38%] h-full shrink-0 bg-[#EDEAE3]">
            <path d="M0 270 C50 255 80 290 120 280 S180 250 200 260 L200 300 C160 290 130 320 100 320 S30 300 0 310Z" fill="#C8DCE2" />
            <g stroke="#fff" fill="none" strokeLinecap="round">
              <path strokeWidth="7" d="M0 120 H200 M0 220 H200 M70 0 V380 M150 0 V380" />
              <path strokeWidth="3" d="M0 60 H200 M0 170 H200 M30 0 V380 M110 0 V380" />
            </g>
            <path className="anim-draw" style={{ ['--len' as string]: 420 }} d="M60 70 L100 120 L105 170 L150 205 L165 270 L140 330" stroke="#00685F" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {[
              [60, 70],
              [100, 120],
              [105, 170],
              [165, 270],
              [140, 330],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="8" fill={i === 2 ? '#0E4A43' : '#161C23'} stroke={i === 2 ? '#C8A15A' : '#fff'} strokeWidth="2.5" />
            ))}
          </svg>
        </div>
      </div>
      <div className="absolute left-0 md:left-2 top-[170px] md:top-[210px] w-[170px] md:w-[200px] h-[260px] md:h-[310px] rounded-[30px] bg-[#161C23] p-2 shadow-[0_40px_80px_rgba(0,0,0,.45)] anim-bob">
        <div className="w-full h-full rounded-[23px] bg-night overflow-hidden p-4 flex flex-col items-center text-center">
          <p className="text-[9px] font-bold uppercase tracking-[.12em] text-gold-soft">Next prayer</p>
          <p className="font-display text-xl md:text-2xl font-semibold mt-1">Asr 15:21</p>
          <svg viewBox="0 0 60 60" className="w-20 md:w-24 mt-3">
            <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="5" />
            <circle className="anim-draw" style={{ ['--len' as string]: 151 }} cx="30" cy="30" r="24" fill="none" stroke="#E2C27E" strokeWidth="5" strokeLinecap="round" transform="rotate(-90 30 30)" strokeDasharray="100 151" />
            <text x="30" y="33" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
              42 min
            </text>
          </svg>
          <p className="text-[10px] text-white/70 mt-2">Prayer room at Fushimi Inari · 4 min walk</p>
          <span className="mt-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-[10px]">
            <Compass className="w-3 h-3 text-gold-soft" /> Qibla 291° WNW
          </span>
        </div>
      </div>
      <div className="absolute right-3 md:right-6 bottom-6 md:bottom-4 anim-float">
        <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-white text-[#161C23] shadow-[0_20px_40px_rgba(0,0,0,.25)] text-xs md:text-sm">
          <Flag className="w-4 h-4 text-gold" />
          <span>
            <b>While we pray:</b> Mei &amp; Ken → café
            <span className="block text-[11px] text-[#6D7A77]">Meet at the masjid 13:10</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Mixed groups: the group splits at Dhuhr and meets again. */
function SplitStrip() {
  return (
    <div className="reveal mt-5 rounded-3xl bg-white border border-[#E7DFD5] p-5 md:px-9 md:py-7 flex items-center gap-4 md:gap-8">
      <div className="shrink-0">
        <p className="font-display text-2xl md:text-3xl font-semibold tabular-nums">12:48</p>
        <p className="text-xs md:text-sm text-[#6D7A77]">Dhuhr</p>
      </div>
      <svg viewBox="0 0 700 110" className="flex-1 min-w-0 h-20 md:h-28" aria-label="The group splits for prayer and meets again">
        <circle cx="20" cy="55" r="9" fill="#161C23" />
        <path d="M20 55 C120 55 140 20 240 20 L460 20 C560 20 580 55 680 55" stroke="#0E4A43" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M20 55 C120 55 140 90 240 90 L460 90 C560 90 580 55 680 55" stroke="#C8A15A" strokeWidth="4" fill="none" strokeLinecap="round" />
        <circle cx="680" cy="55" r="9" fill="#161C23" />
        <text x="350" y="12" textAnchor="middle" fontSize="14" fontWeight="700" fill="#0E4A43">
          Praying → Kyoto Masjid
        </text>
        <text x="350" y="108" textAnchor="middle" fontSize="14" fontWeight="700" fill="#7A5A1E">
          Friends → café nearby
        </text>
      </svg>
      <div className="shrink-0 text-right">
        <p className="font-display text-2xl md:text-3xl font-semibold tabular-nums">13:10</p>
        <p className="text-xs md:text-sm text-[#6D7A77]">Everyone meets</p>
      </div>
    </div>
  );
}
