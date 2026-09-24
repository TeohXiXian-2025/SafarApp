// AI extraction with provider fallback: Gemini models first, then Groq.
import { GoogleGenAI, type Part, type Schema } from '@google/genai';
import type { z } from 'zod';
import { optionalEnv } from './env.js';
import { downModels, markDown, retryAfterFrom } from './aiHealth.js';
import { groqJson } from './groq.js';
import { HttpError } from './http.js';

let client: GoogleGenAI | undefined;
const ai = () => (client ??= new GoogleGenAI({ apiKey: optionalEnv('GEMINI_API_KEY') ?? '' }));

/**
 * Gemini models to try, in order (override with GEMINI_MODELS="a,b,c"). Each
 * has its own free-tier quota; Flash-Lite first because its daily allowance is
 * far larger than the newest Flash's.
 */
export const geminiModels = (): string[] =>
  (process.env.GEMINI_MODELS ?? 'gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-2.5-flash,gemini-flash-latest')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

/** Overloaded models can hang until a 504 — fail fast and move on. */
const PER_ATTEMPT_MS = 12_000;
/** Stay inside the 120 s function limit (vercel.json), leaving room for Groq. */
const TOTAL_BUDGET_MS = 95_000;
const GROQ_RESERVE_MS = 15_000;
const GROQ_IMAGES_PER_CALL = 3;

const statusOf = (err: unknown) => Number((err as { status?: number })?.status);
const isTransient = (err: unknown) =>
  [429, 500, 503, 504].includes(statusOf(err)) || (err as Error)?.name === 'AbortError' || /timed? ?out/i.test(String((err as Error)?.message));

type Attempt = { provider: string; text: string } | { provider: string; json: unknown };

/**
 * One attempt per Gemini model (SDK retries off so we control timing), moving
 * on immediately when one is rate-limited or overloaded; then Groq.
 */
async function generate(opts: {
  system: string;
  parts: Part[];
  responseSchema: Schema;
  imagesOptional?: boolean;
  budgetMs?: number;
  merge?: (results: unknown[]) => unknown;
  groqTextOnly?: boolean;
}): Promise<Attempt> {
  const started = Date.now();
  const budget = Math.min(opts.budgetMs ?? TOTAL_BUDGET_MS, TOTAL_BUDGET_MS);
  const left = () => budget - (Date.now() - started);
  let lastErr: unknown;

  if (optionalEnv('GEMINI_API_KEY')) {
    const models = geminiModels();
    // Skip models another request recently found exhausted/overloaded.
    const down = models.length ? await downModels(models) : new Set<string>();
    for (const model of models.filter((m) => !down.has(m))) {
      if (left() < GROQ_RESERVE_MS) break;
      try {
        const res = await ai().models.generateContent({
          model,
          contents: [{ role: 'user', parts: opts.parts }],
          config: {
            systemInstruction: opts.system,
            responseMimeType: 'application/json',
            responseSchema: opts.responseSchema,
            temperature: 0,
            httpOptions: { timeout: Math.min(PER_ATTEMPT_MS, left() - GROQ_RESERVE_MS / 2), retryOptions: { attempts: 1 } },
          },
        });
        return { provider: model, text: res.text ?? '' };
      } catch (err) {
        lastErr = err;
        if (!isTransient(err)) break;
        console.warn(`[ai] ${model} unavailable (${statusOf(err) || (err as Error).name}), trying next`);
        await markDown(model, statusOf(err) || 504, retryAfterFrom(err));
      }
    }
  }

  // Groq's vision model takes at most 3 images per request and its free tier
  // has a small per-minute budget: send groups of 3 ONE AFTER ANOTHER (it
  // waits when told to slow down) and merge — parallel calls got rate-limited
  // and silently lost the places in the failed groups.
  const isImage = (p: Part) => !!p.inlineData?.mimeType?.startsWith('image/');
  const images = opts.parts.filter(isImage);
  if (opts.groqTextOnly && images.length) {
    // The images' text was already read (OCR) — one cheap text request.
    try {
      const json = await groqJson({ ...opts, parts: opts.parts.filter((p) => !isImage(p)), timeoutMs: Math.max(8_000, left()) });
      if (json !== undefined) return { provider: 'groq(ocr text)', json };
    } catch (err) {
      console.warn('[ai] groq (ocr text) failed', (err as Error).message);
      lastErr = err;
    }
  } else if (images.length > GROQ_IMAGES_PER_CALL && opts.merge) {
    const textParts = opts.parts.filter((p) => !isImage(p));
    const results: unknown[] = [];
    for (let i = 0; i < images.length; i += GROQ_IMAGES_PER_CALL) {
      if (left() < 6_000) break;
      try {
        // Whole remaining budget: Groq may ask us to wait ~30 s between groups.
        const json = await groqJson({ ...opts, parts: [...textParts, ...images.slice(i, i + GROQ_IMAGES_PER_CALL)], timeoutMs: left() });
        if (json !== undefined) results.push(json);
      } catch (err) {
        console.warn(`[ai] groq group ${i / GROQ_IMAGES_PER_CALL + 1} failed`, (err as Error).message);
        lastErr = err;
      }
    }
    if (results.length) {
      const groups = Math.ceil(images.length / GROQ_IMAGES_PER_CALL);
      if (results.length < groups) console.warn(`[ai] groq read ${results.length}/${groups} image groups`);
      return { provider: `groq(${results.length}/${groups} groups)`, json: opts.merge(results) };
    }
  } else {
    try {
      const json = await groqJson({ ...opts, timeoutMs: Math.max(8_000, left()) });
      if (json !== undefined) return { provider: 'groq', json };
    } catch (err) {
      console.warn('[ai] groq failed', (err as Error).message);
      lastErr = err;
    }
  }

  // Images were only a bonus (e.g. a post's cover image next to its caption):
  // when vision is unavailable everywhere, answer from the text alone.
  const textOnly = opts.parts.filter((p) => p.text);
  if (opts.imagesOptional && textOnly.length && textOnly.length < opts.parts.length && left() > 5_000) {
    try {
      const json = await groqJson({ ...opts, parts: textOnly, timeoutMs: Math.max(8_000, left()) });
      if (json !== undefined) return { provider: 'groq-text-only', json };
    } catch (err) {
      console.warn('[ai] groq text-only failed', (err as Error).message);
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('No AI provider available');
}

/**
 * Structured extraction. The model is constrained to `responseSchema` (Gemini)
 * or asked for matching JSON (Groq); either way the result is validated with
 * Zod so nothing unchecked reaches the database.
 */
export async function extractJson<S extends z.ZodType>(opts: {
  system: string;
  parts: Part[];
  responseSchema: Schema;
  validate: S;
  /** The images only supplement the text — fall back to text-only if no vision model is available. */
  imagesOptional?: boolean;
  /** Time available for this call (ms), e.g. what's left of a request that already did slow work. */
  budgetMs?: number;
  /** Combines per-group answers when many images must be read in groups (Groq). */
  merge?: (results: unknown[]) => unknown;
  /** The images' text is already in the parts (OCR): Groq can skip the images. */
  groqTextOnly?: boolean;
}): Promise<z.infer<S>> {
  let attempt: Attempt;
  try {
    attempt = await generate(opts);
  } catch (err) {
    console.error('[ai] all providers failed', err);
    throw new HttpError(503, 'The AI is busy right now. Please try again in a minute — or add it manually.');
  }
  let raw: unknown;
  try {
    raw = 'json' in attempt ? attempt.json : JSON.parse(attempt.text || 'null');
  } catch {
    raw = null;
  }
  const parsed = opts.validate.safeParse(raw);
  if (!parsed.success) {
    console.error(`[ai] unexpected output from ${attempt.provider}`, parsed.error.issues.slice(0, 5), JSON.stringify(raw)?.slice(0, 400));
    throw new HttpError(502, "The AI couldn't read this reliably. Please enter the details manually.");
  }
  return parsed.data;
}
