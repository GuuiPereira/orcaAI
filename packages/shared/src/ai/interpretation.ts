import { z } from "zod";
import { quoteItemTypeSchema } from "../domain/quote-item.ts";

// docs/ARCHITECTURE.md §4 - schema conceitual da IA.
// Regra central (RF-027): a IA nunca preenche preço, quantidade, prazo ou
// documento sem evidência no texto original - todo campo sem evidência deve
// ser `null`, nunca inventado.

export const AI_INTERPRETATION_SCHEMA_VERSION = "1.2";

export const aiConfidenceSchema = z.enum(["high", "medium", "low"]);
export type AiConfidence = z.infer<typeof aiConfidenceSchema>;

export const aiInterpretedCustomerSchema = z.object({
  name: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
});

export const aiInterpretedItemSchema = z.object({
  type: quoteItemTypeSchema,
  description: z.string().min(1),
  // Rótulo de agrupamento tal como o texto original o nomeia (ex.: "Área
  // interna", "Fachada"). `null` quando o texto não separa em grupos -
  // nunca inventar uma categoria que o texto não sugeriu.
  category: z.string().nullable(),
  // Opcionais: nem todo item tem quantidade/unidade explícitas no texto.
  quantity: z.number().positive().nullable(),
  unit: z.string().nullable(),
  // Valor TOTAL deste item (não é preço por unidade). Ex.: "3 quartos, 600
  // reais" -> total_price_cents = 60000, quantity = 3 - os 600 reais não são
  // por quarto.
  total_price_cents: z.number().int().nonnegative().nullable(),
  // Trecho do texto original que sustenta este item, para auditoria (RF-024).
  source_excerpt: z.string().min(1),
  confidence: aiConfidenceSchema,
});

export const aiInterpretedCommercialTermsSchema = z.object({
  // Texto bruto extraído (ex.: "10%", "desconto de 100 reais"); a estrutura
  // final de desconto é decidida pelo usuário no editor, não pela IA.
  discount: z.string().nullable(),
  payment_terms: z.string().nullable(),
  estimated_duration_days: z.number().int().positive().nullable(),
  validity_days: z.number().int().positive().nullable(),
});

export const aiInterpretationResultSchema = z.object({
  schema_version: z.literal(AI_INTERPRETATION_SCHEMA_VERSION),
  customer: aiInterpretedCustomerSchema,
  items: z.array(aiInterpretedItemSchema),
  commercial_terms: aiInterpretedCommercialTermsSchema,
  // docs/ARCHITECTURE.md §5: no máximo três perguntas por rodada.
  questions: z.array(z.string().min(1)).max(3),
  warnings: z.array(z.string().min(1)),
});

export type AiInterpretedCustomer = z.infer<typeof aiInterpretedCustomerSchema>;
export type AiInterpretedItem = z.infer<typeof aiInterpretedItemSchema>;
export type AiInterpretedCommercialTerms = z.infer<
  typeof aiInterpretedCommercialTermsSchema
>;
export type AiInterpretationResult = z.infer<
  typeof aiInterpretationResultSchema
>;
