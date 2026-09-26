// Official halal-certification directories we can read for free. For now:
// Singapore's MUIS list of certified eating establishments, via a community
// mirror that re-reads the public MUIS directory daily (JSON on GitHub).
// Matched by postal code + a shared word in the name. Kept in memory per
// server instance for 12 h; any failure just means "no directory signal".
import { similarName } from './halal.js';

const MUIS_URL = 'https://raw.githubusercontent.com/zootato/singapore-halal-establishments/main/halal_establishments.json';
const TTL_MS = 12 * 3_600_000;

interface MuisRow {
  name?: string;
  address?: string;
  postal?: string | number;
  number?: string;
  scheme?: string;
}

let muis: { at: number; byPostal: Map<string, MuisRow[]> } | null = null;

async function loadMuis(): Promise<Map<string, MuisRow[]> | null> {
  if (muis && Date.now() - muis.at < TTL_MS) return muis.byPostal;
  const res = await fetch(MUIS_URL, { signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!res?.ok) return muis?.byPostal ?? null;
  const rows = (await res.json().catch(() => null)) as MuisRow[] | { establishments?: MuisRow[] } | null;
  const list = Array.isArray(rows) ? rows : (rows?.establishments ?? []);
  const byPostal = new Map<string, MuisRow[]>();
  for (const r of list) {
    const postal = String(r.postal ?? /\b(\d{6})\b/.exec(r.address ?? '')?.[1] ?? '').padStart(6, '0');
    if (postal === '000000') continue;
    byPostal.set(postal, [...(byPostal.get(postal) ?? []), r]);
  }
  muis = { at: Date.now(), byPostal };
  return byPostal;
}

/** "MUIS (Singapore) · cert. no." when the place is on the MUIS certified list. */
export async function certifiedListing(place: { name: string; address?: string }): Promise<string | null> {
  const postal = /\bSingapore\s+(\d{6})\b/i.exec(place.address ?? '')?.[1];
  if (!postal) return null;
  const byPostal = await loadMuis();
  const hit = byPostal?.get(postal)?.find((r) => r.name && similarName(r.name, place.name));
  return hit ? `MUIS (Singapore)${hit.number ? ` · cert. ${hit.number}` : ''}` : null;
}
