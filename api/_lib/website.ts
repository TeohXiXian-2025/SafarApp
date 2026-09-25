// Reads a restaurant's own website for halal / pork / alcohol statements
// (e.g. "JAKIM certified", "no pork no lard", "we serve beer"). The URL comes
// from Google's listing, so it's untrusted: only public http(s) hosts on
// standard ports, private/loopback addresses refused (checked after DNS),
// short timeout, size cap, no cookies. Returns short snippets around keywords.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 400_000;
const KEYWORDS =
  /\b(halal|jakim|muis|jais|mui|ifanca|hfa|hmc|certif\w*|muslim|pork|babi|lard|bacon|ham|non[- ]halal|no pork|pork[- ]free|alcohol|beer|wine|sake|soju|liquor)\b|豬|猪|清真|ハラール|할랄/i;

/** Loopback, private, link-local, CGNAT, multicast/reserved — never fetched. */
export function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return privateAddress(v.slice(7)); // IPv4-mapped
    return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function safeUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || (u.port && u.port !== '80' && u.port !== '443') || u.username || u.password) return null;
  if (isIP(u.hostname)) return privateAddress(u.hostname) ? null : u;
  const addrs = await lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => privateAddress(a.address))) return null;
  return u;
}

const text = (html: string) =>
  html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

/** Up to 6 short snippets that mention halal/pork/alcohol words; [] if none or unreachable. */
export async function websiteSnippets(raw?: string): Promise<string[]> {
  if (!raw) return [];
  let url = await safeUrl(raw);
  // Follow at most 3 redirects, re-checking each hop.
  for (let hop = 0; url && hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SafarHalalCheck/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(6000),
    }).catch(() => null);
    if (!res) return [];
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      url = next ? await safeUrl(new URL(next, url).href) : null;
      continue;
    }
    if (!res.ok || !/text\/html|text\/plain/.test(res.headers.get('content-type') ?? '')) return [];
    const reader = res.body?.getReader();
    if (!reader) return [];
    let html = '';
    const dec = new TextDecoder();
    while (html.length < MAX_BYTES) {
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (done || !value) break;
      html += dec.decode(value, { stream: true });
    }
    await reader.cancel().catch(() => {});
    const body = text(html);
    const out: string[] = [];
    for (const m of body.matchAll(new RegExp(KEYWORDS.source, 'gi'))) {
      const i = m.index ?? 0;
      const snippet = body.slice(Math.max(0, i - 80), i + 120).trim();
      if (!out.some((s) => s.includes(m[0]) && Math.abs(body.indexOf(s) - i) < 150)) out.push(snippet);
      if (out.length >= 6) break;
    }
    return out;
  }
  return [];
}
