import { BedDouble, Bus, Plane, Ship, TrainFront, type LucideIcon } from 'lucide-react';
import { metersBetween, type Booking, type BookingKind, type GeoPoint } from '../../domain';

export const KIND: Record<BookingKind, { label: string; icon: LucideIcon; carrier: string; number: string }> = {
  flight: { label: 'Flight', icon: Plane, carrier: 'Airline', number: 'Flight no.' },
  train: { label: 'Train', icon: TrainFront, carrier: 'Operator', number: 'Train no.' },
  bus: { label: 'Bus', icon: Bus, carrier: 'Operator', number: 'Bus / route no.' },
  ferry: { label: 'Ferry', icon: Ship, carrier: 'Operator', number: 'Sailing no.' },
  hotel: { label: 'Hotel', icon: BedDouble, carrier: 'Hotel', number: '' },
};

/** "Asia/Kuala_Lumpur" → "Kuala Lumpur" */
export const tzCity = (tz: string) => tz.split('/').pop()!.replace(/_/g, ' ');

/**
 * What to call a place's clock: the trip city near it that shares its timezone
 * ("Osaka time", not "Tokyo time"), else the timezone's own city.
 */
export function clockName(tz: string, at: GeoPoint | undefined, destinations: { name: string; timezone: string; location: GeoPoint }[]): string {
  const same = destinations.filter((d) => d.timezone === tz && (!at || metersBetween(d.location, at) < 200_000));
  if (!same.length) return tzCity(tz);
  return (at ? [...same].sort((a, b) => metersBetween(a.location, at) - metersBetween(b.location, at)) : same)[0].name;
}

/** Local wall-clock parts of an ISO instant, exactly as stored for that place. */
export const localParts = (iso: string) => ({ date: iso.slice(0, 10), time: iso.slice(11, 16) });

export function formatDay(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/** Whole-day difference between two local dates ("+1" for next-day arrivals). */
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export function bookingTitle(b: Pick<Booking, 'kind' | 'carrier' | 'number' | 'to'>) {
  if (b.kind === 'hotel') return b.carrier || b.to.name;
  return [b.carrier, b.number].filter(Boolean).join(' ') || KIND[b.kind].label;
}
