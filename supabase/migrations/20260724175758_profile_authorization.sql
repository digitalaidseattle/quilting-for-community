-- QUIL-37: Profile authorization and canonical role source.
--
-- Role source of truth:
--   * Canonical roles live in auth.users.raw_app_meta_data.roles so clients
--     cannot self-assign authorization roles through user metadata.
--   * public.profiles.roles is retained as a read/display cache only.
--   * Role assignment must go through public.set_user_roles(...), which updates
--     auth app metadata and the profile cache together.

begin;

comment on column public.profiles.roles is
  'Read-only synchronized cache of auth.users.raw_app_meta_data.roles; change roles with public.set_user_roles(uuid, text[]).';

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------

create or replace function public.profile_allowed_roles()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['participant', 'volunteer', 'instructor', 'admin']::text[];
$$;

create or replace function public.profile_app_metadata_object(metadata jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(metadata) = 'object' then metadata
    else '{}'::jsonb
  end;
$$;

create or replace function public.normalize_profile_roles(input_roles text[])
returns text[]
language plpgsql
stable
set search_path = public
as $$
declare
  normalized_roles text[];
  invalid_roles text[];
begin
  select coalesce(array_agg(distinct normalized_role order by normalized_role), '{}'::text[])
  into normalized_roles
  from (
    select lower(trim(raw_role)) as normalized_role
    from unnest(coalesce(input_roles, '{}'::text[])) as roles(raw_role)
    where nullif(trim(raw_role), '') is not null
  ) role_values;

  select coalesce(array_agg(role_value order by role_value), '{}'::text[])
  into invalid_roles
  from unnest(normalized_roles) as roles(role_value)
  where not role_value = any(public.profile_allowed_roles());

  if array_length(invalid_roles, 1) is not null then
    raise exception 'Invalid profile roles: %', array_to_string(invalid_roles, ', ')
      using errcode = '22023';
  end if;

  return normalized_roles;
end;
$$;

create or replace function public.profile_roles_from_jsonb(metadata jsonb)
returns text[]
language sql
stable
set search_path = public
as $$
  with role_source as (
    select case
      when jsonb_typeof(coalesce(metadata, '{}'::jsonb)->'roles') = 'array'
        then coalesce(metadata, '{}'::jsonb)->'roles'
      else '[]'::jsonb
    end as roles_json
  ),
  normalized_roles as (
    select lower(trim(role_values.value)) as role_value
    from role_source,
      jsonb_array_elements_text(role_source.roles_json) as role_values(value)
    where nullif(trim(role_values.value), '') is not null
  )
  select coalesce(array_agg(distinct role_value order by role_value), '{}'::text[])
  from normalized_roles
  where role_value = any(public.profile_allowed_roles());
$$;

create or replace function public.current_user_roles()
returns text[]
language sql
stable
set search_path = public
as $$
  select public.profile_roles_from_jsonb(coalesce(auth.jwt()->'app_metadata', '{}'::jsonb));
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select 'admin' = any(public.current_user_roles());
$$;

-- Normalize existing app metadata roles without trusting client-editable
-- raw_user_meta_data.roles. Accounts without a supported canonical role become
-- participants so every account has at least one product role. Known admins
-- should be seeded through the admin-only RPC or a database-owner bootstrap
-- script.
with parsed_roles as (
  select
    id,
    public.profile_roles_from_jsonb(raw_app_meta_data) as roles
  from auth.users
),
candidate_roles as (
  select
    id,
    case
      when cardinality(roles) = 0 then array['participant']::text[]
      else roles
    end as roles
  from parsed_roles
)
update auth.users as users
set raw_app_meta_data = jsonb_set(
  public.profile_app_metadata_object(users.raw_app_meta_data),
  '{roles}',
  to_jsonb(candidate_roles.roles),
  true
)
from candidate_roles
where users.id = candidate_roles.id
  and (
    jsonb_typeof(coalesce(users.raw_app_meta_data, '{}'::jsonb)->'roles') is distinct from 'array'
    or (users.raw_app_meta_data->'roles') is distinct from to_jsonb(candidate_roles.roles)
  );

-- Sync the display/cache copy after the app metadata backfill.
update public.profiles as profiles
set
  roles = public.profile_roles_from_jsonb(users.raw_app_meta_data),
  updated_at = now(),
  updated_by = coalesce(users.email, profiles.updated_by)
from auth.users as users
where profiles.id = users.id
  and profiles.roles is distinct from public.profile_roles_from_jsonb(users.raw_app_meta_data);

-- ---------------------------------------------------------------------------
-- Auth/profile sync
-- ---------------------------------------------------------------------------

create or replace function public.initialize_auth_user_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_roles text[];
begin
  normalized_roles := public.profile_roles_from_jsonb(new.raw_app_meta_data);

  if cardinality(normalized_roles) = 0 then
    normalized_roles := array['participant']::text[];
  end if;

  new.raw_app_meta_data := jsonb_set(
    public.profile_app_metadata_object(new.raw_app_meta_data),
    '{roles}',
    to_jsonb(normalized_roles),
    true
  );

  return new;
end;
$$;

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
  on conflict (id) do update
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

drop trigger if exists on_auth_user_initialize_roles on auth.users;

create trigger on_auth_user_initialize_roles
before insert on auth.users
for each row
execute function public.initialize_auth_user_roles();

drop trigger if exists on_auth_user_updated on auth.users;

create trigger on_auth_user_updated
after update of email, raw_user_meta_data, raw_app_meta_data, last_sign_in_at on auth.users
for each row
when (
  old.email is distinct from new.email
  or old.raw_user_meta_data is distinct from new.raw_user_meta_data
  or old.raw_app_meta_data is distinct from new.raw_app_meta_data
  or old.last_sign_in_at is distinct from new.last_sign_in_at
)
execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Profile write guards/RPC
-- ---------------------------------------------------------------------------

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
  new.updated_at := now();
  new.updated_by := coalesce(actor, new.updated_by, old.updated_by);
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
  where users.id = new.id;

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
    if old.id is distinct from new.id then
      raise exception 'Profile id cannot be changed'
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

drop trigger if exists profiles_enforce_role_management on public.profiles;

create trigger profiles_enforce_role_management
before insert or update on public.profiles
for each row
execute function public.enforce_profile_role_management();

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
    normalized_roles,
    actor,
    actor
  from auth.users as users
  where users.id = target_user_id
  on conflict (id) do update
  set
    email = excluded.email,
    roles = excluded.roles,
    updated_at = now(),
    updated_by = actor
  returning * into updated_profile;

  return updated_profile;
end;
$$;

revoke execute on function public.set_user_roles(uuid, text[]) from public;
grant execute on function public.set_user_roles(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Profile RLS policies
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

revoke all privileges on table public.profiles, public.events, public.event_sessions
  from public, anon, authenticated;

grant usage on schema public to authenticated, service_role;
grant select on public.profiles to authenticated;
grant update (name, first_name, last_name, phone, waiver_accepted)
  on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.events to authenticated, service_role;
grant select, insert, update, delete on public.event_sessions to authenticated, service_role;

drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_insert_admin on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists profiles_delete_admin on public.profiles;

create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;
