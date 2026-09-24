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
/** Monthly cap from env; defaults when unset (600 / 500). Set it to 0 to switch a provider off. */
const DEFAULT_CAP = { apify: 600, scrapecreators: 500 } as const;
const capFor = (provider: 'apify' | 'scrapecreators') => {
  const raw = process.env[provider === 'apify' ? 'APIFY_MONTHLY_CAP' : 'SCRAPECREATORS_MONTHLY_CAP'];
  const n = raw === undefined || raw.trim() === '' ? DEFAULT_CAP[provider] : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

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
    else if (!video && (VIDEO_URL.test(value) || (/^(video_?url|play_?addr|download_?addr|play_?url)$/i.test(key) && /^https:/.test(value)))) video = value;
    if (!location && /location|poi/i.test(path) && /name$/i.test(key)) location = value;
    if (!author && /(^|\.)(username|nickname|unique_id|uniqueId)$/i.test(path)) author = value;
  });
  // Longest caption-ish strings first, de-duplicated.
  const caption = [...new Set(captions)].sort((a, b) => b.length - a.length).slice(0, 2).join('\n\n');
  return { caption: caption.slice(0, 6000), imageUrls: [...images].slice(0, 12), ...(video ? { videoUrl: video } : {}), ...(location ? { location } : {}), ...(author ? { author } : {}) };
}

// ─── Xiaohongshu via Apify ──────────────────────────────────────────────────

/**
 * Expands an xhslink.com / xhslink.cn short link to the full note URL (which
 * carries the xsec_token Apify needs). The redirect service is occasionally
 * slow, so each hop is retried.
 */
async function expandXhsLink(url: URL): Promise<string> {
  if (!/xhslink\.(com|cn)$/i.test(url.hostname)) return url.href;
  let current = url.href;
  for (let hop = 0; hop < 4; hop++) {
    let loc: string | null = null;
    for (let attempt = 0; attempt < 3 && !loc; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 400 * attempt));
      const res = await fetch(current, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' },
        signal: AbortSignal.timeout(8000),
      }).catch((err: Error) => (console.warn('[social] xhslink expand attempt failed', err.name), null));
      if (res && res.status < 300) return current; // not a redirect — this is the page
      loc = res?.headers.get('location') ?? null;
    }
    if (!loc) break;
    current = new URL(loc, current).href;
    if (/xiaohongshu\.com\/(explore|discovery\/item)\//.test(current)) break;
  }
  return current;
}

async function apifyXhs(url: URL): Promise<RichPost | string> {
  const token = optionalEnv('APIFY_TOKEN');
  if (!token) return 'Xiaohongshu reader not configured';
  if ((await downModels(['social:apify'])).size) return 'Xiaohongshu reader paused (out of credit or blocked recently)';
  // Check the link BEFORE spending from the monthly allowance.
  const full = await expandXhsLink(url);
  if (!/xsec_token=/.test(full)) {
    console.warn('[social] xiaohongshu link has no xsec_token', full.slice(0, 120));
    return "Xiaohongshu link couldn't be opened (it may have expired) — copy a fresh one with Share → Copy link";
  }
  if (!(await reserve('apify'))) return 'Xiaohongshu reader monthly limit reached';
  const res = await fetch(`https://api.apify.com/v2/acts/dltik~rednote-xiaohongshu-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=28`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'post', noteUrls: [full] }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res?.ok) {
    if (res && [402, 403, 429].includes(res.status)) await markDown('social:apify', 429, 6 * 3600); // out of credit / blocked
    const body = (await res?.text().catch(() => '')) ?? '';
    console.warn('[social] apify failed', res?.status, body.slice(0, 200));
    return `Xiaohongshu reader failed (${res?.status ?? 'timeout'})`;
  }
  const items = (await res.json().catch(() => [])) as unknown[];
  const item = items?.[0] as Record<string, unknown> | undefined;
  if (!item) return 'Xiaohongshu reader returned nothing for this note';
  const p = parseGeneric(item);
  // Prefer the actor's own fields when present.
  const title = typeof item.title === 'string' ? item.title : '';
  const desc = typeof item.description === 'string' ? item.description : '';
  const tags = Array.isArray(item.hashtags) ? item.hashtags.map(String).join(' #') : '';
  const caption = [title, desc, tags && `#${tags}`].filter(Boolean).join('\n') || p.caption;
  const images = Array.isArray(item.images) ? item.images.map((i) => (typeof i === 'string' ? i : String((i as { url?: string })?.url ?? ''))).filter(Boolean) : p.imageUrls;
  return { provider: 'apify', ...p, caption, imageUrls: images.slice(0, 12) };
}

// ─── Exact parsers for the known response shapes ────────────────────────────

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Instagram GraphQL media (ScrapeCreators /v1/instagram/post → data.xdt_shortcode_media). */
function parseInstagram(json: Json): Omit<RichPost, 'provider'> | null {
  const m: Json | undefined = json?.data?.xdt_shortcode_media ?? json?.data?.shortcode_media ?? json?.xdt_shortcode_media;
  if (!m) return null;
  const caption = String(m.edge_media_to_caption?.edges?.[0]?.node?.text ?? '');
  const children: Json[] = (m.edge_sidecar_to_children?.edges ?? []).map((e: Json) => e.node).filter(Boolean);
  const slides = children.length ? children : [m];
  const imageUrls = slides.map((n) => n.display_url).filter((u): u is string => typeof u === 'string');
  const videoUrl = [m, ...children].map((n) => n.video_url).find((u) => typeof u === 'string');
  return {
    caption: caption.slice(0, 6000),
    imageUrls: imageUrls.slice(0, 12),
    ...(videoUrl ? { videoUrl } : {}),
    ...(m.location?.name ? { location: String(m.location.name) } : {}),
    ...(m.owner?.username ? { author: String(m.owner.username) } : {}),
  };
}

const firstUrl = (list: unknown, prefer = /tiktokcdn|tiktokv|ibyteimg|muscdn/): string | undefined => {
  const urls = Array.isArray(list) ? list.filter((u): u is string => typeof u === 'string' && u.startsWith('https://')) : [];
  return urls.find((u) => prefer.test(new URL(u).hostname)) ?? urls[0];
};

/** TikTok aweme (ScrapeCreators /v2/tiktok/video → aweme_detail). */
function parseTikTok(json: Json): Omit<RichPost, 'provider'> | null {
  const a: Json | undefined = json?.aweme_detail ?? json?.data?.aweme_detail;
  if (!a) return null;
  const photos: string[] = (a.image_post_info?.images ?? [])
    .map((i: Json) => firstUrl(i.display_image?.url_list) ?? firstUrl(i.owner_watermark_image?.url_list))
    .filter(Boolean);
  const cover = firstUrl(a.video?.origin_cover?.url_list) ?? firstUrl(a.video?.cover?.url_list);
  const videoUrl = photos.length ? undefined : firstUrl(a.video?.play_addr?.url_list) ?? firstUrl(a.video?.download_addr?.url_list);
  const poi = a.poi_info?.poi_name ?? a.poi?.poi_name ?? a.poi_info?.address_info?.city;
  return {
    caption: String(a.desc ?? '').slice(0, 6000),
    imageUrls: (photos.length ? photos : cover ? [cover] : []).slice(0, 12),
    ...(videoUrl ? { videoUrl } : {}),
    ...(poi ? { location: String(poi) } : {}),
    ...(a.author?.unique_id ? { author: String(a.author.unique_id) } : {}),
  };
}

// ─── Instagram / TikTok via ScrapeCreators ──────────────────────────────────

async function scrapeCreators(url: URL, type: 'instagram' | 'tiktok'): Promise<RichPost | string> {
  const key = optionalEnv('SCRAPECREATORS_API_KEY');
  if (!key) return 'Instagram/TikTok reader not configured';
  if ((await downModels(['social:scrapecreators'])).size) return 'Instagram/TikTok reader paused (out of credit recently)';
  if (!(await reserve('scrapecreators'))) return 'Instagram/TikTok reader monthly limit reached';
  const endpoint = type === 'instagram' ? '/v1/instagram/post' : '/v2/tiktok/video';
  const res = await fetch(`https://api.scrapecreators.com${endpoint}?url=${encodeURIComponent(url.href)}`, {
    headers: { 'x-api-key': key },
    signal: AbortSignal.timeout(25_000),
  }).catch(() => null);
  if (!res?.ok) {
    if (res && [401, 402, 403, 429].includes(res.status)) await markDown('social:scrapecreators', 429, 6 * 3600);
    console.warn('[social] scrapecreators failed', res?.status);
    return `Instagram/TikTok reader failed (${res?.status ?? 'timeout'})`;
  }
  const json = await res.json().catch(() => null);
  if (!json) return 'Instagram/TikTok reader returned nothing';
  // Known shapes first; the generic walker only if the provider changes format.
  const p = (type === 'instagram' ? parseInstagram(json) : parseTikTok(json)) ?? parseGeneric(json);
  return p.caption || p.imageUrls.length || p.videoUrl ? { provider: 'scrapecreators', ...p } : 'Instagram/TikTok reader found no content (private or deleted post?)';
}

/**
 * Full post (caption + all images + video) when a free-credit provider can
 * supply it; otherwise `skipped` says why (shown to the user, never silent).
 */
export async function fetchRichPost(url: URL, type: SocialType): Promise<{ post: RichPost | null; skipped?: string }> {
  try {
    const r = type === 'xiaohongshu' ? await apifyXhs(url) : type === 'instagram' || type === 'tiktok' ? await scrapeCreators(url, type) : null;
    if (r === null) return { post: null };
    return typeof r === 'string' ? { post: null, skipped: r } : { post: r };
  } catch (err) {
    console.warn('[social] provider error', (err as Error).message);
    return { post: null, skipped: 'Post reader error' };
  }
}
