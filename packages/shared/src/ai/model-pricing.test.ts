import { describe, expect, it } from "vitest";
import { estimateCostCents, findModelPricing, OPENAI_MODEL_PRICING } from "./model-pricing";

describe("findModelPricing", () => {
  it("finds a known model", () => {
    expect(findModelPricing("gpt-5.4-mini")?.inputCentsPer1M).toBe(75);
  });

  it("returns undefined for an unknown model", () => {
    expect(findModelPricing("not-a-real-model")).toBeUndefined();
  });

  it("every catalog entry has a positive input and output price", () => {
    for (const pricing of OPENAI_MODEL_PRICING) {
      expect(pricing.inputCentsPer1M).toBeGreaterThan(0);
      expect(pricing.outputCentsPer1M).toBeGreaterThan(0);
    }
  });
});

describe("estimateCostCents", () => {
  it("returns null when there is no usage data", () => {
    expect(estimateCostCents("gpt-5.4-mini", null)).toBeNull();
    expect(estimateCostCents("gpt-5.4-mini", undefined)).toBeNull();
  });

  it("returns null for a model outside the pricing catalog", () => {
    expect(
      estimateCostCents("not-a-real-model", { input_tokens: 100, output_tokens: 100 }),
    ).toBeNull();
  });

  it("computes cost from fresh input + output tokens", () => {
    // gpt-5.4-mini: input 75c/1M, output 450c/1M
    const cost = estimateCostCents("gpt-5.4-mini", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cost).toBe(75 + 450);
  });

  it("prices cached tokens at the cached rate, not the fresh rate", () => {
    // gpt-5.4-mini: input 75c/1M, cached input 7.5c/1M
    const cost = estimateCostCents("gpt-5.4-mini", {
      input_tokens: 1_000_000,
      output_tokens: 0,
      input_tokens_details: { cached_tokens: 1_000_000 },
    });
    expect(cost).toBe(8); // 7.5 rounded
  });

  it("prices cache-write tokens at the cache-write rate when the model has one", () => {
    // gpt-5.6-sol: cache write 625c/1M
    const cost = estimateCostCents("gpt-5.6-sol", {
      input_tokens: 1_000_000,
      output_tokens: 0,
      input_tokens_details: { cache_write_tokens: 1_000_000 },
    });
    expect(cost).toBe(625);
  });

  it("falls back to the fresh-input rate for cache writes when the model has no cache-write price", () => {
    // gpt-5.5 has no cacheWriteCentsPer1M ("-" in the pricing table).
    const cost = estimateCostCents("gpt-5.5", {
      input_tokens: 1_000_000,
      output_tokens: 0,
      input_tokens_details: { cache_write_tokens: 1_000_000 },
    });
    expect(cost).toBe(500); // falls back to inputCentsPer1M
  });
});
