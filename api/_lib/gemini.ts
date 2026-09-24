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
/** Stay well inside the 60 s function limit, leaving room for Groq. */
const TOTAL_BUDGET_MS = 48_000;
const GROQ_RESERVE_MS = 15_000;

const statusOf = (err: unknown) => Number((err as { status?: number })?.status);
const isTransient = (err: unknown) =>
  [429, 500, 503, 504].includes(statusOf(err)) || (err as Error)?.name === 'AbortError' || /timed? ?out/i.test(String((err as Error)?.message));

type Attempt = { provider: string; text: string } | { provider: string; json: unknown };

/**
 * One attempt per Gemini model (SDK retries off so we control timing), moving
 * on immediately when one is rate-limited or overloaded; then Groq.
 */
async function generate(opts: { system: string; parts: Part[]; responseSchema: Schema }): Promise<Attempt> {
  const started = Date.now();
  const left = () => TOTAL_BUDGET_MS - (Date.now() - started);
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

  try {
    const json = await groqJson({ ...opts, timeoutMs: Math.max(8_000, left()) });
    if (json !== undefined) return { provider: 'groq', json };
  } catch (err) {
    console.warn('[ai] groq failed', (err as Error).message);
    lastErr = err;
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
