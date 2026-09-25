// Small shared UI primitives for the live app. Palette matches the prototype:
// ink #161C23 · muted #6D7A77 · line #E7DFD5 · brand #00685F · sand #FAF8F5
import { Loader2, X } from 'lucide-react';
import { useEffect } from 'react';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode, SelectHTMLAttributes } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-[#00685F] text-white hover:bg-[#00564F] disabled:bg-[#00685F]/50',
  secondary: 'bg-white text-[#161C23] border border-[#E7DFD5] hover:bg-[#F3EFE9] disabled:opacity-50',
  ghost: 'text-[#00685F] hover:bg-[#00685F]/10 disabled:opacity-50',
  danger: 'bg-[#B3261E] text-white hover:bg-[#8C1D18] disabled:bg-[#B3261E]/50',
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
 * Bottom sheet on phones, centred dialog on larger screens.
 * Closes on backdrop tap / Escape.
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

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cx(
          'w-full bg-[#FAF8F5] rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92dvh] flex flex-col',
          wide ? 'md:max-w-2xl' : 'md:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-[#E7DFD5]">
          <h2 className="font-bold text-[#161C23]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-black/5 inline-flex items-center justify-center text-[#6D7A77]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] min-w-0">{children}</div>
      </div>
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
        selected ? 'bg-[#00685F] border-[#00685F] text-white' : 'bg-white border-[#E7DFD5] text-[#161C23] hover:border-[#00685F]/40',
      )}
    >
      {children}
    </button>
  );
}
