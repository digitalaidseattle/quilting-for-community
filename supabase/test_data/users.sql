-- Local development login accounts. Loaded via db.seed in config.toml on `supabase db reset`.
-- LOCAL ONLY: these are throwaway credentials, never run this against a deployed project.
--
--   admin@example.com  / password123  -> roles ["admin"], full admin UI access
--   member@example.com / password123  -> roles ["participant"], signs in but AuthGate blocks /admin routes

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000',
  dev_user.id,
  'authenticated',
  'authenticated',
  dev_user.email,
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(),
  jsonb_build_object(
    'provider', 'email',
    'providers', jsonb_build_array('email'),
    'roles', dev_user.roles
  ),
  jsonb_build_object(
    'name', dev_user.name,
    'first_name', dev_user.first_name,
    'last_name', dev_user.last_name,
    'email_verified', true
  ),
  now(),
  now(),
  '',
  '',
  '',
  '',
  '',
  ''
from (
  values
    (
      'a0000000-0000-4000-8000-000000000001'::uuid,
      'admin@example.com',
      'Ada Admin',
      'Ada',
      'Admin',
      '["admin"]'::jsonb
    ),
    (
      'a0000000-0000-4000-8000-000000000002'::uuid,
      'member@example.com',
      'Mo Member',
      'Mo',
      'Member',
      '["participant"]'::jsonb
    )
) as dev_user(id, email, name, first_name, last_name, roles)
on conflict (id) do nothing;

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  u.id::text,
  u.id,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
from auth.users u
where u.email in ('admin@example.com', 'member@example.com')
on conflict (provider, provider_id) do nothing;
