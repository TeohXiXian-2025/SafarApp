// Document Vault: each traveller's passport, visa and insurance — private to
// them (read only through the API) — and the readiness checks run against the
// trip. The group only ever sees the check labels, never the documents.
import { z } from 'zod';
import { Id, LocalDate, Millis } from './common.js';

export const VaultKind = z.enum(['passport', 'visa', 'insurance']);
export type VaultKind = z.infer<typeof VaultKind>;

export const VAULT_KINDS: Record<VaultKind, string> = { passport: '🛂 Passport', visa: '📄 Visa', insurance: '🛡️ Travel insurance' };

/** Fields the AI reads (all optional — the owner can correct them). Dates are YYYY-MM-DD, countries ISO alpha-2. */
export const VaultFields = z.object({
  fullName: z.string().max(120).optional(),
  number: z.string().max(40).optional(),
  nationality: z.string().length(2).optional(),
  issuingCountry: z.string().length(2).optional(),
  dateOfBirth: LocalDate.optional(),
  /** Visa: the country it's for. */
  country: z.string().length(2).optional(),
  validFrom: LocalDate.optional(),
  /** Passport expiry / visa valid until / insurance cover end. */
  validUntil: LocalDate.optional(),
  /** Insurer or visa type. */
  provider: z.string().max(120).optional(),
});
export type VaultFields = z.infer<typeof VaultFields>;

/** Path (server only): vault/{tripId}_{uid}/docs/{docId} */
export const VaultDoc = z.object({
  id: Id,
  kind: VaultKind,
  fields: VaultFields,
  /** The image/PDF in the owner's private folder; absent when they chose "extract only". */
  storagePath: z.string().max(300).optional(),
  confidence: z.number().min(0).max(1).optional(),
  uploadedAt: Millis,
  updatedAt: Millis,
});
export type VaultDoc = z.infer<typeof VaultDoc>;

export type CheckLevel = 'ok' | 'warn' | 'bad' | 'todo';
export interface ReadyCheck {
  key: string;
  level: CheckLevel;
  /** Private detail for the owner (may contain their dates). */
  text: string;
  /** What the group may see (no numbers, no dates). */
  label: string;
  link?: string;
}

/** Group-visible readiness (trips/{id}/readiness/{uid}) — labels only. */
export const Readiness = z.object({
  uid: Id,
  status: z.enum(['ready', 'check', 'problem']),
  items: z.array(z.object({ level: z.enum(['ok', 'warn', 'bad', 'todo']), label: z.string().max(120) })).max(20),
  updatedAt: Millis,
});
export type Readiness = z.infer<typeof Readiness>;

export const countryName = (code: string) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
};

// Passports print ICAO alpha-3 codes; the ones travellers from this region meet most.
const ALPHA3: Record<string, string> = {
  MYS: 'MY', SGP: 'SG', IDN: 'ID', THA: 'TH', BRN: 'BN', PHL: 'PH', VNM: 'VN', KHM: 'KH', LAO: 'LA', MMR: 'MM', JPN: 'JP', KOR: 'KR', CHN: 'CN',
  HKG: 'HK', TWN: 'TW', IND: 'IN', PAK: 'PK', BGD: 'BD', LKA: 'LK', AUS: 'AU', NZL: 'NZ', USA: 'US', CAN: 'CA', GBR: 'GB', IRL: 'IE', FRA: 'FR',
  DEU: 'DE', D: 'DE', ITA: 'IT', ESP: 'ES', NLD: 'NL', CHE: 'CH', TUR: 'TR', SAU: 'SA', ARE: 'AE', QAT: 'QA', EGY: 'EG', MAR: 'MA', JOR: 'JO',
};

/** "MY", "MYS" or "Malaysia" → "MY" (undefined if unknown). */
export function toCountryCode(v: string): string | undefined {
  const s = v.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(s)) return s;
  if (ALPHA3[s]) return ALPHA3[s];
  for (let a = 65; a < 91; a++)
    for (let b = 65; b < 91; b++) {
      const code = String.fromCharCode(a, b);
      if (countryName(code).toUpperCase() === s) return code;
    }
  return undefined;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "2027-02-01", "01 FEB 2027", "14 MAR/MAC 1999" (bilingual), "01/02/2027" (day first) → ISO date. */
export function toIsoDate(v: string): string | undefined {
  const s = v.trim().toUpperCase();
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[\s./-]*([A-Z]{3})[A-Z]*(?:\/[A-Z]{3,})?[\s./-]*(\d{4})$/))) [d, m, y] = [+r[1], MONTHS.indexOf(r[2]) + 1, +r[3]];
  else if ((r = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else return undefined;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return m >= 1 && m <= 12 && new Date(`${iso}T00:00:00Z`).getUTCDate() === d ? iso : undefined;
}

const addMonths = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

const fmt = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|miss|dr|mstr|bin|binti|bt|b|a\/l|a\/p)\b/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);

/** Same person? Every word of the shorter name appears in the longer (order-free, ignores titles and bin/binti). */
export function namesMatch(a: string, b: string): boolean {
  const [x, y] = [tokens(a), tokens(b)].sort((p, q) => p.length - q.length);
  return x.length > 0 && x.every((t) => y.includes(t));
}

export const VISA_INFO_URL = 'https://www.iatatravelcentre.com/world.php';

interface BookingLike {
  id: string;
  kind: string;
  carrier?: string;
  number?: string;
  passengerNames: string[];
  travellerUids: string[];
  startLocal: string;
  endLocal: string;
  to: { name: string };
}

/**
 * The owner's readiness for this trip. `countries` = the destinations'
 * countries; `nightsWithoutHotel` from the stays; bookings = all trip bookings.
 */
export function readinessChecks(input: {
  uid: string;
  trip: { startDate: string; endDate: string };
  countries: string[];
  docs: Pick<VaultDoc, 'kind' | 'fields'>[];
  bookings: BookingLike[];
  nightsWithoutHotel: string[];
}): ReadyCheck[] {
  const out: ReadyCheck[] = [];
  const { trip } = input;
  const passport = input.docs.filter((d) => d.kind === 'passport').sort((a, b) => (b.fields.validUntil ?? '').localeCompare(a.fields.validUntil ?? ''))[0];
  const nationality = passport?.fields.nationality?.toUpperCase();
  const abroad = [...new Set(input.countries.map((c) => c.toUpperCase()))].filter((c) => c !== nationality);

  // Passport
  if (!passport) {
    out.push({ key: 'passport', level: 'todo', text: 'Add your passport so Safar can check its expiry and your ticket names.', label: 'Passport not added' });
  } else if (!passport.fields.validUntil) {
    out.push({ key: 'passport', level: 'warn', text: "Couldn't read your passport's expiry date — add it by hand.", label: 'Passport expiry unknown' });
  } else if (passport.fields.validUntil < trip.endDate) {
    out.push({ key: 'passport', level: 'bad', text: `Your passport expires on ${fmt(passport.fields.validUntil)}, before the trip ends. Renew it.`, label: 'Passport expires during the trip' });
  } else if (passport.fields.validUntil < addMonths(trip.endDate, 6) && abroad.length) {
    out.push({
      key: 'passport',
      level: 'bad',
      text: `Your passport expires on ${fmt(passport.fields.validUntil)}. Many countries refuse entry with less than 6 months left after you travel — renew it before you go.`,
      label: 'Passport has under 6 months left',
    });
  } else {
    out.push({ key: 'passport', level: 'ok', text: `Passport valid until ${fmt(passport.fields.validUntil)}.`, label: 'Passport ✓' });
  }

  // Names on my tickets
  if (passport?.fields.fullName) {
    const mine = input.bookings.filter((b) => b.kind !== 'hotel' && b.travellerUids.includes(input.uid) && b.passengerNames.length);
    for (const b of mine) {
      if (b.passengerNames.some((n) => namesMatch(n, passport.fields.fullName!))) continue;
      const what = [b.carrier, b.number].filter(Boolean).join(' ') || `${b.kind} to ${b.to.name}`;
      out.push({
        key: `name:${b.id}`,
        level: 'warn',
        text: `The ${what} ticket is for ${b.passengerNames.join(', ')}, which doesn't match your passport (${passport.fields.fullName}). Airlines can refuse boarding — ask them to correct it.`,
        label: 'A ticket name may not match the passport',
      });
    }
  }

  // Visas — a checklist, never a ruling.
  const visas = input.docs.filter((d) => d.kind === 'visa');
  for (const c of abroad) {
    const v = visas.find((x) => x.fields.country?.toUpperCase() === c);
    const name = countryName(c);
    if (!v) {
      out.push({
        key: `visa:${c}`,
        level: 'todo',
        text: `Check whether you need a visa for ${name}${nationality ? ` on a ${countryName(nationality)} passport` : ''}. If you do, add it here.`,
        label: `Visa for ${name}: check`,
        link: VISA_INFO_URL,
      });
    } else if (v.fields.validUntil && v.fields.validUntil < trip.endDate) {
      out.push({ key: `visa:${c}`, level: 'bad', text: `Your ${name} visa ends on ${fmt(v.fields.validUntil)}, before the trip ends.`, label: `Visa for ${name} ends too early` });
    } else if (v.fields.validFrom && v.fields.validFrom > trip.startDate) {
      out.push({ key: `visa:${c}`, level: 'warn', text: `Your ${name} visa starts on ${fmt(v.fields.validFrom)} — after the trip starts. Check your entry date.`, label: `Visa for ${name} starts late` });
    } else {
      out.push({ key: `visa:${c}`, level: 'ok', text: `${name} visa added${v.fields.validUntil ? `, valid until ${fmt(v.fields.validUntil)}` : ''}.`, label: `Visa for ${name} ✓` });
    }
  }

  // Insurance
  const ins = input.docs.filter((d) => d.kind === 'insurance');
  if (!ins.length) {
    out.push({ key: 'insurance', level: 'todo', text: 'No travel insurance added. It covers medical bills, delays and lost bags abroad.', label: 'Insurance not added' });
  } else {
    const covering = ins.find((d) => (!d.fields.validFrom || d.fields.validFrom <= trip.startDate) && (!d.fields.validUntil || d.fields.validUntil >= trip.endDate));
    const i = covering ?? ins[0];
    if (covering) out.push({ key: 'insurance', level: 'ok', text: `Insurance${i.fields.provider ? ` (${i.fields.provider})` : ''} covers the trip.`, label: 'Insurance ✓' });
    else
      out.push({
        key: 'insurance',
        level: 'warn',
        text: `Your insurance covers ${i.fields.validFrom ? fmt(i.fields.validFrom) : '?'} – ${i.fields.validUntil ? fmt(i.fields.validUntil) : '?'}, not the whole trip (${fmt(trip.startDate)} – ${fmt(trip.endDate)}).`,
        label: "Insurance doesn't cover every day",
      });
  }

  // Beds and late arrivals (for trips I'm on).
  if (input.nightsWithoutHotel.length) {
    out.push({ key: 'hotel', level: 'warn', text: `No hotel booked for ${input.nightsWithoutHotel.map(fmt).join(', ')}.`, label: 'Some nights have no hotel' });
  }
  const hotels = input.bookings.filter((b) => b.kind === 'hotel' && b.travellerUids.includes(input.uid));
  for (const b of input.bookings.filter((x) => x.kind !== 'hotel' && x.travellerUids.includes(input.uid))) {
    const [day, time] = b.endLocal.split('T');
    // Landing at 01:00 still means the previous night's check-in.
    const night = time < '04:00' ? new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : day;
    const h = hotels.find((x) => x.startLocal.slice(0, 10) === night);
    if (h && (time >= '23:00' || time < '04:00')) {
      out.push({ key: `late:${b.id}`, level: 'warn', text: `You arrive at ${time} on ${fmt(day)} — tell ${h.to.name} you'll check in late so they keep your room.`, label: 'Late check-in to arrange' });
    }
  }
  return out;
}

export function readinessStatus(checks: Pick<ReadyCheck, 'level'>[]): Readiness['status'] {
  return checks.some((c) => c.level === 'bad') ? 'problem' : checks.some((c) => c.level !== 'ok') ? 'check' : 'ready';
}
