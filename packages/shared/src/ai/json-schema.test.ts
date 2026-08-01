import { describe, expect, it } from 'vitest';
import { AI_INTERPRETATION_JSON_SCHEMA } from './json-schema';

const UNSUPPORTED_KEYWORDS = [
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
];

function collectKeys(node: unknown, found: Set<string>) {
  if (Array.isArray(node)) {
    for (const item of node) collectKeys(item, found);
    return;
  }
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      found.add(key);
      collectKeys(value, found);
    }
  }
}

describe('AI_INTERPRETATION_JSON_SCHEMA', () => {
  it('does not use JSON Schema keywords unsupported by OpenAI strict mode', () => {
    const keys = new Set<string>();
    collectKeys(AI_INTERPRETATION_JSON_SCHEMA, keys);

    for (const keyword of UNSUPPORTED_KEYWORDS) {
      expect(keys.has(keyword)).toBe(false);
    }
  });

  it('keeps additionalProperties: false at the top level (strict mode requirement)', () => {
    expect(AI_INTERPRETATION_JSON_SCHEMA.additionalProperties).toBe(false);
  });

  it('requires every top-level field (strict mode requires all properties required)', () => {
    const properties = AI_INTERPRETATION_JSON_SCHEMA.properties as Record<string, unknown>;
    expect(AI_INTERPRETATION_JSON_SCHEMA.required).toEqual(Object.keys(properties));
  });

  it('preserves the enum/const constraints that OpenAI strict mode does support', () => {
    const json = JSON.stringify(AI_INTERPRETATION_JSON_SCHEMA);
    expect(json).toContain('"const":"1.2"');
    expect(json).toContain('"enum":["service","material","other"]');
    expect(json).toContain('"enum":["high","medium","low"]');
  });
});
