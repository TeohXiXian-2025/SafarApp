// "See what changed": after a Trip Quest step is done, the guide takes the
// visitor to where the result shows (the right page, the right day), scrolls
// to it, dims the rest of the page, rings it in gold and says what happened —
// a callout next to it on a laptop, a small sheet under it on a phone. The
// spot comes from the trip's real data (QuestStep.reveal), so it works
// whichever day the plan put things on. A click anywhere, Esc or "Next step"
// closes it.
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '../../ui';
import type { QuestInput, QuestStep, Reveal } from './quest';

/** How long to keep looking for the spot (after Auto-plan the server adds prayer breaks for up to a minute). */
const FIND_MS = 45_000;
const PAD = 8;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function RevealLayer({ step, tripId, input, laptop, onDone }: { step: QuestStep; tripId: string; input: QuestInput; laptop: boolean; onDone: (next: boolean) => void }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const inputRef = useRef(input);
  inputRef.current = input;
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [missing, setMissing] = useState(false);
  // The callout's real height (for placing it next to the spot).
  const [calloutH, setCalloutH] = useState(200);
  const calloutRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const h = calloutRef.current?.offsetHeight;
    if (h && Math.abs(h - calloutH) > 2) setCalloutH(h);
  });
  const el = useRef<Element | null>(null);
  const here = useRef({ pathname, search });
  here.current = { pathname, search };

  // Find the spot: the recipe (once the data is there), the page, then the element.
  useEffect(() => {
    let stop = false;
    let went = '';
    const started = Date.now();
    const tick = () => {
      if (stop) return;
      const r = step.reveal?.(inputRef.current) ?? null;
      if (r) {
        setReveal(r);
        const url = `/t/${tripId}${r.path}`;
        const [path, query = ''] = url.split('?');
        const at = here.current;
        if (went !== url && (at.pathname !== path || (query && at.search !== `?${query}`))) {
          went = url;
          navigate(url);
        }
        const found = document.querySelector(`[data-reveal="${r.target}"]`);
        if (found) {
          el.current = found;
          // Below the top bars; a card taller than the screen shows from its top.
          const tall = found.getBoundingClientRect().height > (window.innerHeight - topEdge()) * 0.7;
          (found as HTMLElement).style.scrollMarginTop = `${topEdge() + 16}px`;
          // Phone: at the top, clear of the sheet at the bottom.
          found.scrollIntoView({ behavior: 'smooth', block: tall || !laptop ? 'start' : 'center' });
          // Measured once the scroll has settled; then followed (below).
          setTimeout(() => !stop && setBox(measure(found)), 550);
          return;
        }
      }
      if (Date.now() - started > FIND_MS) {
        setMissing(true);
        return;
      }
      setTimeout(tick, 400);
    };
    tick();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, tripId]);

  // Follow the spot while the page scrolls or resizes (and re-find it if the list re-renders).
  useLayoutEffect(() => {
    if (!box || !reveal) return;
    let raf = 0;
    const follow = () => {
      const cur = el.current?.isConnected ? el.current : document.querySelector(`[data-reveal="${reveal.target}"]`);
      if (cur) {
        el.current = cur;
        const b = measure(cur);
        setBox((old) => (old && same(old, b) ? old : b));
      }
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(raf);
  }, [!!box, reveal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDone(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const text = reveal?.text ?? '';
  const label = (
    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.08em] text-gold-soft">
      <Sparkles className="w-3.5 h-3.5" /> What changed · {step.title}
    </p>
  );
  const buttons = (
    <div className="flex gap-2 pt-1">
      <Button variant="gold" className="flex-1 !min-h-10" onClick={() => onDone(true)}>
        Next step <ArrowRight className="w-4 h-4" />
      </Button>
      <Button variant="ghost" className="!min-h-10 !text-white/80 hover:!bg-white/10" onClick={() => onDone(false)}>
        Close
      </Button>
    </div>
  );

  // Still looking (the page is loading / the plan is settling).
  if (!box && !missing) {
    return (
      <div className="fixed z-[60] left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+7.5rem)] rounded-full bg-night text-white px-4 py-2 text-sm font-semibold shadow-[0_16px_40px_rgba(11,59,54,.35)] flex items-center gap-2 anim-pop">
        <Sparkles className="w-4 h-4 text-gold-soft" /> Showing you what changed…
        <button type="button" className="ml-1 w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center" onClick={() => onDone(false)} aria-label="Stay here">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Couldn't find it on screen: say it anyway.
  if (!box) {
    return (
      <div className="fixed inset-0 z-[60] bg-[#08161480] flex items-center justify-center p-4" onClick={() => onDone(false)}>
        <div className="w-full max-w-sm rounded-2xl bg-night text-white p-4 space-y-2.5 shadow-2xl anim-pop" onClick={(e) => e.stopPropagation()}>
          {label}
          <p className="text-[14px] leading-relaxed">{text || 'Done — have a look around this page.'}</p>
          {buttons}
        </div>
      </div>
    );
  }

  const ring = { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 };
  const callout = laptop ? place(ring, calloutH) : null;

  return (
    <div className="fixed inset-0 z-[60]" onClick={() => onDone(false)} role="dialog" data-reveal-layer aria-label={`What changed: ${step.title}`}>
      {/* The spot: everything else dimmed, a gold ring around it. */}
      <div
        className="absolute rounded-2xl pointer-events-none transition-all duration-300 ease-out reveal-ring"
        style={{ ...ring, boxShadow: '0 0 0 9999px rgba(8, 22, 20, .55), 0 0 0 3px #C8A15A, 0 0 28px 6px rgba(200, 161, 90, .55)' }}
      />
      {callout ? (
        <div ref={calloutRef} className="absolute rounded-2xl bg-night text-white p-4 space-y-2.5 shadow-2xl anim-pop" style={callout} onClick={(e) => e.stopPropagation()}>
          {label}
          <p className="text-[14px] leading-relaxed">{text}</p>
          {buttons}
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-night text-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] space-y-2.5 shadow-2xl anim-rise" onClick={(e) => e.stopPropagation()}>
          {label}
          <p className="text-[14px] leading-relaxed">{text}</p>
          {buttons}
        </div>
      )}
    </div>
  );
}

/** Where the callout goes on a laptop: below the spot, else above, else beside it, else in the corner — never over it. */
function place(ring: Box, h: number): { top: number; left: number; width: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const W = Math.min(360, vw - 32);
  const GAP = 14;
  const centred = Math.min(Math.max(16, ring.left + ring.width / 2 - W / 2), vw - W - 16);
  const top = (t: number) => Math.min(Math.max(16, t), vh - h - 16);
  if (ring.top + ring.height + GAP + h <= vh - 16) return { top: ring.top + ring.height + GAP, left: centred, width: W };
  if (ring.top - GAP - h >= 16) return { top: ring.top - GAP - h, left: centred, width: W };
  if (ring.left - GAP - W >= 16) return { top: top(ring.top), left: ring.left - GAP - W, width: W };
  if (ring.left + ring.width + GAP + W <= vw - 16) return { top: top(ring.top), left: ring.left + ring.width + GAP, width: W };
  return { top: vh - h - 16, left: vw - W - 16, width: W };
}

/** Where the page starts under the app's sticky top bar and the demo bar. */
const topEdge = () => document.querySelector('[data-demo-bar]')?.getBoundingClientRect().bottom ?? 0;

function measure(e: Element): Box {
  const r = e.getBoundingClientRect();
  // Very tall spots (a long card): ring what's on screen, under the top bars.
  const top = Math.max(r.top, topEdge() + PAD + 4);
  const bottom = Math.min(r.bottom, window.innerHeight - 8);
  return { top, left: r.left, width: r.width, height: Math.max(24, bottom - top) };
}

const same = (a: Box, b: Box) => Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
