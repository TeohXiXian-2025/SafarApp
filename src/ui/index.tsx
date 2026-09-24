// Small shared UI primitives for the live app. Palette matches the prototype:
// ink #161C23 · muted #6D7A77 · line #E7DFD5 · brand #00685F · sand #FAF8F5
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

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

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-[#6D7A77] uppercase tracking-wider">{label}</span>
      {children}
      {error ? (
        <span className="block text-xs text-[#B3261E]">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-[#6D7A77]">{hint}</span>
      ) : null}
    </label>
  );
}

const inputClass =
  'w-full min-h-11 px-3.5 rounded-xl border border-[#E7DFD5] bg-white text-[#161C23] text-base sm:text-sm placeholder:text-[#9AA5A3] focus:outline-none focus:ring-2 focus:ring-[#00685F]/40 focus:border-[#00685F]';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
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
