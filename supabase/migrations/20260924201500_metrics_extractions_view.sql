-- Fase 4A: custo/falha das leituras de áudio e imagem (input_extractions),
-- no mesmo formato de metrics_ai_daily. Só contagens e somas - nenhum
-- conteúdo (a tabela nem tem coluna de conteúdo). Mesma regra de acesso das
-- outras views de métricas: só service_role.
create view public.metrics_extractions_daily as
select
  created_at::date as day,
  kind,
  model,
  count(*) as extractions,
  count(*) filter (where status = 'concluido') as succeeded,
  count(*) filter (where status = 'falhou') as failed,
  count(*) filter (where error = 'no_text') as no_text,
  -- falhas também gastam (a chamada à OpenAI já foi feita), então o custo
  -- soma tudo, como em metrics_ai_daily.
  coalesce(sum(estimated_cost_cents), 0) as cost_cents,
  count(*) filter (where status = 'concluido' and estimated_cost_cents is null) as unpriced
from public.input_extractions
group by 1, 2, 3;

revoke all on public.metrics_extractions_daily from anon, authenticated;
grant select on public.metrics_extractions_daily to service_role;
