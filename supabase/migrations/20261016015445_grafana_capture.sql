-- Fase 5 (Grafana, .tasks/fase-5-grafana.md passo 1): captura o que falta
-- pra enxergar quem usa, quanto a IA leva e como ela se sai - sempre em
-- contagens/IDs/tempos, nunca conteúdo (RNF-008).

-- "Quem" chamou o LLM e "quanto tempo" levou (medido só em volta da chamada
-- à OpenAI, dentro de interpret-quote). Linhas anteriores a esta migração
-- ficam null nos dois - sem backfill inventado.
alter table public.ai_interpretations
  add column user_id uuid references auth.users (id) on delete set null,
  add column latency_ms integer;

-- "compartilhado" (o usuário tocou em compartilhar o PDF) passa a ser mais
-- um evento que o próprio membro registra direto (mesmo espírito da migração
-- 20260920174502_quote_events_user_insert.sql) - alimenta a north star do
-- PRD §11 ("tempo mediano até compartilhar um orçamento confirmado").
drop policy "quote_events_insert_member" on public.quote_events;
create policy "quote_events_insert_member" on public.quote_events
  for insert
  with check (
    event_type in ('criado', 'enviado', 'aprovado', 'recusado', 'expirado', 'compartilhado')
    and exists (
      select 1 from public.quotes q
      where q.id = quote_events.quote_id
        and public.is_org_member(q.organization_id)
    )
  );

-- Qualidade da IA (PRD §11: "% aceito sem alteração / média de campos
-- alterados") - só contagens, nunca o texto comparado. Uma linha por emissão
-- que tinha uma interpretação de IA concluída pra comparar (gravada por
-- `issue-quote`, comparando por posição o que a IA devolveu com o que foi
-- de fato emitido - é uma aproximação pra tendência em dashboard, não uma
-- auditoria exata de um orçamento específico: reordenar/inserir item no
-- meio desalinha a comparação por posição).
create table public.ai_quality_metrics (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  version integer not null,
  interpretation_id uuid references public.ai_interpretations (id) on delete set null,
  items_from_ai integer not null,
  items_emitted integer not null,
  items_added integer not null,
  items_removed integer not null,
  items_unchanged integer not null,
  items_changed integer not null,
  fields_changed integer not null,
  created_at timestamptz not null default now()
);

create index ai_quality_metrics_quote_id_idx on public.ai_quality_metrics (quote_id);

-- Mesma regra das outras tabelas de métrica: só o backend grava; a leitura
-- (Grafana) passa por view própria, criada no passo 2 desta fase.
alter table public.ai_quality_metrics enable row level security;
grant all on public.ai_quality_metrics to service_role;
