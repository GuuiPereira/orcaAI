-- Numeração transacional de orçamentos por organização/ano
-- (docs/ARCHITECTURE.md §8, .tasks/fase-2-mvp-fechado.md task 4).

create table public.organization_quote_counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  year integer not null,
  last_number integer not null default 0,
  primary key (organization_id, year)
);

alter table public.organization_quote_counters enable row level security;

-- Só a function abaixo (security definer) escreve aqui; membros só podem ler,
-- pra não conseguirem pular/reservar número direto pela API.
create policy "organization_quote_counters_select_member"
  on public.organization_quote_counters
  for select using (public.is_org_member(organization_id));

grant select on public.organization_quote_counters to authenticated;

-- Incrementa e devolve o próximo número no formato "AAAA-NNNN" (ex.: 2026-0042).
-- O `insert ... on conflict do update ... returning` é atômico por linha -
-- concorrência não perde incremento nem repete número. security definer pra
-- poder escrever no contador sem dar insert/update direto pro authenticated
-- (só quem chama esta function consegue avançar o contador).
create function public.next_quote_number(target_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year integer := extract(year from now())::integer;
  next_number integer;
begin
  if not public.is_org_member(target_org_id) then
    raise exception 'not a member of organization %', target_org_id;
  end if;

  insert into public.organization_quote_counters (organization_id, year, last_number)
  values (target_org_id, current_year, 1)
  on conflict (organization_id, year)
    do update set last_number = organization_quote_counters.last_number + 1
  returning last_number into next_number;

  return current_year || '-' || lpad(next_number::text, 4, '0');
end;
$$;

grant execute on function public.next_quote_number(uuid) to authenticated;
grant all on public.organization_quote_counters to service_role;
