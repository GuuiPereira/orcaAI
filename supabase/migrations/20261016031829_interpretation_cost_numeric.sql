-- Fase 5 (Grafana): `ai_interpretations.estimated_cost_cents` era `integer`
-- (Task 8) - uma interpretação com o gpt-5.6-luna custa ~0,06 centavo e
-- arredondava pra 0, então o custo de interpretação sumia do dashboard e do
-- alerta diário (`check-ai-cost`). Vira `numeric` como em
-- `input_extractions.estimated_cost_cents` (Fase 4A), e `interpret-quote`
-- passa a gravar o valor exato. Linhas antigas ficam como estão (o 0
-- arredondado não é recalculado).
--
-- O Postgres não deixa trocar o tipo de uma coluna usada por view: as 3 que
-- dependem dela são derrubadas e recriadas com a mesma definição, e os
-- grants (service_role + grafana_reader) refeitos.

drop view public.metrics_ai_daily;
drop view public.metrics_usage_daily;
drop view public.metrics_cost_monthly;

alter table public.ai_interpretations
  alter column estimated_cost_cents type numeric using estimated_cost_cents::numeric;

-- Mesma definição de 20260923203000_metrics_views.sql.
create view public.metrics_ai_daily as
select
  created_at::date as day,
  prompt_version,
  schema_version,
  model_version,
  count(*) as interpretations,
  count(*) filter (where status = 'concluido') as succeeded,
  count(*) filter (where status = 'falhou') as failed,
  count(*) filter (where error like 'invalid_ai_schema%') as invalid_schema,
  coalesce(sum(estimated_cost_cents), 0) as cost_cents,
  -- modelo fora da tabela de preços: custo fica null (nunca chutado) e
  -- não entra na soma - esta coluna mostra quantas ficaram de fora.
  count(*) filter (where status = 'concluido' and estimated_cost_cents is null) as unpriced
from public.ai_interpretations
group by 1, 2, 3, 4;

-- Mesmas definições de 20261016022810_grafana_metric_views.sql.
create view public.metrics_usage_daily as
with ai as (
  select
    q.organization_id,
    ai.created_at::date as day,
    count(*) as interpretations,
    coalesce(sum(
      coalesce((ai.usage ->> 'input_tokens')::bigint, 0) + coalesce((ai.usage ->> 'output_tokens')::bigint, 0)
    ), 0) as tokens,
    coalesce(sum(ai.estimated_cost_cents), 0) as cost_cents
  from public.ai_interpretations ai
  join public.quotes q on q.id = ai.quote_id
  group by 1, 2
),
created as (
  select organization_id, created_at::date as day, count(*) as quotes_created
  from public.quotes
  group by 1, 2
),
issued as (
  select organization_id, issued_at::date as day, count(*) as quotes_issued
  from public.quotes
  where issued_at is not null
  group by 1, 2
)
select
  o.id as organization_id,
  left(o.id::text, 8) as organization_short_id,
  o.trade_name,
  coalesce(ai.day, created.day, issued.day) as day,
  coalesce(ai.interpretations, 0) as interpretations,
  coalesce(ai.tokens, 0) as tokens,
  coalesce(ai.cost_cents, 0) as cost_cents,
  coalesce(created.quotes_created, 0) as quotes_created,
  coalesce(issued.quotes_issued, 0) as quotes_issued
from ai
full join created
  on created.organization_id = ai.organization_id and created.day = ai.day
full join issued
  on issued.organization_id = coalesce(ai.organization_id, created.organization_id)
  and issued.day = coalesce(ai.day, created.day)
join public.organizations o on o.id = coalesce(ai.organization_id, created.organization_id, issued.organization_id);

create view public.metrics_cost_monthly as
with interpretation_cost as (
  select date_trunc('month', created_at)::date as month, coalesce(sum(estimated_cost_cents), 0) as cost_cents
  from public.ai_interpretations
  group by 1
),
extraction_cost as (
  select date_trunc('month', created_at)::date as month, coalesce(sum(estimated_cost_cents), 0) as cost_cents
  from public.input_extractions
  group by 1
),
issued as (
  select date_trunc('month', issued_at)::date as month, count(*) as quotes_issued
  from public.quotes
  where issued_at is not null
  group by 1
)
select
  coalesce(interpretation_cost.month, extraction_cost.month, issued.month) as month,
  coalesce(interpretation_cost.cost_cents, 0) as interpretation_cost_cents,
  coalesce(extraction_cost.cost_cents, 0) as extraction_cost_cents,
  coalesce(interpretation_cost.cost_cents, 0) + coalesce(extraction_cost.cost_cents, 0) as total_cost_cents,
  coalesce(issued.quotes_issued, 0) as quotes_issued,
  case
    when coalesce(issued.quotes_issued, 0) > 0
      then round(
        (coalesce(interpretation_cost.cost_cents, 0) + coalesce(extraction_cost.cost_cents, 0))::numeric
          / issued.quotes_issued,
        4
      )
    else null
  end as cost_cents_per_quote_issued
from interpretation_cost
full join extraction_cost on extraction_cost.month = interpretation_cost.month
full join issued on issued.month = coalesce(interpretation_cost.month, extraction_cost.month);

revoke all on public.metrics_ai_daily, public.metrics_usage_daily, public.metrics_cost_monthly
  from public, anon, authenticated;
grant select on public.metrics_ai_daily, public.metrics_usage_daily, public.metrics_cost_monthly
  to service_role, grafana_reader;
