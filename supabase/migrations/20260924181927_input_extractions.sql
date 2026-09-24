-- Fase 4A (.tasks/fase-4-evolucoes.md): registro de cada extração de texto a
-- partir de áudio ou imagem (função `extract-input`). Só metadados de
-- operação - NUNCA o áudio, a imagem nem o texto extraído (RNF-008): o
-- conteúdo não é guardado em lugar nenhum do nosso lado.
--
-- Serve pra (1) limitar abuso por organização/dia, (2) medir custo e latência
-- (Fase 5 - Grafana) e (3) enxergar falhas. `estimated_cost_cents` é numeric
-- porque uma extração custa frações de centavo (uma imagem ~0,02, 2 min de
-- áudio ~0,9) e arredondar pra inteiro apagaria isso das métricas.
create table public.input_extractions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Quem pediu: dado pessoal, some da linha (não a linha) se a conta for
  -- excluída - mesma lógica de quote_events.actor_user_id.
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('audio', 'image')),
  model text not null,
  prompt_version text,
  -- Áudio: segundos (medidos pelo provedor). Imagem: quantidade de imagens.
  units integer,
  input_bytes integer,
  estimated_cost_cents numeric,
  latency_ms integer,
  status text not null check (status in ('concluido', 'falhou')),
  -- Código curto e fixo (ex.: 'openai_http_429', 'no_text'), nunca conteúdo.
  error text,
  created_at timestamptz not null default now()
);

create index input_extractions_org_created_idx
  on public.input_extractions (organization_id, created_at);

-- Sem policy pra `authenticated`: só a Edge Function (service role) lê/escreve.
alter table public.input_extractions enable row level security;
grant all on public.input_extractions to service_role;
