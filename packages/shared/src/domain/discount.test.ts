import { describe, expect, it } from "vitest";
import { discountSchema } from "./discount";

describe("discountSchema", () => {
  it("accepts a fixed discount in cents", () => {
    expect(
      discountSchema.parse({ type: "fixed", value_cents: 5_000 }),
    ).toEqual({ type: "fixed", value_cents: 5_000 });
  });

  it("accepts a percentage discount within 0-100", () => {
    expect(
      discountSchema.parse({ type: "percentage", value_percent: 10 }),
    ).toEqual({ type: "percentage", value_percent: 10 });
  });

  // Regra de negócio 5 do docs/PRD.md.
  it("rejects a percentage above 100", () => {
    expect(() =>
      discountSchema.parse({ type: "percentage", value_percent: 101 }),
    ).toThrow();
  });

  it("rejects a negative percentage", () => {
    expect(() =>
      discountSchema.parse({ type: "percentage", value_percent: -1 }),
    ).toThrow();
  });

  it("rejects a negative fixed value", () => {
    expect(() =>
      discountSchema.parse({ type: "fixed", value_cents: -1 }),
    ).toThrow();
  });

  it("rejects mixing fields from the other variant", () => {
    expect(() =>
      discountSchema.parse({ type: "fixed", value_percent: 10 }),
    ).toThrow();
  });
});
