-- Fase 6 (painel admin, .tasks/fase-6-panel-admin.md passo 3): o que o admin
-- consegue FAZER - limite de IA por organização, suspender/reativar e
-- destravar interpretação presa - e onde isso é aplicado. Toda ação grava a
-- mudança e a auditoria (admin_actions) na mesma transação, com motivo.

-- ---------------------------------------------------------------- suspensão
-- Suspender bloqueia IA e emissão (as functions recusam, o app mostra um
-- aviso) sem apagar nem esconder dado nenhum.
alter table public.organizations add column suspended_at timestamptz;

-- O membro pode atualizar a própria organização (perfil) - mas não pode
-- tirar a própria suspensão. Só quem não é `authenticated`/`anon` (as
-- funções do painel, que rodam como dono) mexe nessa coluna.
create function public.protect_organization_suspension()
returns trigger
language plpgsql
as $$
begin
  if new.suspended_at is distinct from old.suspended_at and current_user in ('authenticated', 'anon') then
    raise exception 'suspended_at can only be changed by a platform admin' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organizations_protect_suspension
  before update on public.organizations
  for each row execute function public.protect_organization_suspension();

-- ---------------------------------------------------------------- limites
-- Quantidade por janela móvel de 24h (decisão do usuário, 2026-10-16), por
-- organização. Sem linha (ou coluna null) = padrão do sistema, definido em
-- organization_ai_quota() abaixo.
create table public.organization_limits (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  daily_interpretations integer check (daily_interpretations > 0),
  daily_extractions integer check (daily_extractions > 0),
  updated_at timestamptz not null default now()
);

alter table public.organization_limits enable row level security;
revoke all on public.organization_limits from public, anon, authenticated;
grant select on public.organization_limits to service_role;

-- Limite efetivo + uso nas últimas 24h + suspensão, numa chamada só - é o
-- que `interpret-quote`/`extract-input` consultam antes de gastar IA, e o que
-- o painel mostra. Padrões do sistema: 100 interpretações e 60 leituras de
-- áudio/imagem (os 60 já eram o limite da Fase 4A) por organização a cada 24h.
create function public.organization_ai_quota(target_organization_id uuid)
returns table (
  daily_interpretations integer,
  daily_extractions integer,
  limits_overridden boolean,
  interpretations_24h bigint,
  extractions_24h bigint,
  suspended boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(l.daily_interpretations, 100),
    coalesce(l.daily_extractions, 60),
    (l.daily_interpretations is not null or l.daily_extractions is not null),
    (select count(*) from public.ai_interpretations ai join public.quotes q on q.id = ai.quote_id
       where q.organization_id = o.id and ai.created_at >= now() - interval '24 hours'),
    (select count(*) from public.input_extractions e
       where e.organization_id = o.id and e.created_at >= now() - interval '24 hours'),
    o.suspended_at is not null
  from public.organizations o
  left join public.organization_limits l on l.organization_id = o.id
  where o.id = target_organization_id;
$$;

revoke all on function public.organization_ai_quota(uuid) from public, anon, authenticated;
grant execute on function public.organization_ai_quota(uuid) to service_role;

-- ---------------------------------------------------------------- lista
-- A lista (e o detalhe, que monta a seção `organization` a partir dela)
-- passa a trazer suspensão, interpretações presas, limites e uso em 24h.
-- Mudar as colunas de retorno exige recriar a função.
drop function public.admin_list_organizations(uuid);

create function public.admin_list_organizations(target_organization_id uuid default null)
returns table (
  organization_id uuid,
  short_id text,
  trade_name text,
  created_at timestamptz,
  members bigint,
  quotes_total bigint,
  quotes_issued bigint,
  interpretations_30d bigint,
  extractions_30d bigint,
  cost_cents_30d numeric,
  last_activity_at timestamptz,
  owner_pending_deletion boolean,
  suspended_at timestamptz,
  stuck_interpretations bigint,
  daily_interpretations_limit integer,
  daily_extractions_limit integer,
  limits_overridden boolean,
  interpretations_24h bigint,
  extractions_24h bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.assert_platform_admin();

  return query
  select
    o.id,
    left(o.id::text, 8),
    o.trade_name,
    o.created_at,
    (select count(*) from public.organization_members m
       where m.organization_id = o.id and m.status = 'active'),
    (select count(*) from public.quotes q where q.organization_id = o.id),
    (select count(*) from public.quotes q where q.organization_id = o.id and q.issued_at is not null),
    (select count(*) from public.ai_interpretations ai join public.quotes q on q.id = ai.quote_id
       where q.organization_id = o.id and ai.created_at >= now() - interval '30 days'),
    (select count(*) from public.input_extractions e
       where e.organization_id = o.id and e.created_at >= now() - interval '30 days'),
    coalesce((select sum(ai.estimated_cost_cents) from public.ai_interpretations ai
                join public.quotes q on q.id = ai.quote_id
                where q.organization_id = o.id and ai.created_at >= now() - interval '30 days'), 0)
      + coalesce((select sum(e.estimated_cost_cents) from public.input_extractions e
                    where e.organization_id = o.id and e.created_at >= now() - interval '30 days'), 0),
    greatest(
      o.created_at,
      (select max(q.updated_at) from public.quotes q where q.organization_id = o.id),
      (select max(e.created_at) from public.input_extractions e where e.organization_id = o.id)
    ),
    exists (select 1 from public.account_deletion_requests r where r.user_id = o.owner_user_id),
    o.suspended_at,
    (select count(*) from public.ai_interpretations ai join public.quotes q on q.id = ai.quote_id
       where q.organization_id = o.id and ai.status = 'processando'
         and ai.created_at < now() - interval '10 minutes'),
    quota.daily_interpretations,
    quota.daily_extractions,
    quota.limits_overridden,
    quota.interpretations_24h,
    quota.extractions_24h
  from public.organizations o
  cross join lateral public.organization_ai_quota(o.id) quota
  where target_organization_id is null or o.id = target_organization_id
  order by 11 desc;
end;
$$;

revoke all on function public.admin_list_organizations(uuid) from public, anon;
grant execute on function public.admin_list_organizations(uuid) to authenticated;

-- ---------------------------------------------------------------- ações
-- Valida o motivo e garante que a organização existe. Erros com status HTTP
-- próprio (PTxxx): 400 motivo inválido, 404 organização, 409 nada a fazer.
create function public.admin_validate_action(target_organization_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.assert_platform_admin();
  if reason is null or char_length(btrim(reason)) not between 3 and 500 then
    raise exception 'reason must have 3 to 500 characters' using errcode = 'PT400';
  end if;
  if not exists (select 1 from public.organizations o where o.id = target_organization_id) then
    raise exception 'organization not found' using errcode = 'PT404';
  end if;
end;
$$;

revoke all on function public.admin_validate_action(uuid, text) from public, anon, authenticated;

-- Limite por organização. null = volta ao padrão do sistema naquele item.
create function public.admin_set_limits(
  target_organization_id uuid,
  daily_interpretations integer,
  daily_extractions integer,
  reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous jsonb;
begin
  perform public.admin_validate_action(target_organization_id, reason);
  if (daily_interpretations is not null and daily_interpretations <= 0)
     or (daily_extractions is not null and daily_extractions <= 0) then
    raise exception 'limits must be positive (or null for the default)' using errcode = 'PT400';
  end if;

  select jsonb_build_object('daily_interpretations', l.daily_interpretations,
                            'daily_extractions', l.daily_extractions)
    into previous
    from public.organization_limits l where l.organization_id = target_organization_id;

  if daily_interpretations is null and daily_extractions is null then
    delete from public.organization_limits l where l.organization_id = target_organization_id;
  else
    insert into public.organization_limits as l (organization_id, daily_interpretations, daily_extractions, updated_at)
    values (target_organization_id, admin_set_limits.daily_interpretations, admin_set_limits.daily_extractions, now())
    on conflict (organization_id) do update
      set daily_interpretations = excluded.daily_interpretations,
          daily_extractions = excluded.daily_extractions,
          updated_at = now();
  end if;

  insert into public.admin_actions (admin_user_id, action, organization_id, reason, details)
  values (auth.uid(), 'set_limits', target_organization_id, btrim(reason), jsonb_build_object(
    'daily_interpretations', admin_set_limits.daily_interpretations,
    'daily_extractions', admin_set_limits.daily_extractions,
    'previous', coalesce(previous, jsonb_build_object('daily_interpretations', null, 'daily_extractions', null))
  ));
end;
$$;

create function public.admin_suspend_organization(target_organization_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_validate_action(target_organization_id, reason);
  update public.organizations o set suspended_at = now()
    where o.id = target_organization_id and o.suspended_at is null;
  if not found then
    raise exception 'organization is already suspended' using errcode = 'PT409';
  end if;
  insert into public.admin_actions (admin_user_id, action, organization_id, reason)
  values (auth.uid(), 'suspend', target_organization_id, btrim(reason));
end;
$$;

create function public.admin_reactivate_organization(target_organization_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  suspended_since timestamptz;
begin
  perform public.admin_validate_action(target_organization_id, reason);
  select o.suspended_at into suspended_since from public.organizations o where o.id = target_organization_id;
  if suspended_since is null then
    raise exception 'organization is not suspended' using errcode = 'PT409';
  end if;
  update public.organizations o set suspended_at = null where o.id = target_organization_id;
  insert into public.admin_actions (admin_user_id, action, organization_id, reason, details)
  values (auth.uid(), 'reactivate', target_organization_id, btrim(reason),
          jsonb_build_object('suspended_since', suspended_since));
end;
$$;

-- Interpretação "presa": ficou em `processando` (ex.: a function caiu no meio)
-- e `interpret-quote` responde 409 pra sempre naquele orçamento. Marca as da
-- organização com mais de 10 minutos como falha - o próximo pedido refaz.
create function public.admin_unstick_interpretations(target_organization_id uuid, reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  unstuck integer;
begin
  perform public.admin_validate_action(target_organization_id, reason);
  update public.ai_interpretations ai
     set status = 'falhou', error = 'unstuck_by_admin', updated_at = now()
    from public.quotes q
   where q.id = ai.quote_id
     and q.organization_id = target_organization_id
     and ai.status = 'processando'
     and ai.created_at < now() - interval '10 minutes';
  get diagnostics unstuck = row_count;
  if unstuck = 0 then
    raise exception 'no stuck interpretations' using errcode = 'PT409';
  end if;
  insert into public.admin_actions (admin_user_id, action, organization_id, reason, details)
  values (auth.uid(), 'unstick_interpretation', target_organization_id, btrim(reason),
          jsonb_build_object('count', unstuck));
  return unstuck;
end;
$$;

revoke all on function public.admin_set_limits(uuid, integer, integer, text) from public, anon;
revoke all on function public.admin_suspend_organization(uuid, text) from public, anon;
revoke all on function public.admin_reactivate_organization(uuid, text) from public, anon;
revoke all on function public.admin_unstick_interpretations(uuid, text) from public, anon;
grant execute on function public.admin_set_limits(uuid, integer, integer, text) to authenticated;
grant execute on function public.admin_suspend_organization(uuid, text) to authenticated;
grant execute on function public.admin_reactivate_organization(uuid, text) to authenticated;
grant execute on function public.admin_unstick_interpretations(uuid, text) to authenticated;
