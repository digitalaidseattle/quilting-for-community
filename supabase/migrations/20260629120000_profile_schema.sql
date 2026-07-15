-- QUIL-38: Profile schema for Supabase-authenticated users.
-- Profiles are keyed by auth.users.id so auth.uid() can map directly to a profile.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);

-- no grants for anon
grant select, update on public.profiles to service_role, authenticated;

alter table public.profiles
  add column if not exists name text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists roles text[] default '{}'::text[],
  add column if not exists waiver_accepted boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists created_by text,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists updated_by text;

update public.profiles
set
  roles = coalesce(roles, '{}'::text[]),
  waiver_accepted = coalesce(waiver_accepted, false),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.profiles
  alter column roles set default '{}'::text[],
  alter column roles set not null,
  alter column waiver_accepted set default false,
  alter column waiver_accepted set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
    array(
      select jsonb_array_elements_text(
        case
          when jsonb_typeof(coalesce(new.raw_user_meta_data, '{}'::jsonb)->'roles') = 'array'
            then coalesce(new.raw_user_meta_data, '{}'::jsonb)->'roles'
          else '[]'::jsonb
        end
      )
    ),
    new.email,
    new.email
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = coalesce(public.profiles.name, excluded.name),
    first_name = coalesce(public.profiles.first_name, excluded.first_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    roles = case
      when coalesce(new.raw_user_meta_data, '{}'::jsonb) ? 'roles'
        and jsonb_typeof(new.raw_user_meta_data->'roles') = 'array'
        then excluded.roles
      else public.profiles.roles
    end,
    updated_at = now(),
    updated_by = excluded.updated_by;

  return new;
end;
$$;

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_profile_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_updated on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create trigger on_auth_user_updated
after update of email, raw_user_meta_data on auth.users
for each row
execute function public.handle_new_user();

commit;
