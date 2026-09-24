import { Type } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { jsonFromReply, toJsonSchema } from './groq';

describe('groq helpers', () => {
  it('converts Gemini schemas to JSON Schema', () => {
    expect(
      toJsonSchema({
        type: Type.OBJECT,
        properties: { kind: { type: Type.STRING, enum: ['a', 'b'] }, xs: { type: Type.ARRAY, items: { type: Type.NUMBER } } },
        required: ['kind'],
      }),
    ).toEqual({
      type: 'object',
      properties: { kind: { type: 'string', enum: ['a', 'b'] }, xs: { type: 'array', items: { type: 'number' } } },
      required: ['kind'],
    });
  });
  it('extracts JSON even with a <think> block or code fences', () => {
    expect(jsonFromReply('<think>hmm {not json}</think>```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});
