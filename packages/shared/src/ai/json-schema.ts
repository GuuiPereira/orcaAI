import { z } from 'zod';
import { aiInterpretationResultSchema } from './interpretation.ts';

// OpenAI's Structured Outputs "strict" mode only accepts a subset of JSON
// Schema keywords - notably no numeric/length/array-size constraints. Those
// tighter rules (ex.: "no máximo 3 perguntas", desconto entre 0% e 100%)
// stay enforced when the response comes back, by re-validating it against
// the original Zod schema (see docs/ARCHITECTURE.md §4-5).
const UNSUPPORTED_KEYWORDS = new Set([
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern',
  'format',
]);

function stripUnsupportedKeywords(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripUnsupportedKeywords);
  }
  if (node !== null && typeof node === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (UNSUPPORTED_KEYWORDS.has(key)) continue;
      cleaned[key] = stripUnsupportedKeywords(value);
    }
    return cleaned;
  }
  return node;
}

export function toOpenAiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _omit, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return stripUnsupportedKeywords(rest) as Record<string, unknown>;
}

export const AI_INTERPRETATION_JSON_SCHEMA = toOpenAiJsonSchema(aiInterpretationResultSchema);
