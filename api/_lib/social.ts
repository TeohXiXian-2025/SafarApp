// Social import: a TikTok / Instagram / Xiaohongshu / YouTube link (or the
// app's copied "share text"), screenshots, or a pasted caption
// → caption text + cover image → specific places via AI → Google Places.
import { Type, type Part } from '@google/genai';
import { z } from 'zod';
import type { Destination, IdeaSource, PlaceRef } from '../../src/domain/index.js';
import { extractJson } from './gemini.js';
import { HttpError } from './http.js';
import { categorize, distanceKm, searchPlace } from './places.js';

export type SocialType = Extract<IdeaSource['type'], 'tiktok' | 'instagram' | 'xiaohongshu' | 'youtube'>;

// Only these hosts are fetched server-side (no arbitrary URLs → no SSRF).
const HOSTS: [RegExp, SocialType][] = [
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(xiaohongshu\.com|xhslink\.com)$/, 'xiaohongshu'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
];
// Cover images/thumbnails are only downloaded from these CDNs.
const IMAGE_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net|tiktokcdn(-[a-z]+)?\.com|ibyteimg\.com|muscdn\.com|ytimg\.com|xhscdn\.com|xhscdn\.net)$/;
/** Video/audio downloads (for speech-to-text) — same CDNs. */
const MEDIA_HOSTS = IMAGE_HOSTS;

export function socialType(url: URL): SocialType | null {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return HOSTS.find(([re]) => re.test(url.hostname.toLowerCase()))?.[1] ?? null;
}

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

function meta(html: string, prop: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
  const m = re.exec(html);
  return m ? decode(m[1] ?? m[2] ?? '') : undefined;
}

const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';

async function getText(url: string, ua = BROWSER_UA): Promise<{ html: string; finalUrl: string } | null> {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': ua, 'Accept-Language': 'en,zh;q=0.8,ms;q=0.6' }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return null;
  return { html: (await res.text()).slice(0, 600_000), finalUrl: res.url };
}

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  return res?.ok ? ((await res.json().catch(() => null)) as Record<string, string> | null) : null;
}

/** Downloads a cover image/thumbnail (allow-listed CDNs, ≤ 3 MB) as an AI image part. */
export async function imagePart(src?: string): Promise<Part | null> {
  if (!src) return null;
  let u: URL;
  try {
    u = new URL(decode(src));
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !IMAGE_HOSTS.test(u.hostname)) return null;
  const res = await fetch(u, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(6000) }).catch(() => null);
  const type = res?.headers.get('content-type')?.split(';')[0] ?? '';
  if (!res?.ok || !/^image\/(jpeg|png|webp|heic)$/.test(type)) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 3 * 1024 * 1024) return null;
  return { inlineData: { mimeType: type, data: buf.toString('base64') } };
}

/** Downloads a post's video (allow-listed CDNs, ≤ 24 MB) — only its audio is used (speech-to-text). */
export async function downloadMedia(src: string): Promise<{ data: Buffer; mimeType: string } | null> {
  let u: URL;
  try {
    u = new URL(decode(src));
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !MEDIA_HOSTS.test(u.hostname)) return null;
  const res = await fetch(u, { headers: { 'User-Agent': BROWSER_UA, Referer: `https://${u.hostname}/` }, signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!res?.ok) return null;
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > 24 * 1024 * 1024) return null;
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > 24 * 1024 * 1024 || data.length < 1000) return null;
  return { data, mimeType: res.headers.get('content-type')?.split(';')[0] || 'video/mp4' };
}

export interface FetchedPost {
  caption: string;
  author?: string;
  finalUrl: string;
  /** Cover image / thumbnail — place names are often printed on it. */
  image?: Part;
}

/** Instagram's embed page carries the FULL caption (the preview tags are cut at ~150 chars). */
async function instagram(url: URL): Promise<FetchedPost | null> {
  const code = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1];
  if (!code) return null;
  const page = await getText(`https://www.instagram.com/p/${code}/embed/captioned/`);
  if (!page) return null;
  const raw = /class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments/.exec(page.html)?.[1] ?? /class="Caption"[^>]*>([\s\S]*?)<\/div>/.exec(page.html)?.[1];
  const author = /class="CaptionUsername"[^>]*>([^<]+)</.exec(page.html)?.[1];
  const caption = raw
    ? decode(raw.replace(/<br\s*\/?>/gi, '\n').replace(/<a [^>]*class="CaptionUsername"[^>]*>[^<]*<\/a>/, '').replace(/<[^>]+>/g, ''))
        .replace(/View all \d+ comments?/i, '')
        .trim()
    : '';
  const image = await imagePart(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/.exec(page.html)?.[1]);
  if (!caption && !image) return null;
  return { caption, ...(author ? { author } : {}), finalUrl: url.href, ...(image ? { image } : {}) };
}

/** Best-effort caption (+ cover image) for a post. Null when the platform hides it. */
export async function fetchPost(url: URL, type: SocialType): Promise<FetchedPost | null> {
  if (type === 'instagram') return instagram(url);
  if (type === 'tiktok' || type === 'youtube') {
    const endpoint = type === 'tiktok' ? 'https://www.tiktok.com/oembed?url=' : 'https://www.youtube.com/oembed?format=json&url=';
    const o = await getJson(`${endpoint}${encodeURIComponent(url.href)}`);
    if (o?.title) {
      const image = await imagePart(o.thumbnail_url);
      return { caption: o.title, author: o.author_name, finalUrl: url.href, ...(image ? { image } : {}) };
    }
  }
  // Open Graph tags (fallback; Xiaohongshu usually blocks servers entirely).
  const page = await getText(url.href, 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)');
  if (!page) return null;
  const landed = new URL(page.finalUrl);
  if (!socialType(landed) || /\/404|sec_/.test(landed.pathname)) return null;
  const caption = [meta(page.html, 'og:title'), meta(page.html, 'og:description') ?? meta(page.html, 'description')]
    .filter((x): x is string => !!x && !/log in|sign up|登录|小红书_沪ICP/i.test(x))
    .join('\n')
    .trim();
  const image = await imagePart(meta(page.html, 'og:image'));
  return caption.length >= 8 || image ? { caption: caption.slice(0, 4000), finalUrl: landed.href, ...(image ? { image } : {}) } : null;
}

// ─── Parsing what the user pasted ───────────────────────────────────────────

// Boilerplate the Xiaohongshu / Douyin / TikTok apps append to copied share text.
const SHARE_BOILERPLATE = [
  /复制本条信息[，,]?\s*打开【?小红书】?\s*App\s*查看精彩内容[！!]?/gi,
  /复制这条信息[\s\S]{0,40}?打开[\s\S]{0,20}?查看[\s\S]{0,10}?[！!]?/gi,
  /打开【?小红书】?App[\s\S]{0,20}/gi,
];

/**
 * Accepts a bare link OR an app's copied share text ("Title … http://xhslink.com/…
 * 复制本条信息…"). Returns the link plus any post text found around it.
 */
export function parseShareInput(input: string): { url: URL; type: SocialType; extraText: string } {
  const match = /https?:\/\/[^\s，。！!、"'<>）)】]+/i.exec(input);
  if (!match) throw new HttpError(400, "We couldn't find a link in that. Paste a TikTok, Instagram, Xiaohongshu or YouTube link — or upload screenshots.");
  let url: URL;
  try {
    url = new URL(match[0]);
  } catch {
    throw new HttpError(400, "That link doesn't look right.");
  }
  const type = socialType(url);
  if (!type) throw new HttpError(400, 'Paste a TikTok, Instagram, Xiaohongshu or YouTube link — or upload screenshots instead.');
  let extraText = input.replace(match[0], ' ');
  for (const re of SHARE_BOILERPLATE) extraText = extraText.replace(re, ' ');
  extraText = extraText.replace(/\s+/g, ' ').trim();
  return { url, type, extraText: extraText.length >= 4 ? extraText.slice(0, 4000) : '' };
}

// ─── Extraction ─────────────────────────────────────────────────────────────

const SYSTEM = `You extract SPECIFIC, visitable places from a travel social-media post (caption, hashtags, cover image, screenshots — any language, e.g. Chinese, Malay, English).
Include: restaurants, cafes, hawker stalls, street-food spots, markets, attractions, theme parks, museums, beaches, waterfalls, viewpoints, parks, cable cars, bridges, islands-hopping/boat tours, night markets, events/festival venues, shops, hotels/resorts.
Rules:
- Only places with a proper name someone could look up on a map. Skip vague ones ("a cute cafe", "the beach").
- NEVER return cities, towns, states, provinces, regions, countries or whole islands (e.g. "Langkawi", "Kedah", "Bali", "Tokyo", "Jeju") — use them only as the area of other places.
- name: the place's name as it appears on Google Maps (keep original script if that's all you have; add romanisation/English in brackets when helpful).
- area: neighbourhood/street/town if mentioned, then city/island and country (use the trip destinations to disambiguate).
- what: under 12 words — what the post says is good there (e.g. "wagyu ramen, halal", "sunset view", "RM90 cable car").
Return at most 12 places, in the order the post mentions them. Empty list if there are no specific places.`;

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
  places: z.array(z.object({ name: z.string(), area: z.string().optional(), city: z.string().optional(), country: z.string().optional(), what: z.string().optional() })).max(20),
});

/**
 * A city/state/country/archipelago result ("Langkawi", "Kedah") — not a place
 * to visit. Beaches, parks, waterfalls etc. (natural features, POIs) are kept.
 */
const REGION_TYPES = ['locality', 'country', 'administrative_area_level_1', 'administrative_area_level_2', 'administrative_area_level_3', 'archipelago', 'colloquial_area'];
export function isRegion(types: string[] = []): boolean {
  if (types.some((t) => REGION_TYPES.includes(t))) return true;
  const visitable = types.some((t) => ['point_of_interest', 'establishment', 'natural_feature', 'tourist_attraction', 'park'].includes(t));
  return types.includes('political') && !visitable;
}

const IMAGES_PER_CALL = 3;
const MAX_PLACES = 15;
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export interface Candidate {
  place: PlaceRef;
  category: ReturnType<typeof categorize>;
  what?: string;
  /** Distance to the nearest trip destination, km. */
  distanceKm: number;
  nearest: string;
}

export async function extractCandidates(
  parts: Part[],
  destinations: Destination[],
  opts: { imagesOptional?: boolean; budgetMs?: number } = {},
): Promise<{ candidates: Candidate[]; unresolved: string[]; skippedRegions: string[] }> {
  const context = `Trip destinations: ${destinations.map((d) => d.address ?? d.name).join('; ')}`;
  const images = parts.filter((p) => p.inlineData?.mimeType?.startsWith('image/'));
  const others = parts.filter((p) => !p.inlineData?.mimeType?.startsWith('image/'));
  // Many frames (e.g. a screen recording): read them in small batches in
  // parallel — keeps each request within every vision model's image limit.
  const batches = images.length > IMAGES_PER_CALL ? chunk(images, IMAGES_PER_CALL).map((b) => [...others, ...b]) : [parts];
  const results = await Promise.allSettled(
    batches.map((batch) =>
      extractJson({
        system: SYSTEM,
        parts: [...batch, { text: context }],
        responseSchema,
        validate: Extracted,
        imagesOptional: opts.imagesOptional,
        budgetMs: opts.budgetMs,
      }),
    ),
  );
  const ok = results.filter((r): r is PromiseFulfilledResult<z.infer<typeof Extracted>> => r.status === 'fulfilled');
  if (!ok.length) throw (results[0] as PromiseRejectedResult).reason;
  // Merge batches, keeping first-mention order and dropping repeats by name.
  const seenNames = new Set<string>();
  const places = ok
    .flatMap((r) => r.value.places)
    .filter((p) => {
      const k = p.name.trim().toLowerCase();
      if (seenNames.has(k)) return false;
      seenNames.add(k);
      return true;
    });

  const unresolved: string[] = [];
  const skippedRegions: string[] = [];
  const found = await Promise.all(
    places.slice(0, MAX_PLACES).map(async (p) => {
      const where = [p.area, p.city, p.country].filter((x) => x?.trim()).join(', ');
      const lower = where.toLowerCase();
      // Bias the search to the destination the post mentions, else the first one.
      const dest = destinations.find((d) => lower.includes(d.name.toLowerCase())) ?? destinations[0];
      const hit = await searchPlace(`${p.name}${where ? `, ${where}` : ''}`, dest.location);
      if (!hit) {
        unresolved.push(p.name);
        return null;
      }
      if (isRegion(hit.types)) {
        skippedRegions.push(hit.name);
        return null;
      }
      const nearestDest = destinations.map((d) => ({ d, km: distanceKm(d.location, hit.location) })).sort((a, b) => a.km - b.km)[0];
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
  return { candidates, unresolved, skippedRegions };
}
