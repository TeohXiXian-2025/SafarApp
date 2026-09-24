import { GoogleGenAI, type Part, type Schema } from '@google/genai';
import type { z } from 'zod';
import { requireEnv } from './env.js';
import { HttpError } from './http.js';

let client: GoogleGenAI | undefined;
const ai = () => (client ??= new GoogleGenAI({ apiKey: requireEnv('GEMINI_API_KEY') }));

/** Override with GEMINI_MODEL; the "-latest" aliases avoid breaking when versions retire. */
export const geminiModel = () => process.env.GEMINI_MODEL || 'gemini-flash-latest';
/** Used when the main model is overloaded. */
const fallbackModel = () => process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isTransient = (err: unknown) => [429, 500, 503, 504].includes(Number((err as { status?: number })?.status));

/**
 * Gemini regularly returns 503 "high demand" / 429 under load. Retry the main
 * model with backoff, then try the lighter fallback model once.
 */
async function generateWithRetry(params: Parameters<GoogleGenAI['models']['generateContent']>[0]) {
  const attempts = [
    { model: geminiModel(), delay: 0 },
    { model: geminiModel(), delay: 1200 },
    { model: fallbackModel(), delay: 2500 },
  ];
  let lastErr: unknown;
  for (const a of attempts) {
    if (a.delay) await sleep(a.delay);
    try {
      return await ai().models.generateContent({ ...params, model: a.model });
    } catch (err) {
      lastErr = err;
      if (!isTransient(err)) break;
      console.warn(`[gemini] ${a.model} busy (${(err as { status?: number }).status}), retrying…`);
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
    const res = await generateWithRetry({
      model: geminiModel(),
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
    throw new HttpError(502, 'The AI service is unavailable right now. Please try again, or enter the details manually.');
  }
  const parsed = opts.validate.safeParse(JSON.parse(text ?? 'null'));
  if (!parsed.success) {
    console.error('[gemini] unexpected output', parsed.error.issues, text?.slice(0, 500));
    throw new HttpError(502, "The AI couldn't read this reliably. Please enter the details manually.");
  }
  return parsed.data;
}
