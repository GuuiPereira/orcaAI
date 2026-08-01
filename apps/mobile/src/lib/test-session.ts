import { supabase } from './supabase';

// Placeholder de autenticação só para a Fase 1 (ver .tasks/fase-1-prova-do-nucleo.md
// e docs/ROADMAP.md - Fase 2 entrega autenticação de verdade, RF-001).
// Usa o mesmo usuário de teste do supabase/seed.sql. Remover quando a Fase 2
// chegar - não é para produção.
const TEST_USER_EMAIL = 'test@orcaai.local';
const TEST_USER_PASSWORD = 'orcaai-local-test';

export async function ensureTestSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  if (error) throw error;
  return data.session;
}

export async function getTestOrganizationId(): Promise<string> {
  const session = await ensureTestSession();
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', session.user.id)
    .limit(1)
    .single();

  if (error || !data) {
    throw error ?? new Error('Nenhuma organização encontrada para o usuário de teste.');
  }
  return data.organization_id as string;
}

export type TestOrganization = {
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

// Dados do prestador (RF-061) para o PDF do orçamento (RNF: sem tela de
// perfil ainda - Fase 1 lê direto da organização do usuário de teste).
export async function getTestOrganization(): Promise<TestOrganization> {
  const organizationId = await getTestOrganizationId();
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
