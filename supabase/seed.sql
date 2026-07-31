-- Local development seed data. Never run against a real/production project.
--
-- Creates one test user/organization/customer/quote so the interpret-quote
-- Edge Function (and future flows) can be exercised end to end locally.
-- Test user: test@orcaai.local / orcaai-local-test

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, reauthentication_token, email_change_token_current
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'test@orcaai.local',
  crypt('orcaai-local-test', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  jsonb_build_object('sub', '11111111-1111-4111-8111-111111111111', 'email', 'test@orcaai.local'),
  'email',
  now(),
  now(),
  now()
);

insert into public.organizations (id, owner_user_id, trade_name)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'Pintura do Zé (teste local)'
);

insert into public.organization_members (organization_id, user_id, role, status)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'owner',
  'active'
);

insert into public.customers (id, organization_id, name)
values (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  'Dona Maria'
);

-- Mensagem de exemplo do próprio docs/PRD.md §4.
insert into public.quotes (id, organization_id, customer_id, status, source_text)
values (
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  'rascunho',
  'Pintura da casa da dona Maria, duas demãos nas paredes da sala e dos 3 quartos. Material por conta dela. Mão de obra 2800, metade na entrada e o restante quando terminar. Leva uns 5 dias. Validade 10 dias.'
);
