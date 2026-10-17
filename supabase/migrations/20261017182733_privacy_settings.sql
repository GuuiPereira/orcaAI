-- Dados do responsável que entram no texto da política de privacidade
-- (pedido do usuário, 2026-10-17: configuráveis no painel admin, como o
-- contato de suporte). O texto em si é versionado no código
-- (packages/shared/src/legal/privacy-policy.ts); aqui ficam só os campos.

create table public.privacy_settings (
  id boolean primary key default true check (id),
  controller_name text check (char_length(controller_name) between 2 and 200),
  -- Opcional: a LGPD pede identificação e contato do controlador, não a
  -- publicação do CPF de uma pessoa física.
  controller_document text check (controller_document ~ '^[0-9./-]{11,18}$'),
  privacy_email text check (privacy_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- A LGPD (art. 19, II) fala em até 15 dias para a declaração completa.
  response_days integer check (response_days between 1 and 15),
  updated_at timestamptz not null default now()
);

insert into public.privacy_settings (id) values (true);

alter table public.privacy_settings enable row level security;
revoke all on public.privacy_settings from public, anon, authenticated;
grant select on public.privacy_settings to service_role;

-- Público de propósito (anon também): a política abre na tela de login, antes
-- de entrar, e esses dados são justamente o que a lei manda divulgar.
create function public.get_privacy_settings()
returns table (controller_name text, controller_document text, privacy_email text, response_days integer)
language sql
security definer
set search_path = public
stable
as $$
  select p.controller_name, p.controller_document, p.privacy_email, p.response_days from public.privacy_settings p;
$$;

revoke all on function public.get_privacy_settings() from public;
grant execute on function public.get_privacy_settings() to anon, authenticated;

alter table public.admin_actions drop constraint admin_actions_action_check;
alter table public.admin_actions add constraint admin_actions_action_check check (
  action in ('set_limits', 'suspend', 'reactivate', 'unstick_interpretation', 'set_plan', 'set_signup_plan',
             'set_support_contact', 'set_privacy_settings')
);

-- Vazio = campo não preenchido (o texto mostra "(a definir)").
create function public.admin_set_privacy_settings(
  controller_name text,
  controller_document text,
  privacy_email text,
  response_days integer,
  reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous jsonb;
  new_name text := nullif(btrim(admin_set_privacy_settings.controller_name), '');
  new_document text := nullif(btrim(admin_set_privacy_settings.controller_document), '');
  new_email text := nullif(lower(btrim(admin_set_privacy_settings.privacy_email)), '');
begin
  perform public.assert_platform_admin();
  if reason is null or char_length(btrim(reason)) not between 3 and 500 then
    raise exception 'reason must have 3 to 500 characters' using errcode = 'PT400';
  end if;
  if new_name is not null and char_length(new_name) not between 2 and 200 then
    raise exception 'invalid controller name' using errcode = 'PT400';
  end if;
  if new_document is not null and new_document !~ '^[0-9./-]{11,18}$' then
    raise exception 'invalid document' using errcode = 'PT400';
  end if;
  if new_email is not null and new_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email' using errcode = 'PT400';
  end if;
  if admin_set_privacy_settings.response_days is not null
     and admin_set_privacy_settings.response_days not between 1 and 15 then
    raise exception 'invalid response days' using errcode = 'PT400';
  end if;

  select jsonb_build_object('controller_name', p.controller_name, 'controller_document', p.controller_document,
                            'privacy_email', p.privacy_email, 'response_days', p.response_days)
    into previous from public.privacy_settings p;

  update public.privacy_settings
     set controller_name = new_name,
         controller_document = new_document,
         privacy_email = new_email,
         response_days = admin_set_privacy_settings.response_days,
         updated_at = now()
   -- uma linha só, mas o Supabase recusa UPDATE sem WHERE (safeupdate)
   where id;

  insert into public.admin_actions (admin_user_id, action, organization_id, reason, details)
  values (auth.uid(), 'set_privacy_settings', null, btrim(reason), jsonb_build_object(
    'controller_name', new_name, 'controller_document', new_document, 'privacy_email', new_email,
    'response_days', admin_set_privacy_settings.response_days, 'previous', previous));
end;
$$;

revoke all on function public.admin_set_privacy_settings(text, text, text, integer, text) from public, anon;
grant execute on function public.admin_set_privacy_settings(text, text, text, integer, text) to authenticated;
