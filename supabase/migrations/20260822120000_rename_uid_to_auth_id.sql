-- Rename profiles.uid to profiles.auth_id, and fix functions/policies that
-- were accidentally left comparing/writing profiles.id (the surrogate PK)
-- instead of the auth-linked column since 20260724175758_profile_authorization.sql.

begin;

alter table public.profiles rename column uid to auth_id;
alter table public.profiles rename constraint uq_profiles_uid to uq_profiles_auth_id;
alter table public.profiles rename constraint profiles_uid_fkey to profiles_auth_id_fkey;

-- these policies (from 20260724075350_profiles_permissions.sql) are superseded
-- by the policies in 20260724175758_profile_authorization.sql once those are
-- fixed below
drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists profiles_non_admin_read on public.profiles;
drop policy if exists profiles_non_admin_self_update on public.profiles;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_login_only_update boolean := false;
begin
  if tg_op = 'UPDATE' then
    is_login_only_update := old.email is not distinct from new.email
      and old.raw_user_meta_data is not distinct from new.raw_user_meta_data
      and old.raw_app_meta_data is not distinct from new.raw_app_meta_data;
  end if;

  -- flag this as a trusted sync write so set_profile_updated_at() lets the
  -- upsert below sync email even for an already-linked profile.
  perform set_config('app.profiles_email_sync', 'true', true);

  insert into public.profiles (
    auth_id,  -- note auth_id here gets auth.users.id
    email,
    name,
    first_name,
    last_name,
    roles,
    created_by,
    updated_by
  )
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(trim(concat_ws(' ', new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name')), ''),
      new.email
    ),
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
    public.profile_roles_from_jsonb(new.raw_app_meta_data),
    new.email,
    new.email
  )
  on conflict (auth_id) do update
  set
    email = excluded.email,
    name = coalesce(public.profiles.name, excluded.name),
    first_name = coalesce(public.profiles.first_name, excluded.first_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    roles = excluded.roles,
    updated_at = now(),
    updated_by = excluded.updated_by
  where not is_login_only_update;

  return new;
end;
$$;

create or replace function public.enforce_profile_role_management()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical_roles text[];
begin
  new.roles := public.normalize_profile_roles(new.roles);

  select public.profile_roles_from_jsonb(users.raw_app_meta_data)
  into canonical_roles
  from auth.users as users
  where users.id = new.auth_id;

  canonical_roles := coalesce(canonical_roles, '{}'::text[]);

  if tg_op = 'INSERT' then
    if coalesce(new.roles, '{}'::text[]) <> '{}'::text[]
      and new.roles is distinct from canonical_roles then
      raise exception 'Profile roles are managed through public.set_user_roles()'
        using errcode = '42501';
    end if;

    new.roles := canonical_roles;
  end if;

  if tg_op = 'UPDATE' then
    -- allow null <-> value transitions (FK `on delete set null` cascade, and
    -- possible future linking of a login-less profile to an auth user); 
    -- only block reassigning an already-linked profile to a different auth user.
    if old.auth_id is not null and new.auth_id is not null
      and old.auth_id is distinct from new.auth_id then
      raise exception 'Profile auth_id cannot be reassigned'
        using errcode = '42501';
    end if;

    if old.roles is distinct from new.roles
      and new.roles is distinct from canonical_roles then
      raise exception 'Profile roles are managed through public.set_user_roles()'
        using errcode = '42501';
    end if;

    new.roles := canonical_roles;
  end if;

  return new;
end;
$$;

create or replace function public.set_user_roles(target_user_id uuid, new_roles text[])
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_roles text[];
  actor text := coalesce(auth.jwt()->>'email', auth.uid()::text);
  actor_is_admin boolean;
  updated_profile public.profiles%rowtype;
begin
  select exists (
    select 1
    from auth.users as users
    where users.id = auth.uid()
      and 'admin' = any(public.profile_roles_from_jsonb(users.raw_app_meta_data))
  )
  into actor_is_admin;

  if not actor_is_admin then
    raise exception 'Only administrators can assign user roles'
      using errcode = '42501';
  end if;

  normalized_roles := public.normalize_profile_roles(new_roles);

  if cardinality(normalized_roles) = 0 then
    raise exception 'At least one profile role is required'
      using errcode = '22023';
  end if;

  update auth.users
  set raw_app_meta_data = jsonb_set(
    public.profile_app_metadata_object(raw_app_meta_data),
    '{roles}',
    to_jsonb(normalized_roles),
    true
  )
  where id = target_user_id;

  if not found then
    raise exception 'User % not found', target_user_id
      using errcode = 'P0002';
  end if;

  -- same trusted-sync flag as handle_new_user(); this upsert also syncs
  -- email for an already-linked profile via `on conflict (auth_id) do update`.
  perform set_config('app.profiles_email_sync', 'true', true);

  insert into public.profiles (
    auth_id,  -- note auth_id here
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
    normalized_roles,
    actor,
    actor
  from auth.users as users
  where users.id = target_user_id
  on conflict (auth_id) do update
  set
    email = excluded.email,
    roles = excluded.roles,
    updated_at = now(),
    updated_by = actor
  returning * into updated_profile;

  return updated_profile;
end;
$$;

-- email mirrors auth.users.email for linked profiles (synced by handle_new_user
-- on specific auth.users updates); direct edits to it would just be silently
-- overwritten later, so only allow them for login-less profiles.
create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor text := coalesce(auth.jwt()->>'email', auth.uid()::text);
begin
  new.created_at := old.created_at;
  new.created_by := old.created_by;

  if old.auth_id is not null
    and coalesce(current_setting('app.profiles_email_sync', true), '') <> 'true' then
    new.email := old.email;
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(actor, new.updated_by, old.updated_by);
  return new;
end;
$$;

-- allow admins to update email for login-less profiles
grant update (email) on public.profiles to authenticated;

-- allow admins to create login-less profiles through the client
grant insert (name, first_name, last_name, email, phone, waiver_accepted)
  on public.profiles to authenticated;

create policy profiles_insert_admin on public.profiles
  for insert
  to authenticated
  with check (public.is_admin());

alter policy profiles_select_own_or_admin on public.profiles
  using (auth_id = auth.uid() or public.is_admin());

alter policy profiles_update_own on public.profiles
  using (auth_id = auth.uid())
  with check (auth_id = auth.uid());

-- Reapply the roles backfill with the corrected join; this is a data update
-- so it must run again since a previous migration already
-- applied its (incorrect) profiles.id = users.id join.
update public.profiles as profiles
set
  roles = public.profile_roles_from_jsonb(users.raw_app_meta_data),
  updated_at = now(),
  updated_by = coalesce(users.email, profiles.updated_by)
from auth.users as users
where profiles.auth_id = users.id
  and profiles.roles is distinct from public.profile_roles_from_jsonb(users.raw_app_meta_data);

commit;
