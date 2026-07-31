import { describe, expect, it } from "vitest";
import {
  AI_INTERPRETATION_SCHEMA_VERSION,
  aiInterpretationResultSchema,
} from "./interpretation";

// Fixture is untyped on purpose: these tests simulate payloads coming from
// an untrusted source (the AI model output) that zod must validate at
// runtime, so mutations below intentionally break the shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validResult(): any {
  return {
    schema_version: AI_INTERPRETATION_SCHEMA_VERSION,
    customer: { name: "Maria", phone: null, address: null },
    items: [
      {
        type: "service",
        description: "Pintura das paredes da sala, duas demãos",
        quantity: 1,
        unit: "serviço",
        unit_price_cents: null,
        source_excerpt: "duas demãos nas paredes da sala",
        confidence: "high",
      },
    ],
    commercial_terms: {
      discount: null,
      payment_terms: null,
      estimated_duration_days: null,
      validity_days: null,
    },
    questions: [],
    warnings: [],
  };
}

describe("aiInterpretationResultSchema", () => {
  it("accepts the conceptual example from docs/ARCHITECTURE.md", () => {
    expect(aiInterpretationResultSchema.parse(validResult())).toBeDefined();
  });

  it("requires missing fields to be explicit null, not omitted", () => {
    const result = validResult();
    delete result.customer.address;

    expect(() => aiInterpretationResultSchema.parse(result)).toThrow();
  });

  it("requires every item to carry a source_excerpt as evidence", () => {
    const result = validResult();
    delete result.items[0].source_excerpt;

    expect(() => aiInterpretationResultSchema.parse(result)).toThrow();
  });

  it("rejects more than three questions per round", () => {
    const result = validResult();
    result.questions = ["a", "b", "c", "d"];

    expect(() => aiInterpretationResultSchema.parse(result)).toThrow();
  });

  it("rejects an unknown confidence level", () => {
    const result = validResult();
    result.items[0].confidence = "certain";

    expect(() => aiInterpretationResultSchema.parse(result)).toThrow();
  });

  it("rejects a stale schema_version", () => {
    const result = validResult();
    result.schema_version = "0.9";

    expect(() => aiInterpretationResultSchema.parse(result)).toThrow();
  });

  it("rejects a negative quantity", () => {
    const result = validResult();
    result.items[0].quantity = -1;

    expect(() => aiInterpretationResultSchema.parse(result)).toThrow();
  });

  it("rejects an unknown item type", () => {
    const result = validResult();
    result.items[0].type = "labor";

    expect(() => aiInterpretationResultSchema.parse(result)).toThrow();
  });
});
