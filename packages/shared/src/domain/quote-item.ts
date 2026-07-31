import { z } from "zod";

export const quoteItemTypeSchema = z.enum(["service", "material", "other"]);
export type QuoteItemType = z.infer<typeof quoteItemTypeSchema>;

export const quoteItemSchema = z.object({
  id: z.uuid(),
  quote_id: z.uuid(),
  position: z.number().int().nonnegative(),
  type: quoteItemTypeSchema,
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().nullable(),
  // RF-042: item pode ter preço fechado, sem valor unitário.
  unit_price_cents: z.number().int().nonnegative().nullable(),
  total_price_cents: z.number().int().nonnegative().nullable(),
  notes: z.string().nullable(),
});

export type QuoteItem = z.infer<typeof quoteItemSchema>;

export const quoteItemInputSchema = quoteItemSchema.omit({
  id: true,
  quote_id: true,
});

export type QuoteItemInput = z.infer<typeof quoteItemInputSchema>;
