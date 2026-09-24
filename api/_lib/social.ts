// Social import: TikTok / Instagram / Xiaohongshu / YouTube links (or a
// screenshot / pasted caption) → caption text → places via Gemini → Google Places.
import { Type, type Part } from '@google/genai';
import { z } from 'zod';
import type { Destination, IdeaSource, PlaceRef } from '../../src/domain/index.js';
import { extractJson } from './gemini.js';
import { HttpError } from './http.js';
import { categorize, distanceKm, searchPlace } from './places.js';

type SocialType = Extract<IdeaSource['type'], 'tiktok' | 'instagram' | 'xiaohongshu' | 'youtube'>;

// Only these hosts are fetched server-side (no arbitrary URLs → no SSRF).
const HOSTS: [RegExp, SocialType][] = [
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(xiaohongshu\.com|xhslink\.com)$/, 'xiaohongshu'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
];

export function socialType(url: URL): SocialType | null {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return HOSTS.find(([re]) => re.test(url.hostname.toLowerCase()))?.[1] ?? null;
}

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

function meta(html: string, prop: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
  const m = re.exec(html);
  return m ? decode(m[1] ?? m[2] ?? '') : undefined;
}

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  return res?.ok ? ((await res.json().catch(() => null)) as Record<string, string> | null) : null;
}

/** Best-effort caption for a post. Returns null when the platform hides it (then ask for a screenshot). */
export async function fetchCaption(url: URL, type: SocialType): Promise<{ caption: string; author?: string; finalUrl: string } | null> {
  if (type === 'tiktok') {
    const o = await getJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url.href)}`);
    if (o?.title) return { caption: o.title, author: o.author_name, finalUrl: url.href };
  }
  if (type === 'youtube') {
    const o = await getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.href)}`);
    if (o?.title) return { caption: o.title, author: o.author_name, finalUrl: url.href };
  }
  // Open Graph tags (Instagram, Xiaohongshu, and fallback for the others).
  const res = await fetch(url.href, {
    redirect: 'follow',
    headers: {
      // Social sites serve their link-preview tags to preview crawlers.
      'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Accept-Language': 'en,zh;q=0.8,ms;q=0.6',
    },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) return null;
  // Redirects must also land on an allowed host.
  const landed = new URL(res.url);
  if (!socialType(landed)) return null;
  const html = (await res.text()).slice(0, 400_000);
  const caption = [meta(html, 'og:title'), meta(html, 'og:description') ?? meta(html, 'description')]
    .filter((x): x is string => !!x && !/log in|sign up|登录/i.test(x))
    .join('\n')
    .trim();
  return caption.length >= 8 ? { caption: caption.slice(0, 2000), finalUrl: landed.href } : null;
}

// ─── Extraction ─────────────────────────────────────────────────────────────

const SYSTEM = `You extract real, visitable places (restaurants, cafes, attractions, shops, parks, viewpoints, markets, hotels…) mentioned in a travel social-media post (caption, hashtags, or screenshot text — may be in any language).
- Only named places someone could look up on a map. Skip vague ones ("a cute cafe").
- name: the place's name as it would appear on Google Maps (keep original script if that's all you have; add romanisation in brackets if helpful).
- area: neighbourhood/street if mentioned; city and country if known or strongly implied by the trip destinations provided.
- what: under 12 words — what the post says is good there (e.g. "wagyu ramen, halal", "sunset view").
Return at most 10 places, most prominent first. Empty list if none.`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    places: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { name: { type: Type.STRING }, area: { type: Type.STRING }, city: { type: Type.STRING }, country: { type: Type.STRING }, what: { type: Type.STRING } },
        required: ['name'],
      },
    },
  },
  required: ['places'],
};
const Extracted = z.object({
  places: z.array(z.object({ name: z.string(), area: z.string().optional(), city: z.string().optional(), country: z.string().optional(), what: z.string().optional() })).max(15),
});

export interface Candidate {
  place: PlaceRef;
  category: ReturnType<typeof categorize>;
  what?: string;
  /** Distance to the nearest trip destination, km. */
  distanceKm: number;
  nearest: string;
}

export async function extractCandidates(parts: Part[], destinations: Destination[]): Promise<{ candidates: Candidate[]; unresolved: string[] }> {
  const context = `Trip destinations: ${destinations.map((d) => d.address ?? d.name).join('; ')}`;
  const { places } = await extractJson({
    system: SYSTEM,
    parts: [...parts, { text: context }],
    responseSchema,
    validate: Extracted,
  });

  const unresolved: string[] = [];
  const found = await Promise.all(
    places.slice(0, 10).map(async (p) => {
      const where = [p.area, p.city, p.country].filter((x) => x?.trim()).join(', ');
      // Bias the search to the destination the post mentions, else the first one.
      const dest = destinations.find((d) => where && (where.toLowerCase().includes(d.name.toLowerCase()) || d.name.toLowerCase().includes((p.city ?? '').toLowerCase()) && p.city)) ?? destinations[0];
      const hit = await searchPlace(`${p.name}${where ? `, ${where}` : ''}`, dest.location);
      if (!hit) {
        unresolved.push(p.name);
        return null;
      }
      const nearestDest = destinations
        .map((d) => ({ d, km: distanceKm(d.location, hit.location) }))
        .sort((a, b) => a.km - b.km)[0];
      const candidate: Candidate = {
        place: { placeId: hit.placeId, name: hit.name, ...(hit.address ? { address: hit.address } : {}), location: hit.location },
        category: categorize(hit.types ?? []),
        ...(p.what ? { what: p.what.slice(0, 120) } : {}),
        distanceKm: Math.round(nearestDest.km),
        nearest: nearestDest.d.name,
      };
      return candidate;
    }),
  );

  // Same place found twice (e.g. name + romanised name) → keep one.
  const seen = new Set<string>();
  const candidates = found.filter((c): c is Candidate => {
    if (!c || seen.has(c.place.placeId!)) return false;
    seen.add(c.place.placeId!);
    return true;
  });
  return { candidates, unresolved };
}

export function assertAllowed(url: string): { url: URL; type: SocialType } {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    throw new HttpError(400, "That doesn't look like a link.");
  }
  const type = socialType(u);
  if (!type) throw new HttpError(400, 'Paste a TikTok, Instagram, Xiaohongshu or YouTube link — or upload a screenshot instead.');
  return { url: u, type };
}
