-- Fase 6 (painel admin, .tasks/fase-6-panel-admin.md passo 2): leitura do
-- painel - lista de organizações e detalhe de uma, SÓ METADADOS (decisão do
-- usuário, 2026-10-16: o admin nunca vê conteúdo de orçamento - nem texto,
-- itens, nomes, telefones ou e-mails; RF-082).
--
-- Funções `security definer` chamadas por `rpc`, em vez de uma Edge Function:
-- agregar por dia/organização é natural em SQL, e as ações do passo 3 gravam
-- a mudança e a auditoria na mesma transação. Toda função começa por
-- assert_platform_admin() - um usuário comum recebe 403 (errcode 42501).

create function public.assert_platform_admin()
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin required' using errcode = '42501';
  end if;
end;
$$;

-- Só as outras funções do painel chamam (rodam como dono, então podem).
revoke all on function public.assert_platform_admin() from public, anon, authenticated;

-- Uma linha por organização (ou só a pedida). Custos em centavos de dólar,
-- estimados; "30 dias" é janela móvel.
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
  owner_pending_deletion boolean
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
    exists (select 1 from public.account_deletion_requests r where r.user_id = o.owner_user_id)
  from public.organizations o
  where target_organization_id is null or o.id = target_organization_id
  order by 11 desc;
end;
$$;

-- Detalhe de uma organização: membros (só id curto e papel), uso por dia nos
-- últimos 30 dias, erros recentes (só o código do erro), linha do tempo
-- (só tipo de evento e número do orçamento) e as ações de admin nela.
create function public.admin_organization_detail(target_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result jsonb;
begin
  perform public.assert_platform_admin();

  if not exists (select 1 from public.organizations o where o.id = target_organization_id) then
    raise exception 'organization not found' using errcode = 'PT404';
  end if;

  select jsonb_build_object(
    'organization',
      (select to_jsonb(x) from public.admin_list_organizations(target_organization_id) x),
    'members',
      (select coalesce(jsonb_agg(jsonb_build_object(
          'user_short_id', left(m.user_id::text, 8),
          'role', m.role,
          'status', m.status,
          'joined_at', m.created_at
        ) order by m.created_at), '[]'::jsonb)
       from public.organization_members m where m.organization_id = target_organization_id),
    'daily',
      (select jsonb_agg(jsonb_build_object(
          'day', d.day,
          'interpretations', (select count(*) from public.ai_interpretations ai
                                join public.quotes q on q.id = ai.quote_id
                                where q.organization_id = target_organization_id and ai.created_at::date = d.day),
          'extractions', (select count(*) from public.input_extractions e
                            where e.organization_id = target_organization_id and e.created_at::date = d.day),
          'quotes_created', (select count(*) from public.quotes q
                               where q.organization_id = target_organization_id and q.created_at::date = d.day),
          'quotes_issued', (select count(*) from public.quotes q
                              where q.organization_id = target_organization_id and q.issued_at::date = d.day),
          'cost_cents',
            coalesce((select sum(ai.estimated_cost_cents) from public.ai_interpretations ai
                        join public.quotes q on q.id = ai.quote_id
                        where q.organization_id = target_organization_id and ai.created_at::date = d.day), 0)
            + coalesce((select sum(e.estimated_cost_cents) from public.input_extractions e
                          where e.organization_id = target_organization_id and e.created_at::date = d.day), 0)
        ) order by d.day)
       from (select generate_series(current_date - 29, current_date, interval '1 day')::date as day) d),
    'recent_errors',
      (select coalesce(jsonb_agg(err order by err ->> 'at' desc), '[]'::jsonb)
       from (
         (select jsonb_build_object('at', ai.created_at, 'source', 'interpretacao', 'code', ai.error) as err
          from public.ai_interpretations ai join public.quotes q on q.id = ai.quote_id
          where q.organization_id = target_organization_id and ai.status = 'falhou'
          order by ai.created_at desc limit 10)
         union all
         (select jsonb_build_object('at', e.created_at, 'source', e.kind, 'code', e.error)
          from public.input_extractions e
          where e.organization_id = target_organization_id and e.status = 'falhou'
          order by e.created_at desc limit 10)
       ) errors),
    'timeline',
      (select coalesce(jsonb_agg(ev order by ev ->> 'at' desc), '[]'::jsonb)
       from (
         select jsonb_build_object('at', qe.created_at, 'event', qe.event_type, 'quote_number', q.number) as ev
         from public.quote_events qe join public.quotes q on q.id = qe.quote_id
         where q.organization_id = target_organization_id
         order by qe.created_at desc limit 20
       ) events),
    'admin_actions',
      (select coalesce(jsonb_agg(act order by act ->> 'at' desc), '[]'::jsonb)
       from (
         select jsonb_build_object('at', a.created_at, 'action', a.action, 'reason', a.reason, 'details', a.details) as act
         from public.admin_actions a
         where a.organization_id = target_organization_id
         order by a.created_at desc limit 20
       ) actions)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_list_organizations(uuid) from public, anon;
revoke all on function public.admin_organization_detail(uuid) from public, anon;
grant execute on function public.admin_list_organizations(uuid) to authenticated;
grant execute on function public.admin_organization_detail(uuid) to authenticated;
