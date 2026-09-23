-- Métricas de operação (task 8, docs/ARCHITECTURE.md §11): custo/falha da IA,
-- funil de criação e cobertura de PDF. Só contagens e somas - nenhum texto,
-- nome, telefone ou conteúdo de item passa por aqui (RNF-008).
--
-- Agregam dados de TODAS as organizações (é visão do operador, não de um
-- prestador), e como as views rodam com os direitos do dono (ignoram RLS),
-- o acesso é revogado de anon/authenticated e liberado só pro service_role.

-- Custo em centavos de DÓLAR (mesma unidade de ai_interpretations.
-- estimated_cost_cents / packages/shared model-pricing).
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

-- Uma linha por (dia, etapa). "criado"/"interpretado" vêm das tabelas; o
-- resto de quote_events.
create view public.metrics_funnel_daily as
select created_at::date as day, 'criado' as step, count(*) as total
from public.quotes group by 1
union all
select created_at::date, 'interpretado', count(distinct quote_id)
from public.ai_interpretations where status = 'concluido' group by 1
union all
select created_at::date, event_type, count(*)
from public.quote_events
where event_type in ('emitido', 'enviado', 'aprovado', 'recusado', 'expirado')
group by 1, 2;

-- Versões emitidas com/sem PDF salvo (task 6). Só o app nativo salva o PDF
-- (no navegador é no-op), então "sem PDF" alto em teste web é esperado.
create view public.metrics_pdf_coverage as
select
  count(*) as versions,
  count(*) filter (where pdf_path is not null) as with_pdf,
  count(*) filter (where pdf_path is null) as without_pdf
from public.quote_versions;

revoke all on public.metrics_ai_daily, public.metrics_funnel_daily, public.metrics_pdf_coverage
  from public, anon, authenticated;
grant select on public.metrics_ai_daily, public.metrics_funnel_daily, public.metrics_pdf_coverage
  to service_role;
