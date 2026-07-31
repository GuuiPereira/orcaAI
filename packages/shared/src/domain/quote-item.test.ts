import { describe, expect, it } from "vitest";
import { quoteItemInputSchema } from "./quote-item";

function validItem() {
  return {
    position: 0,
    type: "service" as const,
    description: "Pintura das paredes da sala",
    category: null,
    quantity: 1,
    unit: "serviço",
    unit_price_cents: 280_000,
    total_price_cents: 280_000,
    notes: null,
  };
}

describe("quoteItemInputSchema", () => {
  it("accepts a valid item", () => {
    expect(quoteItemInputSchema.parse(validItem())).toBeDefined();
  });

  it("accepts a closed-price item without a unit price (RF-042)", () => {
    const item = { ...validItem(), unit_price_cents: null };
    expect(quoteItemInputSchema.parse(item).unit_price_cents).toBeNull();
  });

  it("rejects an unknown item type", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item: any = { ...validItem(), type: "labor" };
    expect(() => quoteItemInputSchema.parse(item)).toThrow();
  });

  it("rejects a zero or negative quantity", () => {
    expect(() =>
      quoteItemInputSchema.parse({ ...validItem(), quantity: 0 }),
    ).toThrow();
  });

  it("rejects an empty description", () => {
    expect(() =>
      quoteItemInputSchema.parse({ ...validItem(), description: "" }),
    ).toThrow();
  });

  it("accepts a free-text category", () => {
    const item = { ...validItem(), category: "Área interna" };
    expect(quoteItemInputSchema.parse(item).category).toBe("Área interna");
  });
});
