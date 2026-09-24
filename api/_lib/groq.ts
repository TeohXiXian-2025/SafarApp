// Groq — free-tier backup for when every Gemini model is rate-limited or
// overloaded. OpenAI-compatible chat API. Text goes to a text model, images
// to Groq's vision model; PDFs are converted to text first (Groq can't read
// PDF files). Output is JSON and is validated by the caller exactly like Gemini's.
import type { Part, Schema } from '@google/genai';
import { optionalEnv } from './env.js';

const TEXT_MODEL = () => process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b';
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
  const model = converted.hasImage ? VISION_MODEL() : TEXT_MODEL();
  const deadline = Date.now() + opts.timeoutMs;
  const body = (jsonMode: boolean) => ({
    model,
    temperature: 0,
    // Extraction needs no chain-of-thought: thinking output breaks strict JSON
    // mode and burns the free tier's output-tokens-per-minute budget.
    ...(/qwen/i.test(model) ? { reasoning_effort: 'none' } : /gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {}),
    max_completion_tokens: 2500,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    messages: [
      { role: 'system', content: `${opts.system}

Respond with ONLY a JSON object that matches this JSON Schema:
${schema}` },
      { role: 'user', content: converted.content },
    ],
  });

  let jsonMode = true;
  let rateRetried = false;
  for (;;) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body(jsonMode)),
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
    // Free-tier per-minute limits reset quickly — wait once if Groq says it's short.
    const wait = Number(res.headers.get('retry-after'));
    if (res.status === 429 && !rateRetried && wait > 0 && wait <= 12 && Date.now() + wait * 1000 + 3_000 < deadline) {
      rateRetried = true;
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    throw Object.assign(new Error(`Groq ${model} ${res.status}: ${text.slice(0, 200)}`), { status: res.status });
  }
}
