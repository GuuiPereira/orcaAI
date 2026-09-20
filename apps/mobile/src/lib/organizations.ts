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

export type OrganizationAddress = {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
};

export type OrganizationPreferences = {
  default_validity_days: number | null;
  default_payment_terms: string | null;
  default_observations: string | null;
};

const EMPTY_PREFERENCES: OrganizationPreferences = {
  default_validity_days: null,
  default_payment_terms: null,
  default_observations: null,
};

// Formato editável (onboarding e edição de perfil - RF-003 a RF-006).
// `id`/`logoPath` ficam de fora do que `createOrganization`/`updateOrganization`
// gravam - `id` só existe depois de criada, `logoPath` é escrito à parte,
// direto após o upload (RF-005, task 6), não pelo salvar do formulário.
export type OrganizationProfile = {
  id: string | null;
  tradeName: string;
  legalName: string | null;
  taxId: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: OrganizationAddress | null;
  preferences: OrganizationPreferences;
  logoPath: string | null;
};

function readAddress(raw: unknown): OrganizationAddress | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Partial<OrganizationAddress>;
  return {
    street: a.street ?? '',
    number: a.number ?? '',
    neighborhood: a.neighborhood ?? '',
    city: a.city ?? '',
    state: a.state ?? '',
    zip_code: a.zip_code ?? '',
  };
}

function readPreferences(raw: unknown): OrganizationPreferences {
  if (!raw || typeof raw !== 'object') return EMPTY_PREFERENCES;
  const p = raw as Partial<OrganizationPreferences>;
  return {
    default_validity_days: p.default_validity_days ?? null,
    default_payment_terms: p.default_payment_terms ?? null,
    default_observations: p.default_observations ?? null,
  };
}

export async function getCurrentOrganizationProfile(): Promise<OrganizationProfile | null> {
  const organizationId = await getCurrentOrganizationId();
  if (!organizationId) return null;

  const { data, error } = await supabase
    .from('organizations')
    .select('trade_name, legal_name, tax_id, contact_phone, contact_email, address, preferences, logo_path')
    .eq('id', organizationId)
    .single();

  if (error || !data) {
    throw error ?? new Error('Organização não encontrada.');
  }

  return {
    id: organizationId,
    tradeName: data.trade_name,
    legalName: data.legal_name,
    taxId: data.tax_id,
    contactPhone: data.contact_phone,
    contactEmail: data.contact_email,
    address: readAddress(data.address),
    preferences: readPreferences(data.preferences),
    logoPath: data.logo_path,
  };
}

// Rascunho editável (onboarding/formulário de perfil) antes de existir no
// banco - sem `id` (só existe depois de criada) nem `logoPath` (gravado à
// parte, direto após o upload do logo - RF-005).
export type OrganizationProfileInput = Omit<OrganizationProfile, 'id' | 'logoPath'>;

// Cria a organização (RF-004) e a membership do dono (bootstrap - RLS
// permite porque user_id = auth.uid() cobre a primeira linha, antes de
// existir qualquer organização pra esse usuário).
export async function createOrganization(profile: OrganizationProfileInput): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sem sessão.');

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .insert({
      owner_user_id: user.id,
      trade_name: profile.tradeName,
      legal_name: profile.legalName,
      tax_id: profile.taxId,
      contact_phone: profile.contactPhone,
      contact_email: profile.contactEmail,
      address: profile.address,
      preferences: profile.preferences,
    })
    .select('id')
    .single();

  if (organizationError || !organization) {
    throw organizationError ?? new Error('Falha ao criar organização.');
  }

  const { error: memberError } = await supabase
    .from('organization_members')
    .insert({ organization_id: organization.id, user_id: user.id, role: 'owner', status: 'active' });

  if (memberError) throw memberError;

  return organization.id as string;
}

export async function updateOrganization(organizationId: string, profile: OrganizationProfileInput): Promise<void> {
  const { error } = await supabase
    .from('organizations')
    .update({
      trade_name: profile.tradeName,
      legal_name: profile.legalName,
      tax_id: profile.taxId,
      contact_phone: profile.contactPhone,
      contact_email: profile.contactEmail,
      address: profile.address,
      preferences: profile.preferences,
    })
    .eq('id', organizationId);

  if (error) throw error;
}

// RF-005: grava o caminho do logo já enviado ao Storage (task 6) - separado
// de `updateOrganization` porque o upload acontece na hora, sem esperar o
// "Salvar" do resto do formulário de perfil.
export async function setOrganizationLogoPath(organizationId: string, logoPath: string | null): Promise<void> {
  const { error } = await supabase.from('organizations').update({ logo_path: logoPath }).eq('id', organizationId);
  if (error) throw error;
}

// Dados do prestador (RF-061) pro PDF do orçamento - formato já resumido
// pra exibição, distinto do OrganizationProfile (editável).
export type CurrentOrganization = {
  tradeName: string;
  legalName: string | null;
  taxId: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  // RF-006: condições padrão configuradas no perfil - usadas como ponto de
  // partida de um orçamento novo (ver quote/[quoteId]/index.tsx), nunca
  // aqui pra exibição no PDF em si.
  defaultPaymentTerms: string | null;
  defaultValidityDays: number | null;
};

function formatOrganizationAddress(address: OrganizationAddress | null): string | null {
  if (!address) return null;
  const parts = [
    [address.street, address.number].filter(Boolean).join(', '),
    address.neighborhood,
    [address.city, address.state].filter(Boolean).join('/'),
    address.zip_code,
  ].filter((part): part is string => Boolean(part && part.trim().length > 0));
  return parts.length > 0 ? parts.join(' - ') : null;
}

export async function getCurrentOrganization(): Promise<CurrentOrganization | null> {
  const profile = await getCurrentOrganizationProfile();
  if (!profile) return null;

  return {
    tradeName: profile.tradeName,
    legalName: profile.legalName,
    taxId: profile.taxId,
    contactPhone: profile.contactPhone,
    contactEmail: profile.contactEmail,
    address: formatOrganizationAddress(profile.address),
    defaultPaymentTerms: profile.preferences.default_payment_terms,
    defaultValidityDays: profile.preferences.default_validity_days,
  };
}
