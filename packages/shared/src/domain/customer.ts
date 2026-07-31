import { z } from "zod";
import { addressSchema } from "./address.ts";

export const customerSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  name: z.string().min(1),
  phone: z.string().nullable(),
  email: z.email().nullable(),
  document: z.string().nullable(),
  address: addressSchema.nullable(),
  notes: z.string().nullable(),
  archived_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export type Customer = z.infer<typeof customerSchema>;

// RF-012: cadastro rápido informando apenas o nome.
export const customerInputSchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.email().nullable().optional(),
  document: z.string().nullable().optional(),
  address: addressSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;
