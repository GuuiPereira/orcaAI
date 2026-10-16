-- Fase 5 (Grafana, .tasks/fase-5-grafana.md passo 3): papel de leitura
-- dedicado pro Grafana - SELECT só nas views de métricas, nada nas tabelas
-- base. Nunca a chave `service_role`.
--
-- A SENHA NUNCA fica no repositório: esta migração cria o papel sem senha
-- utilizável (`login` sem hash de senha não autentica nada) - a senha de
-- verdade é definida depois, fora do histórico de migrações, com
-- `ALTER ROLE grafana_reader WITH PASSWORD '...'` (local e no hospedado,
-- cada ambiente com a sua). Trocar a senha é só rodar esse mesmo comando de
-- novo - nenhum redeploy além de atualizar o data source do Grafana.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'grafana_reader') then
    create role grafana_reader with login;
  end if;
end
$$;

-- Nunca herda privilégio de outro papel (nem de `authenticated`/`anon`) e
-- nunca cria objetos - só lê o que for explicitamente concedido abaixo.
alter role grafana_reader nocreatedb nocreaterole noinherit;

grant usage on schema public to grafana_reader;
grant select on
  public.metrics_ai_daily,
  public.metrics_funnel_daily,
  public.metrics_pdf_coverage,
  public.metrics_extractions_daily,
  public.metrics_ai_latency_daily,
  public.metrics_usage_daily,
  public.metrics_cost_monthly,
  public.metrics_time_to_share_daily,
  public.metrics_ai_quality_by_prompt
  to grafana_reader;
