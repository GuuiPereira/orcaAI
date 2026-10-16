-- Fase 5 (Grafana, .tasks/fase-5-grafana.md passo 2): views pro painel -
-- só contagens, somas e tempos (RNF-008), igual às de
-- 20260923203000_metrics_views.sql. Mesma regra de acesso: revogado de
-- anon/authenticated, liberado só pro service_role (o Grafana entra por um
-- papel de leitura dedicado, passo 3 desta fase).

-- Latência do LLM (p50/p95), por dia e por modelo. Só chamadas CONCLUÍDAS -
-- latência de uma chamada que falhou não é "quanto tempo até o resultado"
-- (falhas por dia já aparecem em metrics_ai_daily.failed).
create view public.metrics_ai_latency_daily as
select
  created_at::date as day,
  model_version,
  count(*) as measured,
  percentile_cont(0.5) within group (order by latency_ms) as p50_ms,
  percentile_cont(0.95) within group (order by latency_ms) as p95_ms
from public.ai_interpretations
where status = 'concluido' and latency_ms is not null
group by 1, 2;

-- Uso por organização e por dia: interpretações, tokens, custo (da IA de
-- interpretação - o custo de áudio/imagem da Fase 4A entra no acumulado
-- mensal abaixo, que soma as duas fontes) e orçamentos criados/emitidos.
-- Identificação da organização (decisão do usuário, 2026-10-15): id curto +
-- `trade_name` - ciente de que pode ser dado pessoal se o testador usou o
-- próprio nome como razão social; só o operador vê este painel.
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

-- Custo acumulado por mês (interpretação + áudio/imagem da Fase 4A) e custo
-- por orçamento emitido naquele mês (PRD §11: "custo de IA por orçamento").
-- Projeção fica a cargo do painel (recurso pronto do Grafana) - aqui só o
-- acumulado real.
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

-- Tempo até compartilhar (criado -> 1º "compartilhado"), mediana e p90 -
-- north star do PRD §11. Coorte pelo dia de CRIAÇÃO do orçamento (não do
-- compartilhamento), pra medir "quanto tempo depois de criado" de verdade.
create view public.metrics_time_to_share_daily as
with first_share as (
  select quote_id, min(created_at) as shared_at
  from public.quote_events
  where event_type = 'compartilhado'
  group by quote_id
)
select
  q.created_at::date as day,
  count(*) as quotes_shared,
  percentile_cont(0.5) within group (
    order by extract(epoch from (fs.shared_at - q.created_at))
  ) as median_seconds_to_share,
  percentile_cont(0.9) within group (
    order by extract(epoch from (fs.shared_at - q.created_at))
  ) as p90_seconds_to_share
from public.quotes q
join first_share fs on fs.quote_id = q.id
group by 1;

-- Qualidade da IA por versão de prompt (PRD §11: "% aceito sem alteração /
-- média de campos alterados"). "Sem alteração" = nada mudou, nada foi
-- adicionado, nada foi removido - o usuário emitiu exatamente o que a IA
-- devolveu.
create view public.metrics_ai_quality_by_prompt as
select
  ai.prompt_version,
  count(*) as quotes_compared,
  round(
    100.0 * count(*) filter (
      where qm.items_changed = 0 and qm.items_added = 0 and qm.items_removed = 0
    ) / count(*),
    1
  ) as pct_fully_accepted,
  round(avg(qm.fields_changed), 2) as avg_fields_changed,
  round(avg(qm.items_added), 2) as avg_items_added,
  round(avg(qm.items_removed), 2) as avg_items_removed
from public.ai_quality_metrics qm
join public.ai_interpretations ai on ai.id = qm.interpretation_id
group by 1;

-- O funil (task 8) ganha o passo "compartilhado" entre emitido e
-- enviado/aprovado - mesmas colunas de antes, `create or replace` preserva
-- os grants já concedidos.
create or replace view public.metrics_funnel_daily as
select created_at::date as day, 'criado' as step, count(*) as total
from public.quotes group by 1
union all
select created_at::date, 'interpretado', count(distinct quote_id)
from public.ai_interpretations where status = 'concluido' group by 1
union all
select created_at::date, event_type, count(*)
from public.quote_events
where event_type in ('emitido', 'enviado', 'aprovado', 'recusado', 'expirado', 'compartilhado')
group by 1, 2;

revoke all on
  public.metrics_ai_latency_daily,
  public.metrics_usage_daily,
  public.metrics_cost_monthly,
  public.metrics_time_to_share_daily,
  public.metrics_ai_quality_by_prompt
  from public, anon, authenticated;
grant select on
  public.metrics_ai_latency_daily,
  public.metrics_usage_daily,
  public.metrics_cost_monthly,
  public.metrics_time_to_share_daily,
  public.metrics_ai_quality_by_prompt
  to service_role;
