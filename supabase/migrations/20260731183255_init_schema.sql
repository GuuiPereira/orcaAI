-- Initial schema for OrçaAI, based on docs/ARCHITECTURE.md (section 6).
-- Multi-tenant by organization, isolated with Row Level Security.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete restrict,
  trade_name text not null,
  legal_name text,
  tax_id text,
  contact_phone text,
  contact_email text,
  address jsonb,
  logo_path text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organizations_owner_user_id_idx on public.organizations (owner_user_id);

-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'invited', 'removed')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);

-- Security-definer helper so RLS policies can check membership without
-- recursively evaluating RLS on organization_members itself.
create function public.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  document text,
  address jsonb,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_organization_id_idx on public.customers (organization_id);

-- ---------------------------------------------------------------------------
-- quotes
-- ---------------------------------------------------------------------------

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete restrict,
  number text,
  status text not null default 'rascunho' check (
    status in (
      'rascunho',
      'pronto_para_revisao',
      'emitido',
      'enviado',
      'aprovado',
      'recusado',
      'expirado',
      'substituido_por_nova_versao'
    )
  ),
  source_text text,
  service_location jsonb,
  issued_at timestamptz,
  valid_until date,
  discount jsonb,
  subtotal_cents bigint not null default 0,
  total_cents bigint not null default 0,
  commercial_terms jsonb not null default '{}'::jsonb,
  current_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quotes_organization_id_idx on public.quotes (organization_id);
create index quotes_customer_id_idx on public.quotes (customer_id);
create unique index quotes_organization_number_idx
  on public.quotes (organization_id, number)
  where number is not null;

-- ---------------------------------------------------------------------------
-- quote_items
-- ---------------------------------------------------------------------------

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  position integer not null,
  type text not null check (type in ('service', 'material', 'other')),
  description text not null,
  category text,
  -- Opcional: nem todo item tem quantidade/unidade explícitas (ver
  -- packages/shared/src/ai/interpretation.ts).
  quantity numeric,
  unit text,
  -- Valor TOTAL do item, nunca por unidade (decisão de 2026-08-01 - ver
  -- .tasks/fase-1-prova-do-nucleo.md).
  total_price_cents bigint,
  notes text
);

create index quote_items_quote_id_idx on public.quote_items (quote_id);

-- ---------------------------------------------------------------------------
-- quote_versions
-- ---------------------------------------------------------------------------

create table public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  pdf_path text,
  snapshot_hash text not null,
  issued_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create unique index quote_versions_quote_id_version_idx
  on public.quote_versions (quote_id, version);

-- ---------------------------------------------------------------------------
-- ai_interpretations
-- ---------------------------------------------------------------------------

create table public.ai_interpretations (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  status text not null default 'pendente' check (
    status in ('pendente', 'processando', 'concluido', 'falhou')
  ),
  input_ref text,
  result jsonb,
  prompt_version text,
  schema_version text,
  model_version text,
  uncertain_fields jsonb,
  usage jsonb,
  estimated_cost_cents integer,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_interpretations_quote_id_idx on public.ai_interpretations (quote_id);

-- ---------------------------------------------------------------------------
-- quote_events
-- ---------------------------------------------------------------------------

create table public.quote_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users (id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index quote_events_quote_id_idx on public.quote_events (quote_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.customers enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_versions enable row level security;
alter table public.ai_interpretations enable row level security;
alter table public.quote_events enable row level security;

-- profiles: a user can only see and manage their own profile.
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- organizations: visible and manageable by members.
create policy "organizations_select_member" on public.organizations
  for select using (public.is_org_member(id));
create policy "organizations_insert_owner" on public.organizations
  for insert with check (owner_user_id = auth.uid());
create policy "organizations_update_member" on public.organizations
  for update using (public.is_org_member(id));

-- organization_members: visible to fellow members; only the row owner or an
-- existing member can add rows (bootstrap covers the very first owner row).
create policy "organization_members_select_member" on public.organization_members
  for select using (public.is_org_member(organization_id));
create policy "organization_members_insert_member" on public.organization_members
  for insert with check (
    user_id = auth.uid() or public.is_org_member(organization_id)
  );
create policy "organization_members_update_member" on public.organization_members
  for update using (public.is_org_member(organization_id));
create policy "organization_members_delete_member" on public.organization_members
  for delete using (public.is_org_member(organization_id));

-- customers
create policy "customers_all_member" on public.customers
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- quotes
create policy "quotes_all_member" on public.quotes
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- quote_items (scoped through the parent quote's organization)
create policy "quote_items_all_member" on public.quote_items
  for all using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_items.quote_id
        and public.is_org_member(q.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.quotes q
      where q.id = quote_items.quote_id
        and public.is_org_member(q.organization_id)
    )
  );

-- quote_versions (immutable snapshots; select only, writes go through
-- privileged Edge Functions using the service role)
create policy "quote_versions_select_member" on public.quote_versions
  for select using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_versions.quote_id
        and public.is_org_member(q.organization_id)
    )
  );

-- ai_interpretations
create policy "ai_interpretations_all_member" on public.ai_interpretations
  for all using (
    exists (
      select 1 from public.quotes q
      where q.id = ai_interpretations.quote_id
        and public.is_org_member(q.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.quotes q
      where q.id = ai_interpretations.quote_id
        and public.is_org_member(q.organization_id)
    )
  );

-- quote_events (append-only audit trail; select only for members, writes go
-- through privileged Edge Functions using the service role)
create policy "quote_events_select_member" on public.quote_events
  for select using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_events.quote_id
        and public.is_org_member(q.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Table grants
-- ---------------------------------------------------------------------------
-- RLS policies only filter *which rows* a role can see or touch; the role
-- also needs the underlying SQL privilege to reach the table at all. Recent
-- Supabase projects no longer auto-expose new tables to the Data API roles
-- (see `auto_expose_new_tables` in supabase/config.toml), so these grants
-- are required, not optional.

grant usage on schema public to authenticated, service_role;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.quotes to authenticated;
grant select, insert, update, delete on public.quote_items to authenticated;
grant select on public.quote_versions to authenticated;
grant select, insert, update on public.ai_interpretations to authenticated;
grant select on public.quote_events to authenticated;

grant all on
  public.profiles,
  public.organizations,
  public.organization_members,
  public.customers,
  public.quotes,
  public.quote_items,
  public.quote_versions,
  public.ai_interpretations,
  public.quote_events
to service_role;
