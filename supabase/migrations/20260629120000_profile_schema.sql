-- QUIL-38: Profile schema for Supabase-authenticated users.
-- Profiles are keyed by auth.users.id so auth.uid() can map directly to a profile.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);

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
    new.email,
    new.email
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = coalesce(public.profiles.name, excluded.name),
    first_name = coalesce(public.profiles.first_name, excluded.first_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    updated_at = now(),
    updated_by = excluded.updated_by;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

commit;
