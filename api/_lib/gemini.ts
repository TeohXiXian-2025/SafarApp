import { GoogleGenAI, type Part, type Schema } from '@google/genai';
import type { z } from 'zod';
import { requireEnv } from './env.js';
import { HttpError } from './http.js';

let client: GoogleGenAI | undefined;
const ai = () => (client ??= new GoogleGenAI({ apiKey: requireEnv('GEMINI_API_KEY') }));

/**
 * Models to try, in order (override with GEMINI_MODELS="a,b,c"). Each has its
 * own quota, so when one is rate-limited or overloaded the next can answer.
 * "-latest" aliases track new versions; a pinned model is kept as a backstop.
 */
export const geminiModels = (): string[] =>
  (process.env.GEMINI_MODELS || 'gemini-flash-latest,gemini-2.5-flash,gemini-flash-lite-latest')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

const PER_ATTEMPT_MS = 20_000;
/** Stay well inside the 60 s function limit. */
const TOTAL_BUDGET_MS = 45_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const statusOf = (err: unknown) => Number((err as { status?: number })?.status);
const isTransient = (err: unknown) =>
  [429, 500, 503, 504].includes(statusOf(err)) || (err as Error)?.name === 'AbortError' || /timed? ?out/i.test(String((err as Error)?.message));

/**
 * One attempt per model (the SDK's own retries are off so we control timing).
 * Rate-limited (429) → next model immediately; overloaded (503) → brief pause.
 */
async function generateWithFallback(params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>) {
  const started = Date.now();
  let lastErr: unknown;
  for (const model of geminiModels()) {
    const left = TOTAL_BUDGET_MS - (Date.now() - started);
    if (left < 5_000) break;
    try {
      return await ai().models.generateContent({
        ...params,
        model,
        config: {
          ...params.config,
          httpOptions: { timeout: Math.min(PER_ATTEMPT_MS, left), retryOptions: { attempts: 1 } },
        },
      });
    } catch (err) {
      lastErr = err;
      if (!isTransient(err)) break;
      console.warn(`[gemini] ${model} unavailable (${statusOf(err) || (err as Error).name}), trying next model`);
      if (statusOf(err) === 503) await sleep(800);
    }
  }
  throw lastErr;
}

/**
 * Structured extraction: Gemini is constrained to `responseSchema`, then the
 * result is validated with Zod so nothing unchecked reaches the database.
 */
export async function extractJson<S extends z.ZodType>(opts: {
  system: string;
  parts: Part[];
  responseSchema: Schema;
  validate: S;
}): Promise<z.infer<S>> {
  let text: string | undefined;
  try {
    const res = await generateWithFallback({
      contents: [{ role: 'user', parts: opts.parts }],
      config: {
        systemInstruction: opts.system,
        responseMimeType: 'application/json',
        responseSchema: opts.responseSchema,
        temperature: 0,
      },
    });
    text = res.text;
  } catch (err) {
    console.error('[gemini] request failed', err);
    throw new HttpError(503, 'The AI is busy right now. Please try again in a minute — or add it manually.');
  }
  const parsed = opts.validate.safeParse(JSON.parse(text ?? 'null'));
  if (!parsed.success) {
    console.error('[gemini] unexpected output', parsed.error.issues, text?.slice(0, 500));
    throw new HttpError(502, "The AI couldn't read this reliably. Please enter the details manually.");
  }
  return parsed.data;
}
