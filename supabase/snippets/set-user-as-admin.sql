-- QUIL-37: roles are assigned through app metadata, not user metadata.
-- Prefer the admin-only RPC when running as an authenticated admin:
--
--   select public.set_user_roles(
--     '2cfdb388-6c5a-4c4b-b8a5-836552a7c061',
--     array['admin']::text[]
--   );
--
-- For local bootstrap/manual maintenance as a database owner, update app
-- metadata; the auth-user update trigger syncs the profile cache.

begin;

update auth.users
set raw_app_meta_data = jsonb_set(
  coalesce(raw_app_meta_data, '{}'::jsonb),
  '{roles}',
  '["admin"]'::jsonb,
  true
)
where id = '2cfdb388-6c5a-4c4b-b8a5-836552a7c061';

insert into public.profiles (
  id,
  email,
  name,
  first_name,
  last_name,
  roles,
  created_by,
  updated_by
)
select
  users.id,
  users.email,
  coalesce(
    nullif(users.raw_user_meta_data->>'name', ''),
    nullif(trim(concat_ws(' ', users.raw_user_meta_data->>'first_name', users.raw_user_meta_data->>'last_name')), ''),
    users.email
  ),
  nullif(users.raw_user_meta_data->>'first_name', ''),
  nullif(users.raw_user_meta_data->>'last_name', ''),
  public.profile_roles_from_jsonb(users.raw_app_meta_data),
  users.email,
  users.email
from auth.users as users
where users.id = '2cfdb388-6c5a-4c4b-b8a5-836552a7c061'
on conflict (id) do update
set
  email = excluded.email,
  roles = excluded.roles,
  updated_at = now(),
  updated_by = excluded.updated_by;

commit;
