// Text in images (OCR) with Google Cloud Vision — 1,000 images/month free,
// strong on Chinese/Malay/English. Travel posts usually PRINT the place names
// on their photos, and reading that text is far cheaper and faster than a
// vision model (Groq's free vision tier only fits ~3 photos a minute).
// Needs "Cloud Vision API" enabled for the server key's project and allowed
// in GOOGLE_MAPS_SERVER_KEY's API restrictions; otherwise it's skipped.
import type { Part } from '@google/genai';
import { downModels, markDown } from './aiHealth.js';
import { optionalEnv } from './env.js';

const MAX_PER_REQUEST = 16;

export async function ocrImages(images: Part[]): Promise<(string | null)[]> {
  const key = optionalEnv('GOOGLE_MAPS_SERVER_KEY');
  const out: (string | null)[] = images.map(() => null);
  if (!key || !images.length || (await downModels(['ocr:vision'])).size) return out;

  for (let i = 0; i < images.length; i += MAX_PER_REQUEST) {
    const batch = images.slice(i, i + MAX_PER_REQUEST);
    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requests: batch.map((p) => ({
          image: { content: p.inlineData?.data },
          features: [{ type: 'TEXT_DETECTION' }],
          imageContext: { languageHints: ['en', 'zh', 'ms', 'ja', 'ko', 'th', 'ar'] },
        })),
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res?.ok) {
      // Not enabled / not allowed for this key → stop trying for a while.
      if (res && (res.status === 403 || res.status === 400)) await markDown('ocr:vision', 429, 3600);
      console.warn('[ocr] vision failed', res?.status, (await res?.text().catch(() => ''))?.slice(0, 160));
      return out;
    }
    const body = (await res.json()) as { responses?: { fullTextAnnotation?: { text?: string } }[] };
    body.responses?.forEach((r, j) => {
      const text = r.fullTextAnnotation?.text?.replace(/\s+\n/g, '\n').trim();
      if (text && text.length >= 3) out[i + j] = text.slice(0, 1500);
    });
  }
  return out;
}
