-- Fase 3 - planos (.tasks/fase-3-planos.md, etapa 1): Gratuito x Profissional,
-- com cobrança MANUAL nesta etapa (o admin ativa o plano da organização no
-- painel, com validade). Decisões do usuário em 2026-10-16.

-- ---------------------------------------------------------------- planos
-- O que cada plano libera. Ajustável por SQL sem deploy (ex.: o limite do
-- gratuito). `monthly_issued_quotes` null = ilimitado.
create table public.plans (
  code text primary key check (code in ('gratuito', 'profissional')),
  name text not null,
  monthly_issued_quotes integer check (monthly_issued_quotes > 0),
  pdf_branding boolean not null,
  company_logo_in_pdf boolean not null,
  audio_image_input boolean not null
);

insert into public.plans (code, name, monthly_issued_quotes, pdf_branding, company_logo_in_pdf, audio_image_input)
values
  ('gratuito', 'Gratuito', 3, true, false, false),
  ('profissional', 'Profissional', null, false, true, true);

alter table public.plans enable row level security;
revoke all on public.plans from public, anon, authenticated;
grant select on public.plans to service_role;

-- ---------------------------------------------------------------- assinatura
-- Sem linha = Gratuito. Vencida = Gratuito de novo, sozinho (calculado na
-- leitura, sem rotina agendada). Só o admin (por função) escreve.
create table public.organization_subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  plan_code text not null references public.plans (code),
  expires_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'signup')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.organization_subscriptions enable row level security;
revoke all on public.organization_subscriptions from public, anon, authenticated;
grant select on public.organization_subscriptions to service_role;

-- ---------------------------------------------------------------- cadastro
-- Plano de quem cria uma organização a partir de agora. Durante o teste
-- fechado os testadores entram no Profissional (decisão do usuário); quando
-- o teste acabar, o admin troca para Gratuito no painel. Uma linha só.
create table public.plan_settings (
  id boolean primary key default true check (id),
  signup_plan_code text not null references public.plans (code),
  signup_plan_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.plan_settings (signup_plan_code) values ('profissional');

alter table public.plan_settings enable row level security;
revoke all on public.plan_settings from public, anon, authenticated;
grant select on public.plan_settings to service_role;

create function public.apply_signup_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.plan_settings;
begin
  select * into settings from public.plan_settings limit 1;
  if settings.signup_plan_code is not null and settings.signup_plan_code <> 'gratuito' then
    insert into public.organization_subscriptions (organization_id, plan_code, expires_at, source)
    values (new.id, settings.signup_plan_code, settings.signup_plan_expires_at, 'signup')
    on conflict (organization_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.apply_signup_plan() from public, anon, authenticated;

create trigger organizations_apply_signup_plan
  after insert on public.organizations
  for each row execute function public.apply_signup_plan();

-- Transição: quem já existe vira Profissional sem vencimento - nada muda pra
-- quem já usa (inclui o próprio usuário e os testes no hospedado).
insert into public.organization_subscriptions (organization_id, plan_code, source)
select o.id, 'profissional', 'manual' from public.organizations o
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------- direitos
-- Plano efetivo e o que ele libera, + emitidos no mês. "Mês" = mês civil no
-- fuso de Brasília; "emitido" = 1ª emissão de cada orçamento (evento
-- `emitido` - reemitir não conta). Uso: functions (service_role) e o painel.
create function public.organization_entitlements(target_organization_id uuid)
returns table (
  plan_code text,
  plan_name text,
  expires_at timestamptz,
  expired_plan_code text,
  expired_at timestamptz,
  monthly_issued_quotes integer,
  issued_this_month bigint,
  pdf_branding boolean,
  company_logo_in_pdf boolean,
  audio_image_input boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with sub as (
    select s.plan_code, s.expires_at,
           (s.expires_at is null or s.expires_at > now()) as active
    from public.organization_subscriptions s
    where s.organization_id = target_organization_id
  ),
  effective as (
    select coalesce((select sub.plan_code from sub where sub.active), 'gratuito') as code
  )
  select
    p.code,
    p.name,
    (select sub.expires_at from sub where sub.active),
    (select sub.plan_code from sub where not sub.active),
    (select sub.expires_at from sub where not sub.active),
    p.monthly_issued_quotes,
    (select count(*) from public.quote_events e join public.quotes q on q.id = e.quote_id
      where q.organization_id = target_organization_id
        and e.event_type = 'emitido'
        and e.created_at >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')),
    p.pdf_branding,
    p.company_logo_in_pdf,
    p.audio_image_input
  from effective
  join public.plans p on p.code = effective.code
  where exists (select 1 from public.organizations o where o.id = target_organization_id);
$$;

revoke all on function public.organization_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.organization_entitlements(uuid) to service_role;

-- O app lê os direitos da PRÓPRIA organização (Perfil, PDF, cadeado de
-- áudio/imagem). Não aceita id - não dá pra espiar a organização dos outros.
create function public.my_entitlements()
returns table (
  plan_code text,
  plan_name text,
  expires_at timestamptz,
  expired_plan_code text,
  expired_at timestamptz,
  monthly_issued_quotes integer,
  issued_this_month bigint,
  pdf_branding boolean,
  company_logo_in_pdf boolean,
  audio_image_input boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select e.*
  from (
    select m.organization_id from public.organization_members m
    where m.user_id = auth.uid() and m.status = 'active'
    limit 1
  ) mine
  cross join lateral public.organization_entitlements(mine.organization_id) e;
$$;

revoke all on function public.my_entitlements() from public, anon;
grant execute on function public.my_entitlements() to authenticated;

-- ---------------------------------------------------------------- painel
alter table public.admin_actions drop constraint admin_actions_action_check;
alter table public.admin_actions add constraint admin_actions_action_check check (
  action in ('set_limits', 'suspend', 'reactivate', 'unstick_interpretation', 'set_plan', 'set_signup_plan')
);

-- Plano de uma organização (cobrança manual). Gratuito = sem assinatura.
-- `expires_at` null = sem vencimento; se informado, tem que ser no futuro.
create function public.admin_set_plan(
  target_organization_id uuid,
  plan_code text,
  expires_at timestamptz,
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
  if not exists (select 1 from public.plans p where p.code = admin_set_plan.plan_code) then
    raise exception 'unknown plan' using errcode = 'PT400';
  end if;
  if admin_set_plan.expires_at is not null and admin_set_plan.expires_at <= now() then
    raise exception 'expires_at must be in the future' using errcode = 'PT400';
  end if;

  select jsonb_build_object('plan', s.plan_code, 'expires_at', s.expires_at)
    into previous
    from public.organization_subscriptions s where s.organization_id = target_organization_id;

  if admin_set_plan.plan_code = 'gratuito' then
    delete from public.organization_subscriptions s where s.organization_id = target_organization_id;
  else
    insert into public.organization_subscriptions as s (organization_id, plan_code, expires_at, source, updated_at, updated_by)
    values (target_organization_id, admin_set_plan.plan_code, admin_set_plan.expires_at, 'manual', now(), auth.uid())
    on conflict (organization_id) do update
      set plan_code = excluded.plan_code, expires_at = excluded.expires_at, source = 'manual',
          updated_at = now(), updated_by = excluded.updated_by;
  end if;

  insert into public.admin_actions (admin_user_id, action, organization_id, reason, details)
  values (auth.uid(), 'set_plan', target_organization_id, btrim(reason), jsonb_build_object(
    'plan', admin_set_plan.plan_code,
    'expires_at', admin_set_plan.expires_at,
    'previous', coalesce(previous, jsonb_build_object('plan', 'gratuito', 'expires_at', null))
  ));
end;
$$;

-- Plano de quem se cadastrar daqui pra frente (ex.: Profissional durante o
-- teste fechado, Gratuito depois). Não mexe em quem já existe.
create function public.admin_get_signup_plan()
returns table (signup_plan_code text, signup_plan_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  perform public.assert_platform_admin();
  return query select s.signup_plan_code, s.signup_plan_expires_at from public.plan_settings s;
end;
$$;

create function public.admin_set_signup_plan(plan_code text, expires_at timestamptz, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous jsonb;
begin
  perform public.assert_platform_admin();
  if reason is null or char_length(btrim(reason)) not between 3 and 500 then
    raise exception 'reason must have 3 to 500 characters' using errcode = 'PT400';
  end if;
  if not exists (select 1 from public.plans p where p.code = admin_set_signup_plan.plan_code) then
    raise exception 'unknown plan' using errcode = 'PT400';
  end if;
  if admin_set_signup_plan.expires_at is not null and admin_set_signup_plan.expires_at <= now() then
    raise exception 'expires_at must be in the future' using errcode = 'PT400';
  end if;

  select jsonb_build_object('plan', s.signup_plan_code, 'expires_at', s.signup_plan_expires_at)
    into previous from public.plan_settings s;

  update public.plan_settings
     set signup_plan_code = admin_set_signup_plan.plan_code,
         signup_plan_expires_at = case when admin_set_signup_plan.plan_code = 'gratuito' then null
                                       else admin_set_signup_plan.expires_at end,
         updated_at = now()
   -- tabela de uma linha só, mas o Supabase recusa UPDATE sem WHERE (safeupdate)
   where id;

  insert into public.admin_actions (admin_user_id, action, organization_id, reason, details)
  values (auth.uid(), 'set_signup_plan', null, btrim(reason), jsonb_build_object(
    'plan', admin_set_signup_plan.plan_code,
    'expires_at', admin_set_signup_plan.expires_at,
    'previous', previous
  ));
end;
$$;

revoke all on function public.admin_set_plan(uuid, text, timestamptz, text) from public, anon;
revoke all on function public.admin_get_signup_plan() from public, anon;
revoke all on function public.admin_set_signup_plan(text, timestamptz, text) from public, anon;
grant execute on function public.admin_set_plan(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.admin_get_signup_plan() to authenticated;
grant execute on function public.admin_set_signup_plan(text, timestamptz, text) to authenticated;

-- A lista do painel (e o detalhe, que monta `organization` a partir dela)
-- ganha plano, validade e emitidos no mês. Colunas novas = recriar a função.
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
  extractions_24h bigint,
  plan_code text,
  plan_name text,
  plan_expires_at timestamptz,
  expired_plan_code text,
  expired_at timestamptz,
  monthly_issued_quotes integer,
  issued_this_month bigint
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
    quota.extractions_24h,
    ent.plan_code,
    ent.plan_name,
    ent.expires_at,
    ent.expired_plan_code,
    ent.expired_at,
    ent.monthly_issued_quotes,
    ent.issued_this_month
  from public.organizations o
  cross join lateral public.organization_ai_quota(o.id) quota
  cross join lateral public.organization_entitlements(o.id) ent
  where target_organization_id is null or o.id = target_organization_id
  order by 11 desc;
end;
$$;

revoke all on function public.admin_list_organizations(uuid) from public, anon;
grant execute on function public.admin_list_organizations(uuid) to authenticated;
