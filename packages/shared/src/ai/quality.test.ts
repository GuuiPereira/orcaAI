import { describe, expect, it } from "vitest";
import { computeAiQualityMetrics, type AiQualityItemLike } from "./quality";

function item(overrides: Partial<AiQualityItemLike> = {}): AiQualityItemLike {
  return {
    type: "service",
    description: "Pintura sala",
    category: null,
    quantity: null,
    unit: null,
    total_price_cents: 20000,
    ...overrides,
  };
}

describe("computeAiQualityMetrics", () => {
  it("counts every compared item as unchanged when nothing differs", () => {
    const ai = [item(), item({ description: "Tinta", type: "material" })];
    const emitted = [item(), item({ description: "Tinta", type: "material" })];
    const result = computeAiQualityMetrics(ai, emitted);
    expect(result).toEqual({
      itemsFromAi: 2,
      itemsEmitted: 2,
      itemsAdded: 0,
      itemsRemoved: 0,
      itemsUnchanged: 2,
      itemsChanged: 0,
      fieldsChanged: 0,
    });
  });

  it("counts a changed field and still flags the item as changed, not removed", () => {
    const ai = [item({ total_price_cents: 20000 })];
    const emitted = [item({ total_price_cents: 25000 })];
    const result = computeAiQualityMetrics(ai, emitted);
    expect(result.itemsUnchanged).toBe(0);
    expect(result.itemsChanged).toBe(1);
    expect(result.fieldsChanged).toBe(1);
  });

  it("sums every differing field across items, not just how many items changed", () => {
    const ai = [item({ description: "A", category: "X", quantity: 1 })];
    const emitted = [item({ description: "B", category: "Y", quantity: 2 })];
    const result = computeAiQualityMetrics(ai, emitted);
    expect(result.fieldsChanged).toBe(3);
  });

  it("counts extra emitted items beyond the AI's as added", () => {
    const ai = [item()];
    const emitted = [item(), item({ description: "Item novo" })];
    const result = computeAiQualityMetrics(ai, emitted);
    expect(result.itemsAdded).toBe(1);
    expect(result.itemsRemoved).toBe(0);
    expect(result.itemsUnchanged).toBe(1);
  });

  it("counts AI items that didn't make it to emission as removed", () => {
    const ai = [item(), item({ description: "Vai sumir" })];
    const emitted = [item()];
    const result = computeAiQualityMetrics(ai, emitted);
    expect(result.itemsRemoved).toBe(1);
    expect(result.itemsAdded).toBe(0);
    expect(result.itemsUnchanged).toBe(1);
  });

  it("returns all zeros for two empty lists", () => {
    const result = computeAiQualityMetrics([], []);
    expect(result).toEqual({
      itemsFromAi: 0,
      itemsEmitted: 0,
      itemsAdded: 0,
      itemsRemoved: 0,
      itemsUnchanged: 0,
      itemsChanged: 0,
      fieldsChanged: 0,
    });
  });

  it("treats every emitted item as added when there was nothing from the AI", () => {
    const result = computeAiQualityMetrics([], [item(), item()]);
    expect(result.itemsAdded).toBe(2);
    expect(result.itemsRemoved).toBe(0);
    expect(result.itemsUnchanged).toBe(0);
  });
});
