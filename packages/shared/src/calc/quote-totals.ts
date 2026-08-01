import type { Discount } from "../domain/discount.ts";
import type { QuoteItemType } from "../domain/quote-item.ts";

export type CalculableItem = {
  type: QuoteItemType;
  // Valor TOTAL do item (não multiplica por quantidade - ver
  // docs/ARCHITECTURE.md §4 e .tasks/fase-1-prova-do-nucleo.md).
  total_price_cents: number | null;
};

export type QuoteTotals = {
  subtotalCents: number;
  subtotalByType: Record<QuoteItemType, number>;
  discountCents: number;
  totalCents: number;
};

export function sumItemTotals(items: readonly CalculableItem[]): number {
  return items.reduce((sum, item) => sum + (item.total_price_cents ?? 0), 0);
}

export function sumItemTotalsByType(
  items: readonly CalculableItem[],
): Record<QuoteItemType, number> {
  const totals: Record<QuoteItemType, number> = { service: 0, material: 0, other: 0 };
  for (const item of items) {
    totals[item.type] += item.total_price_cents ?? 0;
  }
  return totals;
}

// Regra de negócio 5 (docs/PRD.md): desconto percentual entre 0% e 100%, já
// garantido pelo discountSchema ao validar o input. O desconto nunca deixa
// o total negativo - é limitado ao próprio subtotal.
export function calculateDiscountCents(subtotalCents: number, discount: Discount | null): number {
  if (!discount) return 0;
  const rawDiscountCents =
    discount.type === "fixed"
      ? discount.value_cents
      : Math.round((subtotalCents * discount.value_percent) / 100);
  return Math.min(rawDiscountCents, subtotalCents);
}

export function calculateQuoteTotals(
  items: readonly CalculableItem[],
  discount: Discount | null,
): QuoteTotals {
  const subtotalCents = sumItemTotals(items);
  const discountCents = calculateDiscountCents(subtotalCents, discount);
  return {
    subtotalCents,
    subtotalByType: sumItemTotalsByType(items),
    discountCents,
    totalCents: subtotalCents - discountCents,
  };
}
