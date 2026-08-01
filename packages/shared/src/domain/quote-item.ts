import { z } from "zod";

export const quoteItemTypeSchema = z.enum(["service", "material", "other"]);
export type QuoteItemType = z.infer<typeof quoteItemTypeSchema>;

export const quoteItemSchema = z.object({
  id: z.uuid(),
  quote_id: z.uuid(),
  position: z.number().int().nonnegative(),
  type: quoteItemTypeSchema,
  description: z.string().min(1),
  // Rótulo de agrupamento livre (ex.: "Área interna"), como o usuário ou a
  // IA o descreveu - não é uma lista fixa de categorias.
  category: z.string().nullable(),
  // Opcionais: nem todo item tem quantidade/unidade explícitas no texto.
  quantity: z.number().positive().nullable(),
  unit: z.string().nullable(),
  // Valor TOTAL do item, nunca um preço por unidade (decisão de
  // 2026-08-01 - ver .tasks/fase-1-prova-do-nucleo.md).
  total_price_cents: z.number().int().nonnegative().nullable(),
  notes: z.string().nullable(),
});

export type QuoteItem = z.infer<typeof quoteItemSchema>;

export const quoteItemInputSchema = quoteItemSchema.omit({
  id: true,
  quote_id: true,
});

export type QuoteItemInput = z.infer<typeof quoteItemInputSchema>;
