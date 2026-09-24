// Groq — free-tier backup for when every Gemini model is rate-limited or
// overloaded. OpenAI-compatible chat API. Text goes to a text model, images
// to Groq's vision model; PDFs are converted to text first (Groq can't read
// PDF files). Output is JSON and is validated by the caller exactly like Gemini's.
import type { Part, Schema } from '@google/genai';
import { downModels, markDown } from './aiHealth.js';
import { optionalEnv } from './env.js';

/** Text models to rotate through (each has its own free per-minute/per-day limits). */
const TEXT_MODELS = (): string[] =>
  (process.env.GROQ_TEXT_MODELS || 'openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
const VISION_MODEL = () => process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b';

/** Groq accepts base64 images up to ~4 MB and only common web formats. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const GROQ_IMAGE = /^image\/(jpeg|png|webp|gif)$/;
/** Groq's vision model accepts at most 3 images per request. */
const MAX_IMAGES = 3;

export const groqConfigured = () => !!optionalEnv('GROQ_API_KEY');

/** Gemini's OpenAPI-style schema → plain JSON Schema (for the prompt). */
export function toJsonSchema(s: Schema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (s.type) out.type = String(s.type).toLowerCase();
  if (s.enum) out.enum = s.enum;
  if (s.description) out.description = s.description;
  if (s.properties) out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toJsonSchema(v)]));
  if (s.required) out.required = s.required;
  if (s.items) out.items = toJsonSchema(s.items);
  return out;
}

async function pdfToText(base64: string): Promise<string | null> {
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, 'base64')));
    const { text } = await extractText(pdf, { mergePages: true });
    const clean = String(text).replace(/[ \t]+/g, ' ').trim();
    // Scanned PDFs have no text layer — those really do need Gemini.
    return clean.length >= 40 ? clean.slice(0, 30_000) : null;
  } catch {
    return null;
  }
}

type Content = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

/** Converts Gemini-style parts. Returns null if something can't be sent to Groq. */
async function toContent(parts: Part[]): Promise<{ content: Content[]; hasImage: boolean } | null> {
  const content: Content[] = [];
  let hasImage = false;
  let imageCount = 0;
  for (const p of parts) {
    if (p.text) content.push({ type: 'text', text: p.text });
    else if (p.inlineData?.data && p.inlineData.mimeType) {
      const { mimeType, data } = p.inlineData;
      if (mimeType === 'application/pdf') {
        const text = await pdfToText(data);
        if (!text) return null;
        content.push({ type: 'text', text: `Document text (from PDF):\n${text}` });
      } else if (GROQ_IMAGE.test(mimeType) && (data.length * 3) / 4 <= MAX_IMAGE_BYTES && imageCount < MAX_IMAGES) {
        imageCount++;
        content.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } });
        hasImage = true;
      } else {
        return null; // e.g. HEIC photo or a very large image
      }
    }
  }
  return { content, hasImage };
}

/** Pulls the JSON object out of a reply (drops any <think> block or code fences). */
export function jsonFromReply(reply: string): unknown {
  const noThink = reply.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const start = noThink.indexOf('{');
  const end = noThink.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON in reply');
  return JSON.parse(noThink.slice(start, end + 1));
}

/**
 * Runs the same extraction on Groq. Returns `undefined` when Groq can't take
 * this input (not configured, HEIC photo, scanned PDF) so the caller keeps
 * Gemini's error; throws on real failures.
 */
export async function groqJson(opts: { system: string; parts: Part[]; responseSchema: Schema; timeoutMs: number }): Promise<unknown | undefined> {
  const key = optionalEnv('GROQ_API_KEY');
  if (!key) return undefined;
  const converted = await toContent(opts.parts);
  if (!converted) return undefined;

  const schema = JSON.stringify(toJsonSchema(opts.responseSchema));
  const deadline = Date.now() + opts.timeoutMs;
  // Each Groq model has its own free limits (per minute AND per day), so text
  // work rotates through several; parked (exhausted) models are skipped.
  const candidates = converted.hasImage ? [VISION_MODEL()] : TEXT_MODELS();
  const parked = await downModels(candidates.map((m) => `groq:${m}`));
  const models = candidates.filter((m) => !parked.has(`groq:${m}`));
  if (!models.length) throw Object.assign(new Error('All Groq models are at their free limit right now'), { status: 429 });

  const body = (model: string, jsonMode: boolean) => ({
    model,
    temperature: 0,
    // Extraction needs no chain-of-thought: thinking output breaks strict JSON
    // mode and burns the free tier's output-tokens-per-minute budget.
    ...(/qwen/i.test(model) ? { reasoning_effort: 'none' } : /gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {}),
    max_completion_tokens: 2500,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    messages: [
      { role: 'system', content: `${opts.system}\n\nRespond with ONLY a JSON object that matches this JSON Schema:\n${schema}` },
      { role: 'user', content: converted.content },
    ],
  });

  let lastErr: unknown;
  for (const [idx, model] of models.entries()) {
    const isLast = idx === models.length - 1;
    let jsonMode = true;
    let rateWaits = 0;
    for (;;) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(body(model, jsonMode)),
        signal: AbortSignal.timeout(Math.max(2_000, deadline - Date.now())),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return jsonFromReply(data.choices?.[0]?.message?.content ?? '');
      }
      const text = await res.text().catch(() => '');
      // Strict JSON mode rejected the reply → ask again without it and parse ourselves.
      if (res.status === 400 && jsonMode && /json_validate_failed/.test(text)) {
        jsonMode = false;
        continue;
      }
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      const tokenReset = parseDuration(res.headers.get('x-ratelimit-reset-tokens'));
      const wait = Math.max(retryAfter, tokenReset) + 1;
      if (res.status === 429 || res.status === 413) {
        // Daily limit → park for an hour; per-minute → park briefly. Then use the next model.
        const daily = /per day|TPD|RPD/i.test(text);
        if (res.status === 429) await markDown(`groq:${model}`, 429, daily ? 3600 : Math.max(20, Math.ceil(wait)));
        // Last model left: wait for its per-minute window (up to twice) if the budget allows.
        if (isLast && res.status === 429 && !daily && rateWaits < 2 && wait <= 45 && Date.now() + wait * 1000 + 8_000 < deadline) {
          rateWaits++;
          await new Promise((r) => setTimeout(r, wait * 1000));
          continue;
        }
      }
      lastErr = Object.assign(new Error(`Groq ${model} ${res.status}: ${text.slice(0, 200)}`), { status: res.status });
      break;
    }
  }
  throw lastErr;
}

/**
 * Speech → text with Groq Whisper (free tier, ~25 MB per file). Used for what a
 * creator SAYS in a reel/video (place names are often only spoken).
 * Returns null when Groq isn't configured or the audio can't be transcribed.
 */
export async function transcribe(audio: Buffer, mimeType: string, fileName: string): Promise<string | null> {
  const key = optionalEnv('GROQ_API_KEY');
  if (!key || audio.length > 24 * 1024 * 1024) return null;
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), fileName);
  form.append('model', process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res?.ok) {
    console.warn('[ai] whisper failed', res?.status, (await res?.text().catch(() => ''))?.slice(0, 160));
    return null;
  }
  const text = String(((await res.json()) as { text?: string }).text ?? '').trim();
  return text.length >= 3 ? text.slice(0, 8000) : null;
}

/** "35.73s" / "1m2.5s" / "250ms" → seconds. */
export function parseDuration(v: string | null): number {
  if (!v) return 0;
  let total = 0;
  for (const [, n, unit] of v.matchAll(/([\d.]+)(ms|s|m|h)/g)) total += Number(n) * ({ ms: 0.001, s: 1, m: 60, h: 3600 } as Record<string, number>)[unit];
  return total;
}
