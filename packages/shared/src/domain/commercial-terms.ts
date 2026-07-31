import { z } from "zod";

export const commercialTermsSchema = z.object({
  payment_terms: z.string().nullable(),
  estimated_duration_days: z.number().int().positive().nullable(),
  validity_days: z.number().int().positive().nullable(),
});

export type CommercialTerms = z.infer<typeof commercialTermsSchema>;

export const emptyCommercialTerms: CommercialTerms = {
  payment_terms: null,
  estimated_duration_days: null,
  validity_days: null,
};
