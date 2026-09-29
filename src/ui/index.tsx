// Small shared UI primitives for the live app. Palette matches the prototype:
// ink #161C23 · muted #6D7A77 · line #E7DFD5 · brand #00685F · sand #FAF8F5
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode, SelectHTMLAttributes, TouchEvent } from 'react';
import { create } from 'zustand';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';

const variants: Record<Variant, string> = {
  primary: 'bg-[#00685F] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_1px_2px_rgba(0,77,70,.35)] hover:bg-[#00564F] disabled:bg-[#00685F]/50',
  secondary: 'bg-white text-[#161C23] border border-[#DDD5CA] hover:bg-[#F3EFE9] disabled:opacity-50',
  ghost: 'text-[#00685F] hover:bg-[#00685F]/10 disabled:opacity-50',
  danger: 'bg-[#B3261E] text-white hover:bg-[#8C1D18] disabled:bg-[#B3261E]/50',
  gold: 'bg-gold text-night hover:bg-gold-soft disabled:opacity-50',
};

export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl text-sm font-bold transition-colors disabled:cursor-not-allowed',
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

/**
 * Labelled form field. For a single input it's a <label> (click label → focus input).
 * Pass `group` when it holds several controls (chips, pickers, two inputs): it then
 * renders a <fieldset>, so the caption doesn't get attached to the first button.
 */
export function Field({
  label,
  hint,
  error,
  group,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  group?: boolean;
  children: ReactNode;
}) {
  const caption = <span className="block text-xs font-bold text-[#6D7A77] uppercase tracking-wider">{label}</span>;
  const footer = error ? (
    <span className="block text-xs text-[#B3261E]">{error}</span>
  ) : hint ? (
    <span className="block text-xs text-[#6D7A77]">{hint}</span>
  ) : null;
  if (group) {
    return (
      <fieldset className="space-y-1.5 min-w-0">
        <legend className="mb-1.5">{caption}</legend>
        {children}
        {footer}
      </fieldset>
    );
  }
  return (
    <label className="block space-y-1.5">
      {caption}
      {children}
      {footer}
    </label>
  );
}

const inputClass =
  'w-full min-h-11 px-3.5 rounded-xl border border-[#E7DFD5] bg-white text-[#161C23] text-base sm:text-sm placeholder:text-[#9AA5A3] focus:outline-none focus:ring-2 focus:ring-[#00685F]/40 focus:border-[#00685F]';

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputClass, 'pr-8', props.className)} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('bg-white rounded-2xl border border-[#E7DFD5] shadow-xs', className)}>{children}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-[#6D7A77]">
      <Loader2 className="w-6 h-6 animate-spin text-[#00685F]" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-xl border border-[#F2B8B5] bg-[#FDECEA] px-3.5 py-2.5 text-sm text-[#8C1D18]">
      {children}
    </div>
  );
}

const AVATAR_COLORS = ['#00685F', '#B7791F', '#7B5EA7', '#2B6CB0', '#C05621', '#2F855A'];

export function Avatar({ name, photoURL, size = 36 }: { name: string; photoURL?: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const color = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  const style = { width: size, height: size };
  return photoURL ? (
    <img src={photoURL} alt={name} style={style} referrerPolicy="no-referrer" className="rounded-full object-cover shrink-0" />
  ) : (
    <span
      style={{ ...style, background: color, fontSize: size * 0.38 }}
      className="rounded-full text-white font-bold inline-flex items-center justify-center shrink-0"
      aria-label={name}
    >
      {initials}
    </span>
  );
}

export function Badge({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'amber' | 'muted' }) {
  const tones = {
    brand: 'bg-[#00685F]/10 text-[#00685F]',
    amber: 'bg-[#FDF3E1] text-[#96590B]',
    muted: 'bg-[#F3EFE9] text-[#6D7A77]',
  };
  return <span className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold', tones[tone])}>{children}</span>;
}

export { cx };

/**
 * Phones: bottom sheet with a grab handle (swipe the header down to close).
 * Laptops/tablets (md+): a drawer from the right, so the page it acts on stays
 * visible next to it. Same props either way; closes on backdrop tap / Escape.
 */
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Swipe-down-to-close on the phone sheet's header (only the header, so the
  // content can still scroll). Purely a gesture for onClose.
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    if (window.matchMedia('(min-width: 768px)').matches) return;
    drag.current = { y: e.touches[0].clientY, dy: 0 };
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!drag.current || !panel.current) return;
    drag.current.dy = Math.max(0, e.touches[0].clientY - drag.current.y);
    panel.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onTouchEnd = () => {
    if (!drag.current || !panel.current) return;
    const far = drag.current.dy > 90;
    panel.current.style.transform = '';
    drag.current = null;
    if (far) onClose();
  };

  if (!open) return null;
  // Portalled to <body> so a parent with its own stacking context (animated cards,
  // sticky panes) can never trap or clip the sheet.
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end justify-center md:justify-end md:items-stretch bg-[#081A18]/45 md:bg-[#081A18]/20 animate-[safar-fade_.25s_both]"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cx(
          'w-full bg-[#FAF8F5] shadow-2xl flex flex-col transition-transform',
          'rounded-t-3xl max-h-[92dvh] animate-[safar-sheet-up_.4s_cubic-bezier(.2,.8,.2,1)_both]',
          'md:rounded-none md:max-h-none md:h-dvh md:border-l md:border-[#E7DFD5] md:animate-[safar-drawer-in_.36s_cubic-bezier(.2,.8,.2,1)_both]',
          wide ? 'md:max-w-[720px]' : 'md:max-w-[480px]',
        )}
      >
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className="shrink-0 border-b border-[#E7DFD5] bg-white rounded-t-3xl md:rounded-none">
          <div className="md:hidden mx-auto mt-2 h-1.5 w-10 rounded-full bg-[#D5CEC4]" aria-hidden />
          <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3 md:pt-5 md:pb-4">
            <h2 className="font-display text-xl font-semibold text-[#161C23] min-w-0">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="w-10 h-10 shrink-0 rounded-full hover:bg-black/5 inline-flex items-center justify-center text-[#6D7A77]">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] min-w-0">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog — a designed replacement for window.confirm().
// `await confirmDialog({...})` resolves true/false exactly like confirm() did,
// so call sites keep their conditions; <ConfirmHost/> is mounted once at the root.
// ---------------------------------------------------------------------------
export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
type ConfirmReq = ConfirmOptions & { resolve: (ok: boolean) => void };
const useConfirmStore = create<{ req: ConfirmReq | null }>(() => ({ req: null }));

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.getState().req?.resolve(false); // only one at a time
    useConfirmStore.setState({ req: { ...opts, resolve } });
  });
}

export function ConfirmHost() {
  const req = useConfirmStore((s) => s.req);
  const done = (ok: boolean) => {
    req?.resolve(ok);
    useConfirmStore.setState({ req: null });
  };
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);
  if (!req) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5 bg-[#081A18]/50 animate-[safar-fade_.2s_both]" onClick={() => done(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={req.title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] bg-white rounded-3xl shadow-2xl p-6 animate-[safar-dialog_.28s_cubic-bezier(.2,.8,.2,1)_both]"
      >
        <span className={cx('w-12 h-12 rounded-2xl inline-flex items-center justify-center', req.danger ? 'bg-[#FCE8E6] text-[#9B1C15]' : 'bg-[#E8F2F0] text-[#00685F]')}>
          <AlertTriangle className="w-5 h-5" />
        </span>
        <h2 className="font-display text-2xl font-semibold text-[#161C23] mt-4">{req.title}</h2>
        {req.body && <div className="text-sm text-[#6D7A77] leading-relaxed mt-2">{req.body}</div>}
        <div className="flex flex-col-reverse sm:flex-row gap-2 mt-6">
          <Button variant="secondary" className="flex-1" onClick={() => done(false)} autoFocus>
            {req.cancelLabel ?? 'Cancel'}
          </Button>
          <Button variant={req.danger ? 'danger' : 'primary'} className="flex-1" onClick={() => done(true)}>
            {req.confirmLabel ?? 'OK'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Dark floating notice (Undo, saved…). Position it with `className`. */
export function Toast({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role="status" className={cx('flex items-center gap-3 rounded-2xl bg-[#161C23] text-white text-sm pl-4 pr-2 py-2 shadow-[0_16px_40px_rgba(22,28,35,.3)] animate-[safar-rise_.4s_cubic-bezier(.2,.8,.2,1)_both]', className)}>
      <span className="flex-1 min-w-0">{children}</span>
      {action}
    </div>
  );
}

/** Page heading used across the redesigned app: eyebrow + serif title + optional actions. */
export function PageHeader({ eyebrow, title, children }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[.08em] text-[#00685F]">{eyebrow}</p>}
        <h1 className="font-display text-[28px] md:text-[32px] leading-tight font-semibold text-[#161C23]">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{children}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer">
      <span>
        <span className="block text-sm font-semibold text-[#161C23]">{label}</span>
        {hint && <span className="block text-xs text-[#6D7A77]">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative w-11 h-6 rounded-full shrink-0 transition-colors', checked ? 'bg-[#00685F]' : 'bg-[#D5CEC4]')}
      >
        <span className={cx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </label>
  );
}

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'px-3 min-h-9 rounded-full text-sm font-semibold border transition-colors',
        selected ? 'bg-night border-night text-white' : 'bg-white border-[#E7DFD5] text-[#161C23] hover:border-[#00685F]/40',
      )}
    >
      {children}
    </button>
  );
}

/** Safar's mark: a gold 8-point star (two squares) with a night-emerald centre. */
export function SafarMark({ className, hole = '#0B3B36' }: { className?: string; hole?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g fill="#C8A15A">
        <rect x="6" y="6" width="12" height="12" rx="1.5" />
        <rect x="6" y="6" width="12" height="12" rx="1.5" transform="rotate(45 12 12)" />
      </g>
      <circle cx="12" cy="12" r="3.2" fill={hole} />
    </svg>
  );
}
