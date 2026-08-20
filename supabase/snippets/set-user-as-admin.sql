-- QUIL-37: roles are assigned through app metadata, not user metadata.
-- Prefer the admin-only RPC when running as an authenticated admin:
--
--   select public.set_user_roles(
--     '<existing-auth-user-uuid>',
--     array['admin']::text[]
--   );
--
-- For first-admin bootstrap/manual maintenance, run the block below as the
-- database owner after replacing NULL below with an existing Auth user UUID.
-- It fails and rolls back if the target or synchronized profile does not exist.

do $$
declare
  target_user_id constant uuid := null; -- Replace NULL with '<auth-user-uuid>'.
  target_email text;
  synchronized_roles text[];
begin
  if target_user_id is null then
    raise exception 'Replace target_user_id with an existing Auth user UUID';
  end if;

  update auth.users
  set raw_app_meta_data = jsonb_set(
    public.profile_app_metadata_object(raw_app_meta_data),
    '{roles}',
    '["admin"]'::jsonb,
    true
  )
  where id = target_user_id
  returning email into target_email;

  if not found then
    raise exception 'Auth user % does not exist', target_user_id;
  end if;

  select roles
  into synchronized_roles
  from public.profiles
  where id = target_user_id;

  if not found or synchronized_roles is distinct from array['admin']::text[] then
    raise exception 'Profile role synchronization failed for Auth user %', target_user_id;
  end if;

  raise notice 'Assigned admin role to % (%)', target_email, target_user_id;
end;
$$;
