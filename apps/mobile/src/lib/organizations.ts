import { supabase } from './supabase';

export async function getCurrentOrganizationId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.organization_id ?? null;
}

export type CurrentOrganization = {
  tradeName: string;
  legalName: string | null;
  taxId: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
};

type OrganizationAddress = {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
};

function formatOrganizationAddress(address: unknown): string | null {
  if (!address || typeof address !== 'object') return null;
  const a = address as OrganizationAddress;
  const parts = [
    [a.street, a.number].filter(Boolean).join(', '),
    a.neighborhood,
    [a.city, a.state].filter(Boolean).join('/'),
    a.zip_code,
  ].filter((part): part is string => Boolean(part && part.trim().length > 0));
  return parts.length > 0 ? parts.join(' - ') : null;
}

// Dados do prestador (RF-061) para o PDF do orçamento. Cadastro/edição
// desses dados é a Task 2 da Fase 2 - aqui só lê o que já existir.
export async function getCurrentOrganization(): Promise<CurrentOrganization | null> {
  const organizationId = await getCurrentOrganizationId();
  if (!organizationId) return null;

  const { data, error } = await supabase
    .from('organizations')
    .select('trade_name, legal_name, tax_id, contact_phone, contact_email, address')
    .eq('id', organizationId)
    .single();

  if (error || !data) {
    throw error ?? new Error('Organização não encontrada.');
  }

  return {
    tradeName: data.trade_name,
    legalName: data.legal_name,
    taxId: data.tax_id,
    contactPhone: data.contact_phone,
    contactEmail: data.contact_email,
    address: formatOrganizationAddress(data.address),
  };
}
