-- Exclusão de conta (RF-007, RNF-014, Task 7 da Fase 2).
--
-- Fluxo com prazo: o usuário pede a exclusão, a conta fica "agendada" por 7
-- dias (pode cancelar e voltar) e uma rotina agendada apaga tudo depois. Esta
-- tabela é o estado do pedido; quem grava é sempre uma Edge Function
-- (service role) - o usuário só enxerga o próprio pedido, pro app mostrar
-- "sua conta será excluída em dd/mm" e oferecer o cancelamento.
create table public.account_deletion_requests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null
);

create index account_deletion_requests_scheduled_for_idx
  on public.account_deletion_requests (scheduled_for);

alter table public.account_deletion_requests enable row level security;

create policy "account_deletion_requests_select_own" on public.account_deletion_requests
  for select using (user_id = auth.uid());

grant select on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;

-- Sem isto, apagar o usuário do Auth falha se ele autorizou alguma versão ou
-- evento (FK "no action"). Com `set null` o registro fica e só perde a
-- autoria - o que também é o que queremos pra anonimizar (o ID do usuário é
-- dado pessoal). Vale pro caso futuro de equipes (Fase 4C): quem sai da
-- empresa não deve apagar o histórico dos outros.
alter table public.quote_versions
  drop constraint quote_versions_created_by_fkey,
  add constraint quote_versions_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;

alter table public.quote_events
  drop constraint quote_events_actor_user_id_fkey,
  add constraint quote_events_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users (id) on delete set null;
