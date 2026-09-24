import type { Trip } from '../domain';

/** "1 – 7 Dec 2026" / "28 Nov – 3 Dec 2026". Dates are local calendar days (no timezone shift). */
export function formatDateRange(start: string, end: string, locale?: string): string {
  const toDate = (d: string) => new Date(`${d}T12:00:00Z`);
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return fmt.formatRange(toDate(start), toDate(end));
}

export function tripLengthDays(trip: Pick<Trip, 'startDate' | 'endDate'>): number {
  return Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86_400_000) + 1;
}

/** Days until the trip starts (negative once it has started). Uses the viewer's local date. */
export function daysUntil(date: string): number {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.parse(date) - today) / 86_400_000);
}

export function timeAgo(ms: number): string {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const s = Math.round((ms - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secs] of units) if (Math.abs(s) >= secs) return rtf.format(Math.round(s / secs), unit);
  return 'just now';
}

/** Current wall-clock time in an IANA timezone, e.g. "14:05". */
export function localTimeIn(timezone: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(new Date());
}

/** Common travel currencies first, then every ISO currency the browser knows. */
const COMMON = ['MYR', 'SGD', 'IDR', 'BND', 'USD', 'EUR', 'GBP', 'JPY', 'KRW', 'CNY', 'HKD', 'THB', 'SAR', 'AED', 'TRY', 'AUD'];

export function currencyOptions(): { code: string; label: string }[] {
  const names = new Intl.DisplayNames(undefined, { type: 'currency' });
  const all: string[] = (Intl as any).supportedValuesOf?.('currency') ?? COMMON;
  const rest = all.filter((c) => !COMMON.includes(c));
  return [...COMMON, ...rest].map((code) => ({ code, label: `${code} — ${names.of(code) ?? code}` }));
}
