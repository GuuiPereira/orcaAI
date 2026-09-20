import { getCurrentOrganizationId } from './organizations';
import { supabase } from './supabase';

// RF-011: campos opcionais além do nome. `address` é jsonb no banco mas
// guardado como string livre por decisão desta fase (2026-08-08) - a IA só
// extrai endereço como texto corrido, sem campos estruturados.
export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  address: string | null;
  notes: string | null;
  archivedAt: string | null;
};

export type CustomerInput = {
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  address: string | null;
  notes: string | null;
};

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  address: string | null;
  notes: string | null;
  archived_at: string | null;
};

const CUSTOMER_COLUMNS = 'id, name, phone, email, document, address, notes, archived_at';

function fromRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    document: row.document,
    address: row.address,
    notes: row.notes,
    archivedAt: row.archived_at,
  };
}

export async function listCustomers(
  options: { search?: string; includeArchived?: boolean } = {},
): Promise<Customer[]> {
  const organizationId = await getCurrentOrganizationId();
  if (!organizationId) return [];

  let query = supabase
    .from('customers')
    .select(CUSTOMER_COLUMNS)
    .eq('organization_id', organizationId)
    .order('name', { ascending: true });

  if (!options.includeArchived) {
    query = query.is('archived_at', null);
  }
  const search = options.search?.trim();
  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as CustomerRow[]).map(fromRow);
}

export async function getCustomer(customerId: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .select(CUSTOMER_COLUMNS)
    .eq('id', customerId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as CustomerRow) : null;
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const organizationId = await getCurrentOrganizationId();
  if (!organizationId) throw new Error('Nenhuma organização encontrada.');

  const { data, error } = await supabase
    .from('customers')
    .insert({ organization_id: organizationId, ...input })
    .select(CUSTOMER_COLUMNS)
    .single();

  if (error || !data) throw error ?? new Error('Falha ao criar cliente.');
  return fromRow(data as CustomerRow);
}

// RF-012: cliente rápido, só o nome - direto do fluxo de criar orçamento.
export async function quickCreateCustomer(name: string): Promise<Customer> {
  return createCustomer({ name, phone: null, email: null, document: null, address: null, notes: null });
}

export async function updateCustomer(customerId: string, input: CustomerInput): Promise<void> {
  const { error } = await supabase.from('customers').update(input).eq('id', customerId);
  if (error) throw error;
}

export async function setCustomerArchived(customerId: string, archived: boolean): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', customerId);
  if (error) throw error;
}
