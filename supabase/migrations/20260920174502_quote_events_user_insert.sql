-- Permite que o próprio membro registre alguns eventos em `quote_events`
-- direto pela API (sem função privilegiada) - docs/ARCHITECTURE.md §7: "CRUD
-- simples... pode usar a API do Supabase protegida por RLS. Operações que
-- envolvem segredo, numeração, IA ou emissão passam por função." Marcar um
-- orçamento como criado/enviado/aprovado/recusado/expirado não é nenhuma
-- dessas coisas - é só um registro de auditoria (RF-074), diferente de
-- "emitido"/"reemitido" (task 4), que continuam só via `issue-quote`
-- (service role), porque esses sim têm peso semântico ligado à numeração e
-- ao versionamento de verdade.
--
-- `with check` restringe os tipos de evento que essa policy aceita - o
-- `event_type` da tabela continua livre de CHECK constraint (não é o lugar
-- certo pra essa regra, já que `emitido`/`reemitido` também passam por
-- `event_type` mas só pelo caminho do service role, que ignora RLS).
create policy "quote_events_insert_member" on public.quote_events
  for insert
  with check (
    event_type in ('criado', 'enviado', 'aprovado', 'recusado', 'expirado')
    and exists (
      select 1 from public.quotes q
      where q.id = quote_events.quote_id
        and public.is_org_member(q.organization_id)
    )
  );

grant insert on public.quote_events to authenticated;
