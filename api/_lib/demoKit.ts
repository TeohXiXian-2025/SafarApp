// The demo kit files (public/demo-kit) are read by the real AI once, and the
// answers are kept in demoAnswers.ts. When someone uploads one of those exact
// files again, the kept answer is used: the demo is instant, costs no AI
// quota, and reads the same every time. Any other file goes to the AI as usual.
//
// Recording: run the API with DEMO_RECORD=1 and upload each kit file once
// (scripts/e2e-demo.mjs does it); new answers are written into demoAnswers.ts.
import { createHash } from 'node:crypto';
import type { Part } from '@google/genai';
import { DEMO_ANSWERS } from './demoAnswers.js';

const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

/** Prompt + the files in it (text parts are ignored: they carry trip-specific context). */
function keyOf(system: string, parts: Part[]): string | null {
  const files = parts.flatMap((p) => (p.inlineData?.data ? [sha(Buffer.from(p.inlineData.data, 'base64'))] : []));
  if (!files.length) return null;
  return `${sha(system).slice(0, 16)}:${files.sort().join(',')}`;
}

export function demoAnswer(system: string, parts: Part[]): unknown {
  const key = keyOf(system, parts);
  return key && key in DEMO_ANSWERS ? structuredClone(DEMO_ANSWERS[key]) : undefined;
}

/** DEMO_RECORD=1 (local dev only): keep what the AI read from a demo kit file. */
export async function recordDemoAnswer(system: string, parts: Part[], answer: unknown): Promise<void> {
  if (process.env.DEMO_RECORD !== '1') return;
  const key = keyOf(system, parts);
  if (!key || key in DEMO_ANSWERS) return;
  const { readdirSync, readFileSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const kitDir = join(process.cwd(), 'public', 'demo-kit');
  const kit = new Set(readdirSync(kitDir).map((f) => sha(readFileSync(join(kitDir, f)))));
  if (!key.split(':')[1].split(',').every((h) => kit.has(h))) return;
  DEMO_ANSWERS[key] = answer;
  const file = join(process.cwd(), 'api', '_lib', 'demoAnswers.ts');
  writeFileSync(
    file,
    `// Written by the demo recorder (DEMO_RECORD=1, see demoKit.ts) — do not edit by hand.\n// What the AI read from each demo kit file, keyed by prompt + file fingerprints.\nexport const DEMO_ANSWERS: Record<string, unknown> = ${JSON.stringify(DEMO_ANSWERS, null, 2)};\n`,
  );
  console.log('[demo] recorded an answer for', key);
}
