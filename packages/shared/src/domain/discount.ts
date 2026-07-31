import { z } from "zod";

// Regra de negócio 5 (docs/PRD.md): desconto percentual deve estar entre 0% e 100%.
export const discountSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("fixed"),
    value_cents: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("percentage"),
    value_percent: z.number().min(0).max(100),
  }),
]);

export type Discount = z.infer<typeof discountSchema>;
