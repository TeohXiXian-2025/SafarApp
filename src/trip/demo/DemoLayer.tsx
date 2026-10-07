// Everything the demo trip adds on top of the normal trip screens:
//   DemoBar    a slim bar under the top bar: quest progress, the demo files, "keep this trip"
//   QuestPanel the guide — a floating card on laptops (the page stays usable), a sheet on phones
//   spotlight  a pulsing ring around the button the current step needs
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { Check, ChevronDown, ChevronRight, Copy, Download, Eye, FileText, Gamepad2, Info, Lightbulb, Link2, MapPin, PartyPopper, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrangeJob, Booking, DEMO_KIT, demoKitUrl, Expense, Idea, Incident, paths, ScheduleItem, type DemoFile, type Trip } from '../../domain';
import { db } from '../../firebase/config';
import { api } from '../../lib/api';
import { useQuery } from '../../lib/firestore';
import { Button, cx, Sheet } from '../../ui';
import { KeepTripSheet } from './KeepTripSheet';
import { RevealLayer } from './RevealLayer';
import { FEATURES, QUEST, questProgress, type QuestInput, type QuestStep } from './quest';

const store = {
  get: (k: string): string[] => {
    try {
      return JSON.parse(localStorage.getItem(k) ?? '[]');
    } catch {
      return [];
    }
  },
  set: (k: string, v: string[]) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* private mode: the guide still works for this visit */
    }
  },
};

function useIsLaptop() {
  const [laptop, setLaptop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 768px)');
    const on = () => setLaptop(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return laptop;
}

/** The trip data the quest looks at (the same shared listeners the pages use). */
function useQuestInput(trip: Trip, uid: string): QuestInput & { ready: boolean } {
  const id = trip.id;
  const b = useQuery(`bookings:${id}`, () => paths.bookings(id), Booking);
  const i = useQuery(`ideas:${id}`, () => paths.ideas(id), Idea);
  const j = useQuery(`jobs:${id}`, () => query(collection(db, paths.jobs(id)), orderBy('at', 'desc'), limit(5)), ArrangeJob);
  const e = useQuery(`expenses:${id}`, () => paths.expenses(id), Expense);
  const n = useQuery(`incidents:${id}`, () => paths.incidents(id), Incident);
  // The same shared listener the Plan uses.
  const s = useQuery(`schedule:${id}`, () => paths.schedule(id), ScheduleItem);
  const [bookings, ideas, jobs, expenses, incidents] = [b.data, i.data, j.data, e.data, n.data];
  // Everything has arrived once: only after that does a step count as "just done".
  const loaded = ![b, i, j, e, n, s].some((q) => q.loading);
  const { pathname, hash } = useLocation();

  // Pages seen (for "have a look" steps), remembered on this device.
  const seenKey = `safar:quest-seen:${id}`;
  const [seen, setSeen] = useState(() => new Set(store.get(seenKey)));
  useEffect(() => {
    const page = pathname.split('/')[3] || 'home';
    const next = new Set(seen).add(page);
    if (hash) next.add(`${page}${hash}`);
    if (next.size === seen.size) return;
    setSeen(next);
    store.set(seenKey, [...next]);
  }, [pathname, hash, seen, seenKey]);

  // The vault is private (no live listener): ask while the passport step is the one being done.
  const [hasPassport, setHasPassport] = useState<boolean | null>(null);
  const onBookings = pathname.includes('/bookings');
  // Asked once when the trip opens (so a saved passport counts after a reload), then every few
  // seconds on Bookings until there is one.
  const known = hasPassport !== null;
  useEffect(() => {
    if (hasPassport || (known && !onBookings)) return;
    let stop = false;
    const check = () =>
      document.visibilityState === 'visible' &&
      api
        .post<{ docs?: { kind: string }[] }>('vault/list', {}, { tripId: id })
        .then((r) => !stop && setHasPassport(!!r.docs?.some((d) => d.kind === 'passport')))
        .catch(() => !stop && setHasPassport((v) => v ?? false));
    void check();
    const t = onBookings ? setInterval(check, 7000) : undefined;
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [hasPassport, known, onBookings, id]);

  const ready = loaded && hasPassport !== null;
  return useMemo(
    () => ({ uid, bookings, ideas, jobs, expenses, incidents, schedule: s.data, seen, hasPassport, ready }),
    [uid, bookings, ideas, jobs, expenses, incidents, s.data, seen, hasPassport, ready],
  );
}

/** Pulses the element the current step needs (it may render late, so keep looking). */
function useSpotlight(target: string | undefined, active: boolean) {
  useEffect(() => {
    if (!target || !active) return;
    let el: Element | null = null;
    const find = () => {
      const next = document.querySelector(`[data-quest="${target}"]`);
      if (next === el) return;
      el?.classList.remove('quest-spot');
      el = next;
      el?.classList.add('quest-spot');
    };
    find();
    const t = setInterval(find, 700);
    return () => {
      clearInterval(t);
      el?.classList.remove('quest-spot');
    };
  }, [target, active]);
}

function FileLink({ f }: { f: DemoFile }) {
  return (
    <a
      href={demoKitUrl(f)}
      download={f.file}
      className="flex items-center gap-3 rounded-xl border border-[#E7DFD5] bg-white px-3 py-2.5 hover:border-gold hover:bg-gold/5 transition-colors"
    >
      <span className="w-9 h-9 rounded-lg bg-night text-gold-soft flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold text-[#161C23] truncate">{f.label}</span>
        <span className="block text-[12px] text-[#6D7A77] truncate">{f.what}</span>
      </span>
      <Download className="w-4 h-4 text-[#00685F] shrink-0" />
    </a>
  );
}

function LinkBox({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', url);
    }
  };
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6D7A77]">Link for this step</p>
      <div className="flex items-center gap-3 rounded-xl border border-[#E7DFD5] bg-white px-3 py-2.5">
        <span className="w-9 h-9 rounded-lg bg-night text-gold-soft flex items-center justify-center shrink-0">
          <Link2 className="w-4 h-4" />
        </span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 hover:underline">
          <span className="block text-[13px] font-bold text-[#161C23] truncate">{label}</span>
          <span className="block text-[12px] text-[#6D7A77] truncate">{url.replace(/^https:\/\/(www\.)?/, '')}</span>
        </a>
        <Button variant="secondary" className="!min-h-9 !px-3 shrink-0" onClick={() => void copy()}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

function FeatureTag({ step }: { step: QuestStep }) {
  const f = step.feature && FEATURES[step.feature];
  if (!f && !step.bonus) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 text-[#7A5A12] px-2.5 py-1 text-[11.5px] font-bold">
      {f ? `${f.icon} ${f.name}` : '✨ Bonus'}
    </span>
  );
}

function StepBody({ step, blocked, onGo, onSkip }: { step: QuestStep; blocked: string | null; onGo: () => void; onSkip: () => void }) {
  return (
    <div className="space-y-3.5">
      <FeatureTag step={step} />
      {blocked && (
        <div className="rounded-xl border border-[#F2D8B0] bg-[#FFF8EC] p-3 text-[13px] leading-relaxed text-[#6B3F06] flex gap-2.5">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{blocked}</span>
        </div>
      )}
      <p className="text-[14px] leading-relaxed text-[#2B3437]">{step.story}</p>
      <ol className="space-y-1.5">
        {step.todo.map((t, i) => (
          <li key={t} className="flex gap-2.5 text-[13.5px] text-[#161C23]">
            <span className="w-5 h-5 rounded-full bg-[#00685F]/10 text-[#00685F] text-[11px] font-bold flex items-center justify-center shrink-0 mt-px">{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
      {step.link && <LinkBox url={step.link.url} label={step.link.label} />}
      {step.files && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6D7A77]">Files for this step</p>
          {step.files.map((f) => (
            <FileLink key={f.file} f={f} />
          ))}
        </div>
      )}
      <div className="rounded-xl bg-night text-white/90 p-3 text-[13px] leading-relaxed flex gap-2.5">
        <Lightbulb className="w-4 h-4 text-gold-soft shrink-0 mt-0.5" />
        <span>
          <b className="text-gold-soft">Why it matters · </b>
          {step.why}
        </span>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onGo}>
          <MapPin className="w-4 h-4" /> Show me where
        </Button>
        <Button variant="ghost" onClick={onSkip} title="Move to the next step">
          <ChevronRight className="w-4 h-4" /> Next
        </Button>
      </div>
    </div>
  );
}

function Finished({ onKeep, onClose }: { onKeep: () => void; onClose: () => void }) {
  return (
    <div className="text-center space-y-3 py-2">
      <span className="mx-auto w-16 h-16 rounded-2xl bg-gold/15 text-gold flex items-center justify-center anim-pop">
        <PartyPopper className="w-8 h-8" />
      </span>
      <h3 className="font-display text-2xl font-semibold text-[#161C23]">The trip is planned</h3>
      <p className="text-[14px] text-[#45524F] leading-relaxed">One week, four very different people, nobody left out. You’ve seen the planning flow:</p>
      <ul className="text-left space-y-1.5 text-[13.5px] text-[#161C23]">
        {Object.values(FEATURES).map((f) => (
          <li key={f.name} className="flex items-center gap-2 rounded-lg bg-white border border-[#EFE8DE] px-3 py-2">
            <span>{f.icon}</span> <b>{f.name}</b>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 pt-1">
        <Button variant="gold" onClick={onKeep}>
          Keep this trip — make my account
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Keep exploring
        </Button>
      </div>
    </div>
  );
}

function StepList({ done, skipped, currentId, onPick, onShow }: { done: Set<string>; skipped: Set<string>; currentId?: string; onPick: (id: string) => void; onShow: (id: string) => void }) {
  return (
    <ol className="space-y-1">
      {QUEST.map((s, i) => {
        const ok = done.has(s.id);
        const skip = !ok && skipped.has(s.id);
        return (
          <li key={s.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPick(s.id)}
              className={cx('w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-black/5', s.id === currentId && 'bg-gold/10')}
            >
              <span
                className={cx(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                  ok ? 'bg-[#00685F] text-white' : skip ? 'bg-[#E7DFD5] text-[#6D7A77]' : 'border border-[#CFC6BA] text-[#6D7A77]',
                )}
              >
                {ok ? <Check className="w-3 h-3" /> : i + 1}
              </span>
              <span className={cx('flex-1 truncate', ok ? 'text-[#6D7A77] line-through' : 'text-[#161C23] font-semibold')}>{s.title}</span>
              {skip && <span className="text-[11px] text-[#6D7A77]">skipped</span>}
            </button>
            {ok && s.reveal && (
              <button
                type="button"
                onClick={() => onShow(s.id)}
                className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-bold text-[#00685F] hover:bg-[#00685F]/10"
                title="Show me again what this step changed"
              >
                <Eye className="w-3.5 h-3.5" /> Show
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Progress({ n }: { n: number }) {
  return (
    <div className="flex gap-1" aria-label={`${n} of ${QUEST.length} steps done`}>
      {QUEST.map((s, i) => (
        <span key={s.id} className={cx('h-1.5 flex-1 rounded-full transition-colors duration-500', i < n ? 'bg-gold' : 'bg-white/20')} />
      ))}
    </div>
  );
}

export function DemoLayer({ trip, uid }: { trip: Trip; uid: string }) {
  const laptop = useIsLaptop();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const skipKey = `safar:quest-skipped:${trip.id}`;
  const [skipped, setSkipped] = useState(() => new Set(store.get(skipKey)));
  const [open, setOpen] = useState(() => laptop);
  const [picked, setPicked] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [kit, setKit] = useState(false);
  const [keep, setKeep] = useState(false);
  const [cheer, setCheer] = useState<string | null>(null);
  // "See what changed": a step waiting to be shown (until any open form closes), and the one being shown.
  const [pending, setPending] = useState<string | null>(null);
  const [revealing, setRevealing] = useState<string | null>(null);

  const input = useQuestInput(trip, uid);
  const progress = useMemo(() => questProgress(input), [input]);
  const finishedOrSkipped = (id: string) => progress.done.has(id) || skipped.has(id);
  // The guided planning flow before any bonus steps.
  const left = (s: QuestStep) => !finishedOrSkipped(s.id);
  const nextStep = QUEST.find((s) => left(s) && !s.bonus) ?? QUEST.find(left) ?? null;
  const step = (picked ? QUEST.find((s) => s.id === picked) : null) ?? nextStep;

  // A step just got done: a short cheer, then the next one.
  const prevDone = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!input.ready) return; // still loading: what's done now isn't news
    const before = prevDone.current;
    prevDone.current = progress.done;
    if (!before) return;
    const fresh = [...progress.done].find((id) => !before.has(id));
    if (!fresh) return;
    const s = QUEST.find((x) => x.id === fresh)!;
    setCheer(s.title);
    setPicked(null);
    setPending(null);
    setRevealing(null);
    setOpen(true); // show the next step automatically
    const t = setTimeout(() => setCheer(null), 3500);
    return () => clearTimeout(t);
  }, [progress.done, input.ready]);

  // Waits a moment — and for any open sheet, dialog or half-typed field to be done with — then shows it.
  useEffect(() => {
    if (!pending) return;
    let t: ReturnType<typeof setTimeout>;
    const busy = () => {
      if (document.querySelector('[role="dialog"]:not([data-reveal-layer]), [role="alertdialog"]')) return true;
      const a = document.activeElement;
      return !!a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName);
    };
    const check = () => {
      if (busy()) {
        t = setTimeout(check, 600);
        return;
      }
      setRevealing(pending);
      setPending(null);
      setCheer(null);
    };
    // Already showing one: go straight to the new one.
    t = setTimeout(check, revealing ? 0 : 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const stayHere = () => {
    setPending(null);
    setCheer(null);
    setOpen(true);
  };
  const showAgain = (id: string) => {
    setShowList(false);
    setOpen(false);
    setPending(null);
    setRevealing(id);
  };
  const endReveal = useCallback((next: boolean) => {
    setRevealing(null);
    if (next) setOpen(true);
  }, []);
  const revealStep = revealing ? QUEST.find((s) => s.id === revealing) : undefined;

  const base = step?.where.split(/[?#]/)[0] ?? '';
  const onStepPage = !!step && (base ? pathname.startsWith(`/t/${trip.id}${base}`) : pathname === `/t/${trip.id}`);
  useSpotlight(step?.target, onStepPage && !progress.done.has(step?.id ?? ''));

  const go = useCallback(() => {
    if (!step) return;
    const [path, hash] = step.where.split('#');
    navigate(`/t/${trip.id}${path}`);
    setOpen(false); // out of the way; it comes back when the step is done
    // Scroll to the section / the button once the page is there.
    setTimeout(() => {
      const el = (hash && document.getElementById(hash)) || (step.target && document.querySelector(`[data-quest="${step.target}"]`));
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 450);
  }, [step, laptop, navigate, trip.id]);

  const skip = () => {
    if (!step) return;
    const next = new Set(skipped).add(step.id);
    setSkipped(next);
    store.set(skipKey, [...next]);
    setPicked(null);
  };

  const hoursLeft = trip.demo && !trip.demo.kept ? Math.max(1, Math.round((trip.demo.expiresAt - Date.now()) / 3_600_000)) : null;
  const n = QUEST.filter((s) => finishedOrSkipped(s.id)).length;

  const panelBody = (
    <div className="space-y-4">
      {step ? (
        <>
          <StepBody step={step} blocked={progress.done.has(step.id) ? null : (step.blocked?.(input) ?? null)} onGo={go} onSkip={skip} />
          {picked && nextStep && picked !== nextStep.id && (
            <button type="button" className="text-[13px] font-semibold text-[#00685F]" onClick={() => setPicked(null)}>
              Back to the next step: {nextStep.title}
            </button>
          )}
        </>
      ) : (
        <Finished onKeep={() => setKeep(true)} onClose={() => setOpen(false)} />
      )}
      <div className="border-t border-[#EFE8DE] pt-3">
        <button type="button" onClick={() => setShowList((v) => !v)} className="w-full flex items-center justify-between text-[12px] font-bold uppercase tracking-[.08em] text-[#6D7A77]">
          All steps <ChevronDown className={cx('w-4 h-4 transition-transform', showList && 'rotate-180')} />
        </button>
        {showList && (
          <div className="mt-2">
            <StepList done={progress.done} skipped={skipped} currentId={step?.id} onPick={(id) => (setPicked(id), setShowList(false))} onShow={showAgain} />
          </div>
        )}
      </div>
    </div>
  );

  const stepNo = step ? QUEST.indexOf(step) + 1 : QUEST.length;

  return (
    <>
      {/* The demo bar (all sizes), right under the top bar. */}
      <div data-demo-bar className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 bg-night text-white border-b border-gold/30">
        <div className="px-3 md:px-6 py-2 flex items-center gap-2 md:gap-3">
          <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 flex items-center gap-2.5 text-left group" aria-expanded={open}>
            <span className="w-8 h-8 rounded-lg bg-gold text-night flex items-center justify-center shrink-0">
              <Gamepad2 className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.08em] text-gold-soft">
                Trip Quest · {n}/{QUEST.length}
                <span className="hidden sm:block flex-1 max-w-[180px]">
                  <Progress n={n} />
                </span>
              </span>
              <span className="block text-[13.5px] font-semibold truncate group-hover:underline">{step ? `Step ${stepNo}: ${step.title}` : 'All done — the trip is planned 🎉'}</span>
            </span>
            <ChevronRight className={cx('w-4 h-4 text-white/60 shrink-0 transition-transform', open && 'rotate-90')} />
          </button>
          <button type="button" onClick={() => setKit(true)} className="hidden sm:inline-flex h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-[13px] font-semibold items-center gap-1.5">
            <Download className="w-4 h-4" /> Demo files
          </button>
          {hoursLeft !== null ? (
            <button type="button" onClick={() => setKeep(true)} className="h-9 px-3 rounded-lg bg-gold text-night hover:bg-gold-soft text-[13px] font-bold whitespace-nowrap" title={`This demo trip is deleted in about ${hoursLeft} h unless you keep it`}>
              Keep trip<span className="hidden md:inline"> · {hoursLeft} h left</span>
            </button>
          ) : (
            <span className="hidden sm:inline text-[12px] text-gold-soft font-semibold">Kept ✓</span>
          )}
        </div>
      </div>

      {/* A step just got done. */}
      {cheer && (
        <div className="fixed z-[70] left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+7.5rem)] anim-pop">
          <div className="flex items-center gap-2.5 rounded-2xl bg-gold text-night px-4 py-2.5 shadow-[0_16px_40px_rgba(11,59,54,.35)] text-sm font-bold">
            <Sparkles className="w-4 h-4" /> Done: {cheer}
            {pending ? (
              <>
                <span className="font-semibold opacity-80 hidden sm:inline">· showing you what changed…</span>
                <button type="button" onClick={() => showAgain(pending)} className="ml-1 rounded-lg bg-night text-white px-2.5 py-1 text-[12px] font-bold hover:bg-night-2">
                  Show now
                </button>
                <button type="button" onClick={stayHere} className="rounded-lg px-2 py-1 text-[12px] font-bold hover:bg-night/10">
                  Stay here
                </button>
              </>
            ) : (
              nextStep && <span className="font-semibold opacity-80 hidden sm:inline">· Next: {nextStep.title}</span>
            )}
          </div>
        </div>
      )}

      {/* Folded guide on laptops: a small pill to bring it back. */}
      {laptop && !open && step && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed z-40 right-4 bottom-4 flex items-center gap-2.5 rounded-full bg-night text-white pl-2 pr-4 py-2 shadow-[0_16px_40px_rgba(11,59,54,.35)] hover:bg-night-2 anim-pop"
        >
          <span className="w-8 h-8 rounded-full bg-gold text-night flex items-center justify-center">
            <Gamepad2 className="w-4 h-4" />
          </span>
          <span className="text-left">
            <span className="block text-[10.5px] font-bold uppercase tracking-[.08em] text-gold-soft">Step {stepNo} of {QUEST.length}</span>
            <span className="block text-[13px] font-semibold max-w-[220px] truncate">{step.title}</span>
          </span>
        </button>
      )}

      {/* The guide: a floating card on laptops (the page stays usable), a sheet on phones. */}
      {laptop
        ? open && (
            <aside className="fixed z-40 right-4 bottom-4 w-[380px] max-h-[calc(100dvh-9rem)] flex flex-col rounded-2xl bg-[#FBF8F3] border border-[#E7DFD5] shadow-[0_24px_60px_rgba(11,59,54,.28)] anim-rise overflow-hidden">
              <div className="bg-night text-white px-4 pt-3.5 pb-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-[.08em] text-gold-soft flex-1">
                    {step ? `Step ${stepNo} of ${QUEST.length}` : 'Trip Quest complete'}
                  </p>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close the guide" className="w-8 h-8 -mr-1 rounded-lg hover:bg-white/10 flex items-center justify-center">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {step && <h2 className="font-display text-xl font-semibold leading-snug">{step.title}</h2>}
                <Progress n={n} />
              </div>
              <div className="p-4 overflow-y-auto">{panelBody}</div>
            </aside>
          )
        : (
            <Sheet open={open} onClose={() => setOpen(false)} title={step ? `Step ${stepNo} of ${QUEST.length} · ${step.title}` : 'Trip Quest complete'}>
              {panelBody}
            </Sheet>
          )}

      <Sheet open={kit} onClose={() => setKit(false)} title="Demo files">
        <div className="space-y-2">
          <p className="text-[13.5px] text-[#45524F] mb-3">
            Sample tickets, a hotel booking, a passport specimen and more — everything the demo trip needs. Download one, then upload it where the step says. On a phone,
            it lands in your Downloads and the upload box can pick it from there.
          </p>
          {Object.values(DEMO_KIT).map((f) => (
            <FileLink key={f.file} f={f} />
          ))}
        </div>
      </Sheet>

      <KeepTripSheet open={keep} onClose={() => setKeep(false)} tripId={trip.id} />

      {revealStep && <RevealLayer key={revealStep.id} step={revealStep} tripId={trip.id} input={input} laptop={laptop} onDone={endReveal} />}
    </>
  );
}
