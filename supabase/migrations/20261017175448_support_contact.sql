-- Contato de suporte configurável pelo painel admin (pedido do usuário,
-- 2026-10-17). Usado pelo app na seção "Ajuda" do Perfil, na tela de conta
-- suspensa e nos avisos de plano ("fale com a gente para assinar"). Trocar o
-- número/e-mail não exige deploy nem update do app.

create table public.support_settings (
  id boolean primary key default true check (id),
  -- Só dígitos, com DDI e DDD (ex.: 5511999998888) - vira o link wa.me.
  whatsapp text check (whatsapp ~ '^[0-9]{10,15}$'),
  email text check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  updated_at timestamptz not null default now()
);

insert into public.support_settings (id) values (true);

-- Ninguém lê a tabela direto; o app usa get_support_contact() e o admin
-- grava por admin_set_support_contact().
alter table public.support_settings enable row level security;
revoke all on public.support_settings from public, anon, authenticated;
grant select on public.support_settings to service_role;

-- Qualquer usuário logado lê o contato (inclusive a conta suspensa ou com
-- exclusão agendada - é justamente quem mais precisa dele).
create function public.get_support_contact()
returns table (whatsapp text, email text)
language sql
security definer
set search_path = public
stable
as $$
  select s.whatsapp, s.email from public.support_settings s;
$$;

revoke all on function public.get_support_contact() from public, anon;
grant execute on function public.get_support_contact() to authenticated;

alter table public.admin_actions drop constraint admin_actions_action_check;
alter table public.admin_actions add constraint admin_actions_action_check check (
  action in ('set_limits', 'suspend', 'reactivate', 'unstick_interpretation', 'set_plan', 'set_signup_plan',
             'set_support_contact')
);

-- null/vazio = sem aquele canal (o app esconde o botão).
create function public.admin_set_support_contact(whatsapp text, email text, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous jsonb;
  new_whatsapp text := nullif(btrim(admin_set_support_contact.whatsapp), '');
  new_email text := nullif(lower(btrim(admin_set_support_contact.email)), '');
begin
  perform public.assert_platform_admin();
  if reason is null or char_length(btrim(reason)) not between 3 and 500 then
    raise exception 'reason must have 3 to 500 characters' using errcode = 'PT400';
  end if;
  if new_whatsapp is not null and new_whatsapp !~ '^[0-9]{10,15}$' then
    raise exception 'invalid whatsapp' using errcode = 'PT400';
  end if;
  if new_email is not null and new_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email' using errcode = 'PT400';
  end if;

  select jsonb_build_object('whatsapp', s.whatsapp, 'email', s.email) into previous from public.support_settings s;

  update public.support_settings
     set whatsapp = new_whatsapp, email = new_email, updated_at = now()
   -- uma linha só, mas o Supabase recusa UPDATE sem WHERE (safeupdate)
   where id;

  insert into public.admin_actions (admin_user_id, action, organization_id, reason, details)
  values (auth.uid(), 'set_support_contact', null, btrim(reason),
          jsonb_build_object('whatsapp', new_whatsapp, 'email', new_email, 'previous', previous));
end;
$$;

revoke all on function public.admin_set_support_contact(text, text, text) from public, anon;
grant execute on function public.admin_set_support_contact(text, text, text) to authenticated;
