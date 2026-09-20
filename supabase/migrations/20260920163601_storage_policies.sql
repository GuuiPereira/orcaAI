-- Policies de Storage pros buckets privados (docs/ARCHITECTURE.md §9,
-- .tasks/fase-2-mvp-fechado.md task 6). Os buckets em si já são criados
-- declarativamente por `supabase/config.toml` ([storage.buckets.*]) - esta
-- migração só cuida do isolamento entre organizações.
--
-- Convenção de caminho, igual nos dois buckets: o primeiro segmento é o
-- `organization_id` (`storage.foldername(name)[1]`), o que permite checar
-- posse com o mesmo `is_org_member()` já usado nas tabelas, sem precisar de
-- uma tabela auxiliar de metadados do objeto.

-- logos/{organization_id}/logo.{ext} - 1 logo por organização, sobrescrito
-- a cada troca (upload usa upsert). Delete permitido pra quem quiser
-- remover o logo sem subir outro no lugar.
create policy "logos_all_member" on storage.objects
  for all using (
    bucket_id = 'logos'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'logos'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );

-- quote-pdfs/{organization_id}/{quote_id}/{version}.pdf - só leitura e
-- inserção; sem update/delete, pra combinar com a imutabilidade de
-- `quote_versions` (regra de negócio 3) - cada versão tem um caminho
-- próprio, então nunca há necessidade legítima de sobrescrever um já
-- existente.
create policy "quote_pdfs_select_member" on storage.objects
  for select using (
    bucket_id = 'quote-pdfs'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );

create policy "quote_pdfs_insert_member" on storage.objects
  for insert with check (
    bucket_id = 'quote-pdfs'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );
