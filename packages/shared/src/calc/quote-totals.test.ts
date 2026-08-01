import { describe, expect, it } from "vitest";
import {
  calculateDiscountCents,
  calculateQuoteTotals,
  sumItemTotals,
  sumItemTotalsByType,
  type CalculableItem,
} from "./quote-totals";

const items: CalculableItem[] = [
  { type: "service", total_price_cents: 20000 },
  { type: "service", total_price_cents: 60000 },
  { type: "material", total_price_cents: 20000 },
  { type: "other", total_price_cents: 13000 },
];

describe("sumItemTotals", () => {
  it("sums item totals directly, not multiplied by quantity", () => {
    expect(sumItemTotals(items)).toBe(113000);
  });

  it("treats a null total as 0, not an error", () => {
    expect(sumItemTotals([{ type: "service", total_price_cents: null }])).toBe(0);
  });

  it("returns 0 for an empty list", () => {
    expect(sumItemTotals([])).toBe(0);
  });
});

describe("sumItemTotalsByType", () => {
  it("breaks the subtotal down by item type", () => {
    expect(sumItemTotalsByType(items)).toEqual({
      service: 80000,
      material: 20000,
      other: 13000,
    });
  });

  it("returns zero for types with no items", () => {
    expect(sumItemTotalsByType([{ type: "service", total_price_cents: 100 }])).toEqual({
      service: 100,
      material: 0,
      other: 0,
    });
  });
});

describe("calculateDiscountCents", () => {
  it("returns 0 when there is no discount", () => {
    expect(calculateDiscountCents(100000, null)).toBe(0);
  });

  it("applies a fixed discount", () => {
    expect(calculateDiscountCents(100000, { type: "fixed", value_cents: 5000 })).toBe(5000);
  });

  it("applies a percentage discount", () => {
    expect(
      calculateDiscountCents(100000, { type: "percentage", value_percent: 10 }),
    ).toBe(10000);
  });

  it("rounds a percentage discount that doesn't land on a whole cent", () => {
    // 10% of R$11,35 = R$1,135 -> rounds to 114 cents.
    expect(
      calculateDiscountCents(1135, { type: "percentage", value_percent: 10 }),
    ).toBe(114);
  });

  it("never lets a fixed discount exceed the subtotal", () => {
    expect(calculateDiscountCents(1000, { type: "fixed", value_cents: 999999 })).toBe(1000);
  });

  it("a 100% discount zeroes out the subtotal", () => {
    expect(
      calculateDiscountCents(100000, { type: "percentage", value_percent: 100 }),
    ).toBe(100000);
  });
});

describe("calculateQuoteTotals", () => {
  it("computes subtotal, per-type breakdown, discount and total together", () => {
    const result = calculateQuoteTotals(items, { type: "percentage", value_percent: 10 });

    expect(result.subtotalCents).toBe(113000);
    expect(result.subtotalByType).toEqual({ service: 80000, material: 20000, other: 13000 });
    expect(result.discountCents).toBe(11300);
    expect(result.totalCents).toBe(101700);
  });

  it("total equals subtotal when there is no discount", () => {
    const result = calculateQuoteTotals(items, null);
    expect(result.totalCents).toBe(result.subtotalCents);
    expect(result.discountCents).toBe(0);
  });

  it("total is never negative even with an oversized fixed discount", () => {
    const result = calculateQuoteTotals(items, { type: "fixed", value_cents: 999999 });
    expect(result.totalCents).toBe(0);
  });
});
