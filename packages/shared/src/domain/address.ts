import { z } from "zod";

export const addressSchema = z.object({
  street: z.string().nullable(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  neighborhood: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip_code: z.string().nullable(),
});

export type Address = z.infer<typeof addressSchema>;
