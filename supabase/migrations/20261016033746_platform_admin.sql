-- Fase 6 (painel admin, .tasks/fase-6-panel-admin.md passo 1): quem é
-- administrador da plataforma e a trilha de auditoria das ações dele.
--
-- Nenhum admin é criado aqui - o id de uma pessoa não entra no histórico de
-- migrações. O primeiro admin é incluído à mão, fora das migrações (ver
-- docs/AMBIENTE_LOCAL.md, "Painel admin").

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Ninguém lê nem escreve pela API: quem precisa saber se é admin chama
-- is_platform_admin() (só responde sobre o próprio usuário), e quem inclui
-- admin é o operador direto no banco.
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;
grant select on public.platform_admins to service_role;

create function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;

-- Auditoria das ações de admin (quem, o quê, em qual organização, por quê).
-- Append-only: só a function do painel grava (service_role), e nem ela pode
-- alterar ou apagar uma linha depois. `details` guarda só parâmetros da ação
-- (ex.: o limite novo) - nunca conteúdo de orçamento.
create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users (id) on delete set null,
  action text not null check (
    action in ('set_limits', 'suspend', 'reactivate', 'unstick_interpretation')
  ),
  -- set null (não cascade): o registro da ação sobrevive à exclusão da
  -- organização, só perde o vínculo.
  organization_id uuid references public.organizations (id) on delete set null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_actions_organization_id_idx on public.admin_actions (organization_id, created_at desc);

alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from public, anon, authenticated, service_role;
grant select, insert on public.admin_actions to service_role;
