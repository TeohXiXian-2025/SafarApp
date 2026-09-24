// Layer 2 of social import: third-party readers that return a post's full
// caption, ALL images and the video — used within free credits only.
//   Xiaohongshu → Apify actor dltik/rednote-xiaohongshu-scraper (no cookies, ~$0.005/note)
//   Instagram / TikTok → ScrapeCreators (/v1/instagram/post, /v2/tiktok/video)
// Every call is counted per calendar month (Upstash) and stops at the cap in
// .env (APIFY_MONTHLY_CAP / SCRAPECREATORS_MONTHLY_CAP), so free credits are
// never exhausted by surprise. When a provider is unavailable the import simply
// continues with the free built-in readers (layer 1) and screenshots (layer 3).
import { downModels, markDown } from './aiHealth.js';
import { optionalEnv } from './env.js';
import type { SocialType } from './social.js';

export interface RichPost {
  provider: 'apify' | 'scrapecreators';
  caption: string;
  imageUrls: string[];
  videoUrl?: string;
  location?: string;
  author?: string;
}

// ─── Monthly usage caps ─────────────────────────────────────────────────────

async function redis(commands: (string | number)[][]): Promise<{ result: unknown }[] | null> {
  const url = optionalEnv('UPSTASH_REDIS_REST_URL');
  const token = optionalEnv('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return null;
  const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(1500),
  }).catch(() => null);
  return res?.ok ? ((await res.json()) as { result: unknown }[]) : null;
}

const monthKey = (provider: string) => `social:usage:${provider}:${new Date().toISOString().slice(0, 7)}`;
const capFor = (provider: 'apify' | 'scrapecreators') =>
  Number(process.env[provider === 'apify' ? 'APIFY_MONTHLY_CAP' : 'SCRAPECREATORS_MONTHLY_CAP'] ?? 0) || 0;

/** Reserves one call within the monthly cap. False when capped (or no Redis to count with). */
async function reserve(provider: 'apify' | 'scrapecreators'): Promise<boolean> {
  const cap = capFor(provider);
  if (cap <= 0) return false;
  const r = await redis([
    ['INCR', monthKey(provider)],
    ['EXPIRE', monthKey(provider), 40 * 86400],
  ]);
  if (!r) return false; // can't count → don't spend credits blindly
  const used = Number(r[0]?.result ?? 0);
  if (used > cap) {
    console.warn(`[social] ${provider} monthly cap reached (${cap})`);
    return false;
  }
  return true;
}

/** Current month's usage per provider — for the health endpoint / admin view. */
export async function socialUsage() {
  const r = await redis([
    ['GET', monthKey('apify')],
    ['GET', monthKey('scrapecreators')],
  ]);
  return {
    apify: { used: Number(r?.[0]?.result ?? 0), cap: capFor('apify'), configured: !!optionalEnv('APIFY_TOKEN') },
    scrapecreators: { used: Number(r?.[1]?.result ?? 0), cap: capFor('scrapecreators'), configured: !!optionalEnv('SCRAPECREATORS_API_KEY') },
  };
}

// ─── Defensive response parsing (providers change field names) ──────────────

const IMAGE_URL = /^https:\/\/[^\s"]+\.(?:jpe?g|webp|png|heic)(?:[?#][^\s"]*)?$|^https:\/\/[^\s"]*(?:xhscdn|sns-img|sns-webpic|cdninstagram|fbcdn|tiktokcdn|muscdn|ibyteimg)[^\s"]*$/i;
const VIDEO_URL = /^https:\/\/[^\s"]+(?:\.mp4|\/video\/|play_?addr|videoplayback|\.m3u8)[^\s"]*/i;
const CAPTION_KEYS = /^(caption|text|desc|description|content|contentText|title)$/i;

function walk(node: unknown, visit: (key: string, value: unknown, path: string) => void, path = '', depth = 0) {
  if (depth > 12 || node === null || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    visit(k, v, p);
    walk(v, visit, p, depth + 1);
  }
}

function parseGeneric(json: unknown): Omit<RichPost, 'provider'> {
  const captions: string[] = [];
  const images = new Set<string>();
  let video: string | undefined;
  let location: string | undefined;
  let author: string | undefined;
  walk(json, (key, value, path) => {
    if (typeof value !== 'string') return;
    // Skip comments, author avatars and "related posts".
    if (/comment|avatar|profile_pic|related|recommend|music|author\.(?!nickname|username|unique)/i.test(path)) return;
    if (CAPTION_KEYS.test(key) && value.length >= 4 && !/^https?:/.test(value)) captions.push(value);
    else if (IMAGE_URL.test(value) && !/avatar|profile|s150x150|_s\.jpg/i.test(value)) images.add(value);
    else if (!video && VIDEO_URL.test(value)) video = value;
    if (!location && /location|poi/i.test(path) && /name$/i.test(key)) location = value;
    if (!author && /(^|\.)(username|nickname|unique_id|uniqueId)$/i.test(path)) author = value;
  });
  // Longest caption-ish strings first, de-duplicated.
  const caption = [...new Set(captions)].sort((a, b) => b.length - a.length).slice(0, 2).join('\n\n');
  return { caption: caption.slice(0, 6000), imageUrls: [...images].slice(0, 12), ...(video ? { videoUrl: video } : {}), ...(location ? { location } : {}), ...(author ? { author } : {}) };
}

// ─── Xiaohongshu via Apify ──────────────────────────────────────────────────

/** Expands an xhslink.com short link to the full note URL (which carries xsec_token). */
async function expandXhsLink(url: URL): Promise<string> {
  if (!/xhslink\.com$/i.test(url.hostname)) return url.href;
  let current = url.href;
  for (let i = 0; i < 4; i++) {
    const res = await fetch(current, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X)' }, signal: AbortSignal.timeout(6000) }).catch(() => null);
    const loc = res?.headers.get('location');
    if (!loc) break;
    current = new URL(loc, current).href;
    if (/xiaohongshu\.com\/(explore|discovery\/item)\//.test(current)) break;
  }
  return current;
}

async function apifyXhs(url: URL): Promise<RichPost | null> {
  const token = optionalEnv('APIFY_TOKEN');
  if (!token || (await downModels(['social:apify'])).size || !(await reserve('apify'))) return null;
  const full = await expandXhsLink(url);
  if (!/xsec_token=/.test(full)) {
    console.warn('[social] xiaohongshu link has no xsec_token — Apify needs the full share link');
    return null;
  }
  const res = await fetch(`https://api.apify.com/v2/acts/dltik~rednote-xiaohongshu-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=28`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'post', noteUrls: [full] }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res?.ok) {
    if (res && [402, 403, 429].includes(res.status)) await markDown('social:apify', 429, 6 * 3600); // out of credit / blocked
    console.warn('[social] apify failed', res?.status);
    return null;
  }
  const items = (await res.json().catch(() => [])) as unknown[];
  const item = items?.[0] as Record<string, unknown> | undefined;
  if (!item) return null;
  const p = parseGeneric(item);
  // Prefer the actor's own fields when present.
  const title = typeof item.title === 'string' ? item.title : '';
  const desc = typeof item.description === 'string' ? item.description : '';
  const tags = Array.isArray(item.hashtags) ? item.hashtags.map(String).join(' #') : '';
  const caption = [title, desc, tags && `#${tags}`].filter(Boolean).join('\n') || p.caption;
  const images = Array.isArray(item.images) ? item.images.map((i) => (typeof i === 'string' ? i : String((i as { url?: string })?.url ?? ''))).filter(Boolean) : p.imageUrls;
  return { provider: 'apify', ...p, caption, imageUrls: images.slice(0, 12) };
}

// ─── Instagram / TikTok via ScrapeCreators ──────────────────────────────────

async function scrapeCreators(url: URL, type: 'instagram' | 'tiktok'): Promise<RichPost | null> {
  const key = optionalEnv('SCRAPECREATORS_API_KEY');
  if (!key || (await downModels(['social:scrapecreators'])).size || !(await reserve('scrapecreators'))) return null;
  const endpoint = type === 'instagram' ? '/v1/instagram/post' : '/v2/tiktok/video';
  const res = await fetch(`https://api.scrapecreators.com${endpoint}?url=${encodeURIComponent(url.href)}`, {
    headers: { 'x-api-key': key },
    signal: AbortSignal.timeout(25_000),
  }).catch(() => null);
  if (!res?.ok) {
    if (res && [401, 402, 403, 429].includes(res.status)) await markDown('social:scrapecreators', 429, 6 * 3600);
    console.warn('[social] scrapecreators failed', res?.status);
    return null;
  }
  const json = await res.json().catch(() => null);
  if (!json) return null;
  const p = parseGeneric(json);
  return p.caption || p.imageUrls.length || p.videoUrl ? { provider: 'scrapecreators', ...p } : null;
}

/** Full post (caption + all images + video) when a free-credit provider can supply it. */
export async function fetchRichPost(url: URL, type: SocialType): Promise<RichPost | null> {
  try {
    if (type === 'xiaohongshu') return await apifyXhs(url);
    if (type === 'instagram' || type === 'tiktok') return await scrapeCreators(url, type);
  } catch (err) {
    console.warn('[social] provider error', (err as Error).message);
  }
  return null;
}
