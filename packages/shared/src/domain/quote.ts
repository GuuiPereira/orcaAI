import { z } from "zod";
import { addressSchema } from "./address.ts";
import { commercialTermsSchema } from "./commercial-terms.ts";
import { discountSchema } from "./discount.ts";

// Estados do docs/PRD.md §8.
export const quoteStatusSchema = z.enum([
  "rascunho",
  "pronto_para_revisao",
  "emitido",
  "enviado",
  "aprovado",
  "recusado",
  "expirado",
  "substituido_por_nova_versao",
]);

export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

export const quoteSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  customer_id: z.uuid().nullable(),
  number: z.string().nullable(),
  status: quoteStatusSchema,
  source_text: z.string().nullable(),
  service_location: addressSchema.nullable(),
  issued_at: z.iso.datetime().nullable(),
  valid_until: z.iso.date().nullable(),
  discount: discountSchema.nullable(),
  subtotal_cents: z.number().int().nonnegative(),
  total_cents: z.number().int().nonnegative(),
  commercial_terms: commercialTermsSchema,
  current_version: z.number().int().nonnegative(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export type Quote = z.infer<typeof quoteSchema>;
